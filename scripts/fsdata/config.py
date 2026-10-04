"""config/stocks.json and config/banks_manual.json."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import jsonschema

from . import CONFIG_DIR, CURRENCY
from .util import read_json


class ConfigError(Exception):
    """The universe file is invalid. The message lists every problem found."""


@dataclass(frozen=True)
class StockSpec:
    symbol: str
    name: str
    market: str
    industry: str
    bank: bool = False
    cyc: bool | None = None
    tv: str = ""
    yf: str = ""
    usd: str | None = None
    note: str | None = None
    note_as_of: str | None = None

    @property
    def currency(self) -> str:
        return CURRENCY[self.market]

    @property
    def sid(self) -> str:
        """Id used in file names and by the app: BIST-THYAO, US-AAPL."""
        return f"{self.market}-{self.symbol}"


@dataclass(frozen=True)
class Universe:
    industries: dict[str, dict[str, Any]]
    stocks: tuple[StockSpec, ...]
    extra: dict[str, Any] = field(default_factory=dict)

    def market(self, market: str) -> list[StockSpec]:
        return [s for s in self.stocks if s.market == market]


def _schema_errors(doc: Any, schema_path: Path) -> list[str]:
    validator = jsonschema.Draft7Validator(read_json(schema_path))
    out = []
    for e in sorted(validator.iter_errors(doc), key=lambda e: list(map(str, e.absolute_path))):
        where = "/".join(str(p) for p in e.absolute_path) or "(root)"
        out.append(f"{where}: {e.message}")
    return out


def default_symbols(market: str, symbol: str) -> tuple[str, str]:
    """(TradingView symbol, Yahoo symbol) when the file does not say otherwise."""
    if market == "BIST":
        return f"BIST:{symbol}", f"{symbol}.IS"
    return "", symbol  # US: the exchange cannot be guessed, 'tv' is required by the schema


def parse_universe(doc: Any, schema_path: Path | None = None) -> Universe:
    schema_path = schema_path or CONFIG_DIR / "stocks.schema.json"
    problems = _schema_errors(doc, schema_path)
    if problems:
        raise ConfigError("stocks.json does not match stocks.schema.json:\n  " + "\n  ".join(problems))

    industries = doc["industries"]
    specs: list[StockSpec] = []
    seen: set[tuple[str, str]] = set()
    for i, s in enumerate(doc["stocks"]):
        label = f"stocks[{i}] {s['market']}:{s['symbol']}"
        if (s["market"], s["symbol"]) in seen:
            problems.append(f"{label}: duplicate ticker in the same market")
        seen.add((s["market"], s["symbol"]))
        if s["industry"] not in industries:
            problems.append(f"{label}: unknown industry '{s['industry']}'")
        if ("note" in s) != ("noteAsOf" in s):
            problems.append(f"{label}: 'note' and 'noteAsOf' go together")
        if s.get("bank") and s["market"] != "BIST":
            problems.append(f"{label}: 'bank' is BIST-only (no US banks in the universe)")
        tv_default, yf_default = default_symbols(s["market"], s["symbol"])
        tv = s.get("tv", tv_default)
        if s["market"] == "BIST" and not tv.startswith("BIST:"):
            problems.append(f"{label}: BIST stocks must use a BIST: TradingView symbol, got '{tv}'")
        if s["market"] == "US" and tv.startswith("BIST:"):
            problems.append(f"{label}: US stock with a BIST: TradingView symbol")
        specs.append(
            StockSpec(
                symbol=s["symbol"],
                name=s["name"],
                market=s["market"],
                industry=s["industry"],
                bank=bool(s.get("bank", False)),
                cyc=s.get("cyc"),
                tv=tv,
                yf=s.get("yf", yf_default),
                usd=s.get("usd"),
                note=s.get("note"),
                note_as_of=s.get("noteAsOf"),
            )
        )
    if problems:
        raise ConfigError("stocks.json is inconsistent:\n  " + "\n  ".join(problems))
    return Universe(industries=dict(industries), stocks=tuple(specs))


def load_universe(path: Path | None = None) -> Universe:
    path = path or CONFIG_DIR / "stocks.json"
    try:
        doc = read_json(path)
    except (OSError, ValueError) as e:
        raise ConfigError(f"cannot read {path}: {e}") from e
    return parse_universe(doc, path.with_name("stocks.schema.json"))


def load_banks(path: Path | None = None) -> dict[tuple[str, str], dict[str, float | None]]:
    """(market, ticker) -> {npl, car, nim}. A missing file means no manual bank figures."""
    path = path or CONFIG_DIR / "banks_manual.json"
    if not path.exists():
        return {}
    try:
        doc = read_json(path)
    except (OSError, ValueError) as e:
        raise ConfigError(f"cannot read {path}: {e}") from e
    out: dict[tuple[str, str], dict[str, float | None]] = {}
    for market, banks in (doc.get("banks") or {}).items():
        for k, v in banks.items():
            out[(market, k)] = {key: v.get(key) for key in ("npl", "car", "nim")}
    return out
