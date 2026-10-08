"""The two data sources, each behind a small injectable seam.

TradingView screener: plain `requests` POST to scanner.tradingview.com/{turkey|america}/scan
(one request per market). `post` is injectable, so tests never touch the network.

Yahoo Finance: daily closes through `yfinance`. `history` is injectable.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Callable, Mapping, Sequence

from .mapping import REQUIRED_COLUMNS, TV_COLUMNS
from .util import clean_number

log = logging.getLogger("fintools.sources")

TV_URL = "https://scanner.tradingview.com/{scope}/scan"
TV_SCOPE = {"BIST": "turkey", "US": "america"}
TV_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
}


class SourceError(Exception):
    """A source did not give usable data (after retries)."""


class UnknownFieldError(SourceError):
    """The screener rejected a column name."""

    def __init__(self, name: str):
        super().__init__(f"unknown screener field '{name}'")
        self.field = name


# post(url, payload, headers, timeout) -> (HTTP status, response text)
PostFn = Callable[[str, dict, Mapping[str, str], float], "tuple[int, str]"]


def requests_post(url: str, payload: dict, headers: Mapping[str, str], timeout: float) -> tuple[int, str]:
    import requests  # imported here so the tests and --seed never need it

    r = requests.post(url, data=json.dumps(payload), headers=dict(headers), timeout=timeout)
    return r.status_code, r.text


_UNKNOWN_FIELD = re.compile(r"[Uu]nknown field[^\"'\\]*[\"'\\]+([^\"'\\]+)")


def unknown_field(body: str) -> str | None:
    m = _UNKNOWN_FIELD.search(body or "")
    return m.group(1) if m else None


def tickers_payload(symbols: Sequence[str], columns: Sequence[str]) -> dict:
    """Ask for explicit EXCHANGE:TICKER symbols."""
    return {
        "symbols": {"query": {"types": []}, "tickers": list(symbols)},
        "columns": list(columns),
        "options": {"lang": "en"},
        "range": [0, max(len(symbols), 1)],
    }


def names_payload(scope: str, names: Sequence[str], columns: Sequence[str]) -> dict:
    """Fallback: scan the whole market for these names (ticker without exchange)."""
    return {
        "markets": [scope],
        "symbols": {"query": {"types": []}},
        "filter": [{"left": "name", "operation": "in_range", "right": list(names)}],
        "columns": list(columns),
        "sort": {"sortBy": "market_cap_basic", "sortOrder": "desc"},
        "options": {"lang": "en"},
        "range": [0, 5 * len(names) + 50],
    }


def parse_rows(data: Any, columns: Sequence[str]) -> dict[str, dict[str, Any]]:
    """{'s': 'NASDAQ:AAPL', 'd': [...]} items -> {symbol: {column: value}}."""
    if not isinstance(data, dict) or not isinstance(data.get("data"), list):
        err = data.get("error") if isinstance(data, dict) else None
        raise SourceError(f"screener response has no 'data' list{f' ({err})' if err else ''}")
    out: dict[str, dict[str, Any]] = {}
    for item in data["data"]:
        sym = item.get("s") if isinstance(item, dict) else None
        vals = item.get("d") if isinstance(item, dict) else None
        if not isinstance(sym, str) or not isinstance(vals, list) or len(vals) != len(columns):
            log.warning("skipping a malformed screener row: %.120r", item)
            continue
        out[sym] = dict(zip(columns, vals))
    return out


@dataclass
class TvScan:
    market: str
    columns: list[str]
    dropped: list[str]
    strategy: str
    rows: dict[str, dict[str, Any]] = field(default_factory=dict)

    def find(self, symbol: str) -> tuple[dict[str, Any] | None, str | None]:
        """(row, note). Exact symbol first; otherwise a single row with the same ticker part
        (the exchange in config may be out of date). `note` says what was assumed."""
        if symbol in self.rows:
            return self.rows[symbol], None
        ticker = symbol.split(":", 1)[-1].upper()
        hits = [
            (s, r)
            for s, r in self.rows.items()
            if s.split(":", 1)[-1].upper() == ticker or str(r.get("name", "")).upper() == ticker
        ]
        if len(hits) == 1:
            return hits[0][1], f"config says {symbol}, screener has {hits[0][0]}"
        if not hits:
            return None, "not in the screener response"
        return None, f"{len(hits)} screener rows share the ticker ({', '.join(s for s, _ in hits)})"


class TradingViewClient:
    def __init__(
        self,
        post: PostFn = requests_post,
        *,
        sleep: Callable[[float], None] = time.sleep,
        attempts: int = 4,
        backoff: float = 2.0,
        timeout: float = 30.0,
        pause: float = 1.0,
        columns: Sequence[str] = TV_COLUMNS,
    ):
        self.post = post
        self.sleep = sleep
        self.attempts = attempts
        self.backoff = backoff
        self.timeout = timeout
        self.pause = pause
        self.columns = tuple(columns)
        self._requests = 0

    def _post(self, url: str, payload: dict) -> Any:
        if self._requests:
            self.sleep(self.pause)
        self._requests += 1
        last = "no attempt"
        for attempt in range(self.attempts):
            if attempt:
                self.sleep(self.backoff * 2 ** (attempt - 1))
            try:
                status, body = self.post(url, payload, TV_HEADERS, self.timeout)
            except Exception as e:  # network errors of any kind
                last = f"{type(e).__name__}: {e}"
                log.warning("TradingView request failed (%s), attempt %d/%d", last, attempt + 1, self.attempts)
                continue
            if status == 200:
                try:
                    return json.loads(body)
                except ValueError:
                    last = "response is not JSON"
                    continue
            if status == 400:
                name = unknown_field(body)
                if name:
                    raise UnknownFieldError(name)
                raise SourceError(f"HTTP 400: {body[:300]}")
            if status in (408, 429) or status >= 500:
                last = f"HTTP {status}"
                log.warning("TradingView answered HTTP %d, attempt %d/%d", status, attempt + 1, self.attempts)
                continue
            raise SourceError(f"HTTP {status}: {body[:300]}")
        raise SourceError(f"gave up after {self.attempts} attempts: {last}")

    def scan(self, market: str, symbols: Sequence[str]) -> TvScan:
        """One screener call for a market (two if the symbol query comes back empty)."""
        scope = TV_SCOPE[market]
        url = TV_URL.format(scope=scope)
        columns = list(self.columns)
        dropped: list[str] = []
        names = sorted({s.split(":", 1)[-1] for s in symbols})
        for strategy in ("tickers", "names"):
            while True:
                payload = (
                    tickers_payload(symbols, columns) if strategy == "tickers" else names_payload(scope, names, columns)
                )
                try:
                    data = self._post(url, payload)
                except UnknownFieldError as e:
                    if e.field in REQUIRED_COLUMNS or e.field not in columns:
                        raise SourceError(f"screener rejected a column we cannot do without: {e.field}") from e
                    log.warning("screener does not know '%s'; dropping it (that figure stays empty)", e.field)
                    columns.remove(e.field)
                    dropped.append(e.field)
                    continue
                break
            rows = parse_rows(data, columns)
            if rows:
                return TvScan(market=market, columns=columns, dropped=dropped, strategy=strategy, rows=rows)
            log.warning("TradingView returned no rows for the %s query (%s market)", strategy, market)
        raise SourceError(f"TradingView returned no rows for the {market} market")


# ---------------------------------------------------------------------------------------------

# history(symbol, start, end) -> [(YYYY-MM-DD, close)], ascending
HistoryFn = Callable[[str, date, "date | None"], "list[tuple[str, float]]"]


def frame_to_closes(frame: Any) -> list[tuple[str, float]]:
    """A yfinance history DataFrame -> ascending [(day, close)]; NaN and non-positive rows dropped.

    yfinance indexes daily bars by exchange-local midnight, so the index's own date is the trading day.
    """
    if frame is None or len(frame) == 0 or "Close" not in frame:
        return []
    out: dict[str, float] = {}
    for ts, value in frame["Close"].items():
        c = clean_number(value)
        if c is None or c <= 0:
            continue
        out[ts.strftime("%Y-%m-%d")] = float(c)
    return sorted(out.items())


def yfinance_history(symbol: str, start: date, end: date | None) -> list[tuple[str, float]]:
    import yfinance as yf  # imported here so the tests and --seed never need it

    frame = yf.Ticker(symbol).history(
        start=start.isoformat(),
        end=end.isoformat() if end else None,
        interval="1d",
        auto_adjust=False,  # the close as quoted (split-adjusted, not dividend-adjusted), like TradingView's
        actions=False,
        raise_errors=False,
    )
    return frame_to_closes(frame)


class YahooClient:
    def __init__(
        self,
        history: HistoryFn = yfinance_history,
        *,
        sleep: Callable[[float], None] = time.sleep,
        attempts: int = 3,
        backoff: float = 2.0,
        pause: float = 0.4,
    ):
        self.history = history
        self.sleep = sleep
        self.attempts = attempts
        self.backoff = backoff
        self.pause = pause
        self._calls = 0

    def closes(self, symbol: str, start: date, end: date | None = None) -> list[tuple[str, float]]:
        """Daily closes, ascending. Empty list when Yahoo has nothing (after retries)."""
        if self._calls:
            self.sleep(self.pause)
        self._calls += 1
        last = "no data"
        for attempt in range(self.attempts):
            if attempt:
                self.sleep(self.backoff * 2 ** (attempt - 1))
            try:
                rows = self.history(symbol, start, end)
            except Exception as e:  # yfinance raises many kinds (rate limit, JSON, network)
                last = f"{type(e).__name__}: {e}"
                log.warning("Yahoo %s failed (%s), attempt %d/%d", symbol, last, attempt + 1, self.attempts)
                continue
            if rows:
                return list(rows)
            last = "empty result"
        log.warning("Yahoo gave nothing for %s (%s)", symbol, last)
        return []
