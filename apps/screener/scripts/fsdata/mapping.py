"""TradingView screener row -> the figures of one stock; SMA from closes.

All rules live here as small pure functions so they can be tested without a network.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from .config import StockSpec
from .util import clean_number, r0, r1, r2

# Screener columns, in request order. Names are the raw field ids of the scanner endpoint
# (checked against the TradingView-Screener and tvscreener sources, see docs/DATA.md).
TV_COLUMNS: tuple[str, ...] = (
    "name",
    "close",
    "currency",
    "market_cap_basic",
    "price_earnings_ttm",
    "earnings_per_share_diluted_ttm",
    "price_book_fq",
    "enterprise_value_ebitda_ttm",
    "price_earnings_growth_ttm",
    "net_debt",
    "ebitda",
    "ebitda_yoy_growth_ttm",
    "net_income_yoy_growth_ttm",
    "price_target_average",
    "SMA20",
    "SMA50",
    "SMA200",
    "fiscal_period_end_fq",
)
# Without these a row is useless; an unknown optional column is simply dropped.
REQUIRED_COLUMNS: tuple[str, ...] = ("name", "close")

SMA_WINDOWS = (20, 50, 200)

# Texts for "a percentage would mean nothing" (see growth_pair)
NET_FROM_LOSS = "zarardan kâra"
NET_TO_LOSS = "kârdan zarara"
EBITDA_FROM_NEGATIVE = "eksiden artıya"
EBITDA_TO_NEGATIVE = "artıdan eksiye"

FIGURE_KEYS: tuple[str, ...] = (
    "price", "pe", "pb", "evEbitda", "peg", "netDebtEbitda", "marketCap", "ebitdaGrowth", "netIncomeGrowth",
    "targetPrice", "sma20", "sma50", "sma200",
)
TEXT_KEYS: tuple[str, ...] = ("ebitdaGrowthNote", "netIncomeGrowthNote")
FLAG_KEYS: tuple[str, ...] = ("loss",)  # written only when true


class RowError(Exception):
    """A screener row cannot be used for this stock (the stock is carried forward)."""


def positive(x: Any) -> float | None:
    """A multiple or price that only makes sense above zero; anything else is 'no value'."""
    n = clean_number(x)
    if n is None or n <= 0:
        return None
    v = r2(n)
    return v if v else None  # 0.004 rounds to 0.0, which is not a positive value either


def net_debt_ratio(net_debt: Any, ebitda: Any) -> float | None:
    """Net debt / EBITDA. Negative means net cash. None when EBITDA is missing or not positive."""
    nd, eb = clean_number(net_debt), clean_number(ebitda)
    if nd is None or eb is None or eb <= 0:
        return None
    return r2(nd / eb)


def growth_pair(
    growth: Any, current: Any, *, from_negative: str, to_negative: str
) -> tuple[int | None, str | None]:
    """(percent, text) for a YoY growth figure.

    `growth` is the source's YoY percent, `current` the current-period amount (its sign is what
    matters). A percent is only worth showing when the base is positive and the result is not a
    loss, so:
      - current is a loss: no percent; text `to_negative` when the drop is below -100 %
        (it can only come from a positive base), otherwise nothing.
      - the source gives no growth although the current amount is positive: the base was zero
        or negative, text `from_negative`.
      - otherwise: the percent, rounded to a whole number.
    """
    g, cur = clean_number(growth), clean_number(current)
    if cur is not None and cur < 0:
        if g is not None and g < -100:
            return None, to_negative
        return None, None
    if g is None:
        if cur is not None and cur > 0:
            return None, from_negative
        return None, None
    return r0(g), None


def simple_average(closes: Sequence[float], n: int) -> float | None:
    """Simple moving average of the last n closes; None when fewer than n are known."""
    if n <= 0 or len(closes) < n:
        return None
    window = closes[-n:]
    return r2(sum(window) / n)


def sma_set(closes: Sequence[float]) -> dict[str, float | None]:
    return {f"sma{n}": simple_average(closes, n) for n in SMA_WINDOWS}


def map_tv_row(spec: StockSpec, row: Mapping[str, Any]) -> dict[str, Any]:
    """Figures for one stock from a screener row {column: value}.

    Returns FIGURE_KEYS (None where missing) plus ebitdaGrowthNote / netIncomeGrowthNote and `loss` when set, and `_period_end`
    (the raw fiscal_period_end_fq value) for the caller to pick up. Raises RowError when the
    row is unusable.
    """
    price = positive(row.get("close"))
    if price is None:
        raise RowError("no price in the row")
    cur = row.get("currency")
    if isinstance(cur, str) and cur and cur.upper() != spec.currency:
        raise RowError(f"quoted in {cur}, expected {spec.currency}")

    eps = clean_number(row.get("earnings_per_share_diluted_ttm"))
    pe = positive(row.get("price_earnings_ttm"))
    loss = eps is not None and eps <= 0
    if loss:
        pe = None  # a P/E over a loss is not a multiple

    ebitda = row.get("ebitda")
    out: dict[str, Any] = {
        "price": price,
        "pe": pe,
        "pb": positive(row.get("price_book_fq")),
        "evEbitda": positive(row.get("enterprise_value_ebitda_ttm")),
        "peg": r2(row.get("price_earnings_growth_ttm")),
        "netDebtEbitda": net_debt_ratio(row.get("net_debt"), ebitda),
        "marketCap": None,
        "ebitdaGrowth": None,
        "netIncomeGrowth": None,
        "targetPrice": positive(row.get("price_target_average")),
        "sma20": positive(row.get("SMA20")),
        "sma50": positive(row.get("SMA50")),
        "sma200": positive(row.get("SMA200")),
    }
    mc = clean_number(row.get("market_cap_basic"))
    if mc is not None and mc > 0:
        out["marketCap"] = r1(mc / 1e9)

    ebitda_growth, ebitda_growth_text = growth_pair(
        row.get("ebitda_yoy_growth_ttm"), ebitda, from_negative=EBITDA_FROM_NEGATIVE, to_negative=EBITDA_TO_NEGATIVE
    )
    net_income_growth, net_income_growth_text = growth_pair(
        row.get("net_income_yoy_growth_ttm"), eps, from_negative=NET_FROM_LOSS, to_negative=NET_TO_LOSS
    )
    out["ebitdaGrowth"], out["netIncomeGrowth"] = ebitda_growth, net_income_growth
    if loss:
        out["loss"] = True  # tells the app that the empty P/E is a loss, not missing data
    if ebitda_growth_text:
        out["ebitdaGrowthNote"] = ebitda_growth_text
    if net_income_growth_text:
        out["netIncomeGrowthNote"] = net_income_growth_text

    if spec.bank:
        # EBITDA, EV and net debt do not describe a bank (its debt is its raw material)
        out["evEbitda"] = out["netDebtEbitda"] = out["ebitdaGrowth"] = None
        out.pop("ebitdaGrowthNote", None)

    out["_period_end"] = row.get("fiscal_period_end_fq")
    return out


def period_label(value: Any) -> str | None:
    """'2026/6' from a fiscal period end: epoch seconds, 'YYYY-MM-DD' or a datetime."""
    if value is None or isinstance(value, bool):
        return None
    when: datetime | None = None
    if isinstance(value, (int, float)):
        n = clean_number(value)
        if n is None or n < 1e8:
            return None
        when = datetime.fromtimestamp(float(n), tz=timezone.utc)
    elif isinstance(value, datetime):
        when = value
    elif isinstance(value, str):
        text = value.strip()
        if text.isdigit() and len(text) >= 9:
            return period_label(int(text))
        try:
            when = datetime.fromisoformat(text[:10])
        except ValueError:
            return None
    if when is None or not 1990 <= when.year <= 2100:
        return None
    return f"{when.year}/{when.month}"


def most_common_period(values: Sequence[Any]) -> str | None:
    """The period most stocks of a market agree on; a tie goes to the later one."""
    labels = [p for p in (period_label(v) for v in values) if p]
    if not labels:
        return None

    def key(label: str) -> tuple[int, int, int]:
        y, m = label.split("/")
        return (labels.count(label), int(y), int(m))

    return max(Counter(labels), key=key)
