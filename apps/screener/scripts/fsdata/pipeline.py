"""Fetch, merge, carry forward: from the two sources to the market.json document.

Nothing in here touches the disk or the network directly (sources and the price-file reader
are passed in), so the whole flow is testable. Writing is in writer.py.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Callable, Mapping

from . import MARKETS, SOURCE_LABEL
from .config import StockSpec, Universe
from .mapping import FIGURE_KEYS, FLAG_KEYS, TEXT_KEYS, RowError, map_tv_row, most_common_period, sma_set
from .sources import SourceError, TradingViewClient, YahooClient
from .util import clean_number, r2

log = logging.getLogger("fintools.pipeline")

DEFAULT_FAIL_SHARE = 0.5
DEFAULT_DAYS = 520  # trading days kept per price file
PRICE_MISMATCH = 0.25  # warn when Yahoo's last close and the screener price differ by more than this
CALENDAR_PER_TRADING_DAY = 1.6  # 520 trading days ~ 832 calendar days: enough for any exchange calendar


@dataclass
class MarketStatus:
    market: str
    total: int = 0
    tv_ok: int = 0
    yahoo_ok: int = 0
    carried: list[str] = field(default_factory=list)  # fundamentals kept from the previous file
    no_prices: list[str] = field(default_factory=list)  # Yahoo gave nothing
    dropped_columns: list[str] = field(default_factory=list)
    period: str | None = None
    failed: bool = False  # more than fail_share without screener data: the market keeps its previous data
    degraded: bool = False  # more than fail_share without Yahoo closes: written, but flagged
    reason: str = ""

    def summary(self) -> str:
        if self.failed:
            return f"{self.market}: FAILED, previous data kept ({self.reason})"
        parts = [f"{self.market}: {self.tv_ok}/{self.total} screener rows, {self.yahoo_ok}/{self.total} price series"]
        if self.carried:
            parts.append(f"carried forward: {', '.join(self.carried)}")
        if self.no_prices:
            parts.append(f"no closes: {', '.join(self.no_prices)}")
        if self.dropped_columns:
            parts.append(f"columns the screener did not know: {', '.join(self.dropped_columns)}")
        if self.degraded:
            parts.append("DEGRADED (Yahoo failed for most stocks)")
        return "; ".join(parts)


@dataclass
class RunResult:
    doc: dict[str, Any]
    prices: dict[str, dict[str, Any]]  # sid -> PriceSeries to write
    statuses: dict[str, MarketStatus]
    updated: bool  # at least one market got new data

    @property
    def exit_code(self) -> int:
        return 1 if any(s.failed or s.degraded for s in self.statuses.values()) else 0


# --- records ---------------------------------------------------------------------------------


def valid_doc(doc: Any) -> bool:
    return isinstance(doc, dict) and doc.get("schema") == 2 and isinstance(doc.get("stocks"), list)


def previous_records(doc: Any) -> dict[tuple[str, str], dict[str, Any]]:
    if not valid_doc(doc):
        if isinstance(doc, dict) and doc.get("schema") not in (None, 2):
            log.warning("previous market.json has schema %r, expected 2; its figures are not carried over", doc.get("schema"))
        return {}
    return {(s.get("market"), s.get("symbol")): s for s in doc["stocks"] if isinstance(s, dict)}


def carry(prev: Mapping[str, Any] | None) -> dict[str, Any]:
    """The figures of a previous record (None for anything missing or not a finite number)."""
    fig: dict[str, Any] = {k: clean_number(prev.get(k)) if prev else None for k in FIGURE_KEYS}
    for t in TEXT_KEYS:
        if prev and isinstance(prev.get(t), str) and prev[t]:
            fig[t] = prev[t]
    for flag in FLAG_KEYS:
        if prev and prev.get(flag) is True:
            fig[flag] = True
    return fig


def compose(spec: StockSpec, banks: Mapping[tuple[str, str], Mapping[str, Any]], fig: Mapping[str, Any]) -> dict[str, Any]:
    """One stock record in the field order of the committed file."""
    rec: dict[str, Any] = {
        "symbol": spec.symbol,
        "name": spec.name,
        "market": spec.market,
        "currency": spec.currency,
        "industry": spec.industry,
    }
    if spec.bank:
        rec["bank"] = True
    if spec.cyc is not None:
        rec["cyc"] = spec.cyc
    for key in ("price", "pe", "pb", "evEbitda", "peg", "netDebtEbitda", "marketCap", "ebitdaGrowth", "netIncomeGrowth"):
        rec[key] = fig.get(key)
    for key in ("ebitdaGrowthNote", "netIncomeGrowthNote"):
        if fig.get(key):
            rec[key] = fig[key]
    if fig.get("loss") is True and rec["pe"] is None:
        rec["loss"] = True
    for key in ("targetPrice", "sma20", "sma50", "sma200"):
        rec[key] = fig.get(key)
    if spec.usd:
        rec["usd"] = spec.usd
    if spec.note is not None:
        rec["note"] = spec.note
        rec["noteAsOf"] = spec.note_as_of
    if spec.bank:
        manual = banks.get((spec.market, spec.symbol), {})
        for key in ("npl", "car", "nim"):
            rec[key] = clean_number(manual.get(key))
    return rec


def assemble(
    universe: Universe,
    banks: Mapping[tuple[str, str], Mapping[str, Any]],
    figures: Mapping[tuple[str, str], Mapping[str, Any]],
    *,
    as_of: str,
    as_of_by: Mapping[str, str],
    source: str,
    period: Mapping[str, str],
) -> dict[str, Any]:
    return {
        "schema": 2,
        "asOf": as_of,
        "asOfBy": {m: as_of_by[m] for m in MARKETS if m in as_of_by},
        "source": source,
        "period": dict(period),
        "industries": {k: dict(v) for k, v in universe.industries.items()},
        "stocks": [compose(s, banks, figures.get((s.market, s.symbol)) or carry(None)) for s in universe.stocks],
    }


def keep_as_of_by(prev_doc: Any, markets: tuple[str, ...] = MARKETS) -> dict[str, str]:
    """The data time per market of the previous file.

    A file written before `asOfBy` existed has one `asOf`; it then counts for every market
    that has at least one stock with a price.
    """
    if not valid_doc(prev_doc):
        return {}
    by = prev_doc.get("asOfBy")
    if isinstance(by, dict):
        return {m: by[m] for m in markets if isinstance(by.get(m), str)}
    as_of = prev_doc.get("asOf")
    if not isinstance(as_of, str) or not as_of:
        return {}
    have = {s.get("market") for s in prev_doc["stocks"] if isinstance(s, dict) and clean_number(s.get("price")) is not None}
    return {m: as_of for m in markets if m in have}


def keep_period(prev_doc: Any, markets: tuple[str, ...] = MARKETS) -> dict[str, str]:
    p = prev_doc.get("period") if valid_doc(prev_doc) else None
    return {m: p[m] for m in markets if isinstance(p, dict) and isinstance(p.get(m), str)}


# --- price series ----------------------------------------------------------------------------


def merge_series(old: Mapping[str, Any] | None, new: list[tuple[str, float]], days: int) -> list[tuple[str, float]]:
    """Old closes plus new ones (new wins on the same day), the last `days` of them."""
    merged: dict[str, float] = {}
    if old and isinstance(old.get("dates"), list) and isinstance(old.get("closes"), list) and len(old["dates"]) == len(old["closes"]):
        for t, c in zip(old["dates"], old["closes"]):
            n = clean_number(c)
            if isinstance(t, str) and n is not None and n > 0:
                merged[t] = float(n)
    for t, c in new:
        merged[t] = float(c)
    return sorted(merged.items())[-days:]


def price_doc(spec: StockSpec, series: list[tuple[str, float]]) -> dict[str, Any]:
    return {
        "symbol": spec.symbol,
        "market": spec.market,
        "currency": spec.currency,
        "dates": [t for t, _ in series],
        "closes": [r2(c) for _, c in series],
    }


# --- the run ---------------------------------------------------------------------------------


def run_fetch(
    universe: Universe,
    banks: Mapping[tuple[str, str], Mapping[str, Any]],
    prev_doc: Any,
    load_prices: Callable[[str], Mapping[str, Any] | None],
    tv: TradingViewClient,
    yahoo: YahooClient,
    now: datetime,
    *,
    markets: tuple[str, ...] = MARKETS,
    fail_share: float = DEFAULT_FAIL_SHARE,
    days: int = DEFAULT_DAYS,
) -> RunResult:
    prev = previous_records(prev_doc)
    start = (now - timedelta(days=int(days * CALENDAR_PER_TRADING_DAY))).date()
    figures: dict[tuple[str, str], dict[str, Any]] = {key: carry(rec) for key, rec in prev.items()}
    period = keep_period(prev_doc)
    as_of_by = keep_as_of_by(prev_doc)
    now_iso = now.isoformat(timespec="seconds")
    prices: dict[str, dict[str, Any]] = {}
    statuses: dict[str, MarketStatus] = {}

    for market in markets:
        status = MarketStatus(market=market)
        statuses[market] = status
        specs = universe.market(market)
        status.total = len(specs)
        if not specs:
            continue
        got = _fetch_market(market, specs, prev, load_prices, tv, yahoo, start, fail_share, days, status)
        if got is None:
            continue  # failed: previous data and previous price files stay as they are
        market_figures, market_prices, market_period = got
        figures.update(market_figures)
        prices.update(market_prices)
        if market_period:
            period[market] = market_period
        as_of_by[market] = now_iso  # only the market that was fetched gets the new time

    updated = any(not s.failed and s.total for s in statuses.values())
    if updated:
        as_of, source = now_iso, SOURCE_LABEL
    else:
        as_of = prev_doc["asOf"] if valid_doc(prev_doc) and prev_doc.get("asOf") else now_iso
        source = prev_doc["source"] if valid_doc(prev_doc) and prev_doc.get("source") else SOURCE_LABEL
    doc = assemble(universe, banks, figures, as_of=as_of, as_of_by=as_of_by, source=source, period=period)
    for s in statuses.values():
        log.info(s.summary())
    return RunResult(doc=doc, prices=prices, statuses=statuses, updated=updated)


def _fetch_market(
    market: str,
    specs: list[StockSpec],
    prev: Mapping[tuple[str, str], Mapping[str, Any]],
    load_prices: Callable[[str], Mapping[str, Any] | None],
    tv: TradingViewClient,
    yahoo: YahooClient,
    start: date,
    fail_share: float,
    days: int,
    status: MarketStatus,
):
    # 1. fundamentals: one screener call for the market
    try:
        scan = tv.scan(market, [s.tv for s in specs])
    except SourceError as e:
        status.failed, status.reason = True, f"TradingView: {e}"
        log.error("%s: %s", market, status.reason)
        return None
    status.dropped_columns = list(scan.dropped)

    tv_figures: dict[str, dict[str, Any]] = {}
    period_ends = []
    for spec in specs:
        row, note = scan.find(spec.tv)
        if note:
            log.warning("%s %s: %s", market, spec.symbol, note)
        if row is None:
            continue
        try:
            fig = map_tv_row(spec, row)
        except RowError as e:
            log.warning("%s %s: screener row unusable (%s)", market, spec.symbol, e)
            continue
        period_ends.append(fig.pop("_period_end", None))
        tv_figures[spec.symbol] = fig
    status.tv_ok = len(tv_figures)
    if (status.total - status.tv_ok) / status.total > fail_share:
        status.failed = True
        status.reason = f"screener data for only {status.tv_ok} of {status.total} stocks (limit: more than {fail_share:.0%} missing)"
        log.error("%s: %s", market, status.reason)
        return None

    # 2. daily closes per stock; a failure here never stops the others
    figures: dict[tuple[str, str], dict[str, Any]] = {}
    price_docs: dict[str, dict[str, Any]] = {}
    for spec in specs:
        old_rec = prev.get((market, spec.symbol))
        fig = dict(tv_figures[spec.symbol]) if spec.symbol in tv_figures else carry(old_rec)
        if spec.symbol not in tv_figures:
            status.carried.append(spec.symbol)
            log.warning("%s %s: no screener data, fundamentals carried forward", market, spec.symbol)

        new_closes = yahoo.closes(spec.yf, start)
        if new_closes:
            status.yahoo_ok += 1
            merged = merge_series(load_prices(spec.sid), new_closes, days)
            price_docs[spec.sid] = price_doc(spec, merged)
            closes = [c for _, c in merged]
            seen = tv_figures.get(spec.symbol, {}).get("price")
            if seen and abs(closes[-1] / seen - 1) > PRICE_MISMATCH:
                log.warning(
                    "%s %s: last Yahoo close %.2f (%s) and screener price %.2f differ a lot; is %s the right symbol?",
                    market, spec.symbol, closes[-1], merged[-1][0], seen, spec.yf,
                )
            if spec.symbol not in tv_figures:
                fig["price"] = r2(closes[-1])  # same quantity as the screener's close
            for key, value in sma_set(closes).items():
                if value is not None:  # otherwise keep the screener's (or carried) value
                    fig[key] = value
        else:
            status.no_prices.append(spec.symbol)
        figures[(market, spec.symbol)] = fig

    status.degraded = (status.total - status.yahoo_ok) / status.total > fail_share
    if status.degraded:
        log.error("%s: Yahoo gave closes for only %d of %d stocks", market, status.yahoo_ok, status.total)
    status.period = most_common_period(period_ends)
    return figures, price_docs, status.period


# --- offline rebuild -------------------------------------------------------------------------


def build_seed(
    universe: Universe,
    banks: Mapping[tuple[str, str], Mapping[str, Any]],
    prev_doc: Any,
    reference: Mapping[str, Any] | None,
    now: datetime,
) -> dict[str, Any]:
    """market.json from the config plus values that already exist; no network.

    Values come from the current market.json; a stock missing there but present in the
    Fintables reference file gets the reference figures; a new stock gets nulls. asOf, source
    and period are kept as they are (from the reference when there is no market.json).
    """
    prev = previous_records(prev_doc)
    ref_stocks = (reference or {}).get("stocks") or {}
    ref_market = (reference or {}).get("market")
    figures: dict[tuple[str, str], dict[str, Any]] = {}
    for spec in universe.stocks:
        key = (spec.market, spec.symbol)
        if key in prev:
            figures[key] = carry(prev[key])
        elif spec.market == ref_market and spec.symbol in ref_stocks:
            figures[key] = carry(ref_stocks[spec.symbol])
        else:
            figures[key] = carry(None)

    if valid_doc(prev_doc):
        as_of, source, period = prev_doc.get("asOf"), prev_doc.get("source"), keep_period(prev_doc)
        as_of_by = keep_as_of_by(prev_doc)
    else:
        as_of = (reference or {}).get("asOf")
        source = (reference or {}).get("source")
        period = {ref_market: reference["period"]} if reference and ref_market and reference.get("period") else {}
        as_of_by = {ref_market: as_of} if ref_market and as_of else {}
    return assemble(
        universe,
        banks,
        figures,
        as_of=as_of or now.isoformat(timespec="seconds"),
        as_of_by=as_of_by,
        source=source or "Veri bekliyor",
        period=period,
    )
