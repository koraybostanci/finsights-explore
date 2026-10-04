"""Unit tests for the data job. No network: both sources are faked.

Run: python -m unittest discover -s scripts/tests -t scripts
All figures in here are synthetic.
"""

from __future__ import annotations

import json
import logging
import math
import shutil
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
REPO = SCRIPTS.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from fsdata import cli  # noqa: E402
from fsdata.compare import build_compare, gap_pct  # noqa: E402
from fsdata.config import ConfigError, load_banks, load_universe, parse_universe  # noqa: E402
from fsdata.mapping import (  # noqa: E402
    EBITDA_FROM_NEGATIVE,
    NET_FROM_LOSS,
    NET_TO_LOSS,
    TV_COLUMNS,
    RowError,
    growth_pair,
    map_tv_row,
    most_common_period,
    net_debt_ratio,
    period_label,
    positive,
    simple_average,
    sma_set,
)
from fsdata.pipeline import build_seed, merge_series, run_fetch  # noqa: E402
from fsdata.sources import SourceError, TradingViewClient, YahooClient, parse_rows, unknown_field  # noqa: E402
from fsdata.util import clean_number, r0, r2, tidy  # noqa: E402
from fsdata.writer import validate_market, validate_prices  # noqa: E402

logging.disable(logging.CRITICAL)  # the faked failures below are expected

NOW = datetime(2026, 10, 5, 19, 0, tzinfo=timezone(timedelta(hours=3)))
UNIVERSE = load_universe(REPO / "config" / "stocks.json")
BANKS = load_banks(REPO / "config" / "banks_manual.json")
SEED = json.loads((REPO / "public" / "data" / "market.json").read_text(encoding="utf-8"))


def tv_row(name: str, **over):
    """A synthetic screener row for every requested column."""
    base = {
        "name": name,
        "close": 100.0,
        "currency": None,
        "market_cap_basic": 250e9,
        "price_earnings_ttm": 12.345,
        "earnings_per_share_diluted_ttm": 8.1,
        "price_book_fq": 1.5,
        "enterprise_value_ebitda_ttm": 6.789,
        "price_earnings_growth_ttm": 0.8,
        "net_debt": 30e9,
        "ebitda": 20e9,
        "ebitda_yoy_growth_ttm": 12.4,
        "net_income_yoy_growth_ttm": -7.6,
        "price_target_average": 130.0,
        "SMA20": 98.0,
        "SMA50": 95.0,
        "SMA200": 90.0,
        "fiscal_period_end_fq": 1782777600,  # 2026-06-30
    }
    base.update(over)
    return base


def fake_post(rows_by_market, *, fail_markets=(), unknown=None, log=None):
    """post() stand-in. rows_by_market: {"turkey": {symbol: row}, "america": {...}}"""
    state = {"unknown_sent": False}

    def post(url, payload, headers, timeout):
        scope = url.rstrip("/").split("/")[-2]
        if log is not None:
            log.append((scope, list(payload["columns"])))
        if scope in fail_markets:
            return 503, "busy"
        if unknown and unknown in payload["columns"]:
            state["unknown_sent"] = True
            return 400, json.dumps({"error": f'Unknown field "{unknown}"'})
        cols = payload["columns"]
        wanted = payload.get("symbols", {}).get("tickers") or list(rows_by_market[scope])
        data = [{"s": s, "d": [rows_by_market[scope][s].get(c) for c in cols]} for s in wanted if s in rows_by_market[scope]]
        return 200, json.dumps({"totalCount": len(data), "data": data})

    return post


def fake_history(n=260, *, missing=(), start_price=50.0):
    def history(symbol, start, end):
        if symbol in missing:
            return []
        d0 = date(2025, 9, 1)
        return [((d0 + timedelta(days=i)).isoformat(), start_price + i * 0.5) for i in range(n)]

    return history


def all_rows():
    rows = {"turkey": {}, "america": {}}
    for s in UNIVERSE.stocks:
        scope = "turkey" if s.market == "BIST" else "america"
        rows[scope][s.tv] = tv_row(s.k, currency="TRY" if s.market == "BIST" else "USD")
    return rows


def clients(rows, **kw):
    hist = kw.pop("history", fake_history())
    tv = TradingViewClient(fake_post(rows, **kw), sleep=lambda s: None)
    yh = YahooClient(hist, sleep=lambda s: None)
    return tv, yh


class Util(unittest.TestCase):
    def test_clean_number(self):
        self.assertIsNone(clean_number(None))
        self.assertIsNone(clean_number(True))
        self.assertIsNone(clean_number("3"))
        self.assertIsNone(clean_number(float("nan")))
        self.assertIsNone(clean_number(float("inf")))
        self.assertEqual(clean_number(3), 3)

    def test_rounding_is_half_up(self):
        self.assertEqual(r2(2.675), 2.68)
        self.assertEqual(r2(-0.004), 0.0)
        self.assertEqual(r0(12.5), 13)
        self.assertIsInstance(r0(12.4), int)
        self.assertIsNone(r2(float("nan")))

    def test_tidy_refuses_non_finite(self):
        with self.assertRaises(ValueError):
            tidy({"a": float("nan")})
        with self.assertRaises(ValueError):
            tidy({"b": [1.0, float("inf")]})


class Mapping(unittest.TestCase):
    def spec(self, k="THYAO"):
        return next(s for s in UNIVERSE.stocks if s.k == k)

    def test_positive(self):
        self.assertEqual(positive(3.456), 3.46)
        self.assertIsNone(positive(0))
        self.assertIsNone(positive(-2))
        self.assertIsNone(positive(0.004))
        self.assertIsNone(positive(None))

    def test_net_debt_ratio(self):
        self.assertEqual(net_debt_ratio(30e9, 20e9), 1.5)
        self.assertEqual(net_debt_ratio(-10e9, 20e9), -0.5)  # net cash
        self.assertIsNone(net_debt_ratio(30e9, 0))
        self.assertIsNone(net_debt_ratio(30e9, -5e9))
        self.assertIsNone(net_debt_ratio(None, 20e9))

    def test_growth_pair(self):
        kw = dict(from_negative=NET_FROM_LOSS, to_negative=NET_TO_LOSS)
        self.assertEqual(growth_pair(12.4, 5.0, **kw), (12, None))
        self.assertEqual(growth_pair(-7.6, 5.0, **kw), (-8, None))
        self.assertEqual(growth_pair(None, 5.0, **kw), (None, NET_FROM_LOSS))
        self.assertEqual(growth_pair(-250.0, -3.0, **kw), (None, NET_TO_LOSS))
        self.assertEqual(growth_pair(-40.0, -3.0, **kw), (None, None))
        self.assertEqual(growth_pair(None, None, **kw), (None, None))

    def test_sma(self):
        closes = [float(i) for i in range(1, 201)]
        self.assertEqual(simple_average(closes, 20), 190.5)
        self.assertEqual(simple_average(closes, 200), 100.5)
        self.assertIsNone(simple_average(closes[:10], 20))
        self.assertEqual(sma_set(closes[:60]), {"sma20": 50.5, "sma50": 35.5, "sma200": None})

    def test_map_row(self):
        fig = map_tv_row(self.spec(), tv_row("THYAO", currency="TRY"))
        self.assertEqual(fig["f"], 100.0)
        self.assertEqual(fig["fk"], 12.35)
        self.assertEqual(fig["pd"], 1.5)
        self.assertEqual(fig["fdf"], 6.79)
        self.assertEqual(fig["peg"], 0.8)
        self.assertEqual(fig["nb"], 1.5)
        self.assertEqual(fig["mv"], 250.0)
        self.assertEqual((fig["fg"], fig["ng"]), (12, -8))
        self.assertEqual(fig["h"], 130.0)
        self.assertEqual((fig["sma20"], fig["sma50"], fig["sma200"]), (98.0, 95.0, 90.0))

    def test_map_row_loss_and_turnaround(self):
        fig = map_tv_row(self.spec(), tv_row("X", earnings_per_share_diluted_ttm=-2.0, net_income_yoy_growth_ttm=-300.0))
        self.assertIsNone(fig["fk"])
        self.assertIsNone(fig["ng"])
        self.assertEqual(fig["ngT"], NET_TO_LOSS)
        fig = map_tv_row(self.spec(), tv_row("X", ebitda_yoy_growth_ttm=None, net_income_yoy_growth_ttm=None))
        self.assertEqual(fig["fgT"], EBITDA_FROM_NEGATIVE)
        self.assertEqual(fig["ngT"], NET_FROM_LOSS)

    def test_map_row_rejects_wrong_currency_and_missing_price(self):
        with self.assertRaises(RowError):
            map_tv_row(self.spec(), tv_row("X", currency="USD"))
        with self.assertRaises(RowError):
            map_tv_row(self.spec(), tv_row("X", close=None))

    def test_bank_has_no_ebitda_figures(self):
        fig = map_tv_row(self.spec("GARAN"), tv_row("GARAN"))
        self.assertIsNone(fig["fdf"])
        self.assertIsNone(fig["nb"])
        self.assertIsNone(fig["fg"])
        self.assertNotIn("fgT", fig)

    def test_period(self):
        self.assertEqual(period_label(1782777600), "2026/6")
        self.assertEqual(period_label("2026-03-31"), "2026/3")
        self.assertIsNone(period_label(None))
        self.assertIsNone(period_label(12))
        self.assertEqual(most_common_period([1782777600, 1782777600, "2026-03-31", None]), "2026/6")
        self.assertIsNone(most_common_period([None]))


class Sources(unittest.TestCase):
    def test_parse_rows(self):
        cols = ["name", "close"]
        rows = parse_rows({"data": [{"s": "BIST:THYAO", "d": ["THYAO", 1.0]}, {"s": "X", "d": [1]}, "junk"]}, cols)
        self.assertEqual(rows, {"BIST:THYAO": {"name": "THYAO", "close": 1.0}})
        with self.assertRaises(SourceError):
            parse_rows({"error": "nope"}, cols)

    def test_unknown_field(self):
        self.assertEqual(unknown_field('{"error":"Unknown field \\"foo_bar\\""}'), "foo_bar")
        self.assertIsNone(unknown_field("something else"))

    def test_unknown_optional_column_is_dropped(self):
        log = []
        tv = TradingViewClient(fake_post(all_rows(), unknown="price_target_average", log=log), sleep=lambda s: None)
        scan = tv.scan("BIST", [s.tv for s in UNIVERSE.market("BIST")])
        self.assertEqual(scan.dropped, ["price_target_average"])
        self.assertNotIn("price_target_average", scan.columns)
        self.assertEqual(len(scan.rows), 30)
        self.assertEqual(len(log), 2)

    def test_unknown_required_column_fails(self):
        tv = TradingViewClient(fake_post(all_rows(), unknown="close"), sleep=lambda s: None)
        with self.assertRaises(SourceError):
            tv.scan("BIST", ["BIST:THYAO"])

    def test_retries_then_gives_up(self):
        calls = []
        slept = []

        def post(url, payload, headers, timeout):
            calls.append(1)
            return 503, "busy"

        tv = TradingViewClient(post, sleep=slept.append, attempts=3)
        with self.assertRaises(SourceError):
            tv.scan("US", ["NASDAQ:AAPL"])
        self.assertEqual(len(calls), 3)
        self.assertEqual(slept, [2.0, 4.0])

    def test_find_tolerates_exchange_change(self):
        rows = {"america": {"NYSE:AAPL": tv_row("AAPL")}}
        tv = TradingViewClient(fake_post(rows), sleep=lambda s: None)
        scan = tv.scan("US", ["NASDAQ:AAPL"])  # symbol query empty -> name query
        row, note = scan.find("NASDAQ:AAPL")
        self.assertIsNotNone(row)
        self.assertIn("NYSE:AAPL", note)

    def test_yahoo_retries_and_returns_empty(self):
        n = []

        def history(symbol, start, end):
            n.append(symbol)
            raise RuntimeError("rate limited")

        y = YahooClient(history, sleep=lambda s: None, attempts=3)
        self.assertEqual(y.closes("AAPL", date(2026, 1, 1)), [])
        self.assertEqual(len(n), 3)

    def test_columns_are_unique(self):
        self.assertEqual(len(set(TV_COLUMNS)), len(TV_COLUMNS))


class Pipeline(unittest.TestCase):
    def test_full_run_is_valid_and_keeps_markets_apart(self):
        tv, yh = clients(all_rows())
        res = run_fetch(UNIVERSE, BANKS, SEED, lambda sid: None, tv, yh, NOW)
        self.assertEqual(validate_market(res.doc), [])
        self.assertEqual(res.exit_code, 0)
        self.assertTrue(res.updated)
        self.assertEqual(res.doc["source"], "TradingView ve Yahoo Finance")
        self.assertEqual(res.doc["period"], {"BIST": "2026/6", "US": "2026/6"})
        by = {(s["market"], s["k"]): s for s in res.doc["stocks"]}
        self.assertEqual(len(by), len(UNIVERSE.stocks))
        thy = by[("BIST", "THYAO")]
        self.assertEqual(thy["cur"], "TRY")
        self.assertEqual(thy["fk"], 12.35)
        self.assertEqual(thy["not"], next(s for s in SEED["stocks"] if s["k"] == "THYAO")["not"])
        self.assertEqual(by[("US", "AAPL")]["cur"], "USD")
        # SMA comes from the closes (260 synthetic days), not from the screener row
        closes = [50.0 + i * 0.5 for i in range(260)]
        self.assertEqual(thy["sma20"], r2(sum(closes[-20:]) / 20))
        self.assertEqual(thy["sma200"], r2(sum(closes[-200:]) / 200))
        # banks: manual figures merged, EBITDA figures blank
        gar = by[("BIST", "GARAN")]
        self.assertEqual((gar["npl"], gar["car"], gar["nim"]), (3.5, 15.9, 5.7))
        self.assertIsNone(gar["fdf"])
        # price files
        self.assertEqual(len(res.prices), len(UNIVERSE.stocks))
        p = res.prices["BIST-THYAO"]
        self.assertEqual(validate_prices(p), [])
        self.assertEqual((p["k"], p["market"], p["cur"], len(p["t"])), ("THYAO", "BIST", "TRY", 260))

    def test_missing_stock_is_carried_forward(self):
        rows = all_rows()
        del rows["turkey"]["BIST:THYAO"]
        tv, yh = clients(rows, history=fake_history(missing=("THYAO.IS",)))
        res = run_fetch(UNIVERSE, BANKS, SEED, lambda sid: None, tv, yh, NOW)
        self.assertEqual(res.statuses["BIST"].carried, ["THYAO"])
        self.assertEqual(res.statuses["BIST"].no_prices, ["THYAO"])
        thy = next(s for s in res.doc["stocks"] if s["k"] == "THYAO")
        old = next(s for s in SEED["stocks"] if s["k"] == "THYAO")
        for key in ("f", "fk", "pd", "fdf", "peg", "nb", "mv", "fg", "ng", "h"):
            self.assertEqual(thy[key], old[key], key)
        self.assertEqual(res.exit_code, 0)

    def test_failed_market_keeps_previous_data(self):
        tv, yh = clients(all_rows(), fail_markets=("turkey",))
        res = run_fetch(UNIVERSE, BANKS, SEED, lambda sid: None, tv, yh, NOW)
        self.assertTrue(res.statuses["BIST"].failed)
        self.assertFalse(res.statuses["US"].failed)
        self.assertEqual(res.exit_code, 1)
        old = {s["k"]: s for s in SEED["stocks"] if s["market"] == "BIST"}
        for s in res.doc["stocks"]:
            if s["market"] == "BIST":
                self.assertEqual(s["fk"], old[s["k"]]["fk"])
        self.assertFalse(any(sid.startswith("BIST-") for sid in res.prices))
        self.assertEqual(validate_market(res.doc), [])

    def test_too_many_missing_rows_fails_the_market(self):
        rows = all_rows()
        for sym in list(rows["america"])[:30]:
            del rows["america"][sym]
        tv, yh = clients(rows)
        res = run_fetch(UNIVERSE, BANKS, SEED, lambda sid: None, tv, yh, NOW, markets=("US",))
        self.assertTrue(res.statuses["US"].failed)
        self.assertTrue(all(s["f"] is None for s in res.doc["stocks"] if s["market"] == "US"))
        self.assertEqual(res.doc["asOf"], SEED["asOf"])  # nothing new, date unchanged

    def test_yahoo_outage_is_flagged_but_fundamentals_written(self):
        tv, yh = clients(all_rows(), history=lambda *a: [])
        res = run_fetch(UNIVERSE, BANKS, SEED, lambda sid: None, tv, yh, NOW, markets=("US",))
        self.assertTrue(res.statuses["US"].degraded)
        self.assertEqual(res.exit_code, 1)
        aapl = next(s for s in res.doc["stocks"] if s["k"] == "AAPL")
        self.assertEqual(aapl["fk"], 12.35)
        self.assertEqual(aapl["sma200"], 90.0)  # screener's own average as fallback
        self.assertEqual(res.prices, {})

    def test_merge_series(self):
        old = {"t": ["2026-01-01", "2026-01-02"], "c": [1.0, 2.0]}
        new = [("2026-01-02", 2.5), ("2026-01-03", 3.0)]
        self.assertEqual(merge_series(old, new, 520), [("2026-01-01", 1.0), ("2026-01-02", 2.5), ("2026-01-03", 3.0)])
        self.assertEqual(merge_series(old, new, 2), [("2026-01-02", 2.5), ("2026-01-03", 3.0)])
        self.assertEqual(merge_series(None, new, 520), new)

    def test_seed_reproduces_committed_file(self):
        doc = build_seed(UNIVERSE, BANKS, SEED, None, NOW)
        self.assertEqual(validate_market(doc), [])
        self.assertEqual(json.dumps(doc, sort_keys=True), json.dumps(SEED, sort_keys=True))


class Validation(unittest.TestCase):
    def test_rejects_bad_documents(self):
        doc = json.loads(json.dumps(SEED))
        doc["stocks"][0]["fk"] = "ten"
        self.assertTrue(validate_market(doc))
        doc = json.loads(json.dumps(SEED))
        doc["stocks"][0]["ind"] = "nope"
        self.assertTrue(any("industry" in p for p in validate_market(doc)))
        doc = json.loads(json.dumps(SEED))
        doc["stocks"].append(dict(doc["stocks"][0]))
        self.assertTrue(any("duplicate" in p for p in validate_market(doc)))
        doc = json.loads(json.dumps(SEED))
        doc["stocks"][0]["f"] = math.nan
        self.assertTrue(validate_market(doc))

    def test_prices(self):
        ok = {"k": "A", "market": "US", "cur": "USD", "t": ["2026-01-01", "2026-01-02"], "c": [1.0, 2.0]}
        self.assertEqual(validate_prices(ok), [])
        self.assertTrue(validate_prices({**ok, "c": [1.0]}))
        self.assertTrue(validate_prices({**ok, "t": ["2026-01-02", "2026-01-01"]}))

    def test_config_errors_are_reported(self):
        raw = json.loads((REPO / "config" / "stocks.json").read_text(encoding="utf-8"))
        raw["stocks"][0]["industry"] = "does_not_exist"
        with self.assertRaises(ConfigError):
            parse_universe(raw)

    def test_universe_rules(self):
        self.assertEqual(len(UNIVERSE.market("BIST")), 30)
        self.assertFalse(any(s.bank for s in UNIVERSE.market("US")), "no US banks for now")
        self.assertEqual(len({(s.market, s.k) for s in UNIVERSE.stocks}), len(UNIVERSE.stocks))
        self.assertTrue(all(s.tv and s.yf for s in UNIVERSE.stocks))
        self.assertTrue(all(":" in s.tv for s in UNIVERSE.stocks))


class Compare(unittest.TestCase):
    def test_gap(self):
        self.assertEqual(gap_pct(11, 10), 10.0)
        self.assertEqual(gap_pct(-0.5, -1.0), 50.0)
        self.assertIsNone(gap_pct(None, 10))
        self.assertIsNone(gap_pct(5, 0))

    def test_table(self):
        ref = json.loads((SCRIPTS / "reference" / "fintables_2026-10-02.json").read_text(encoding="utf-8"))
        same = build_compare(SEED, ref)
        self.assertTrue(same.same_snapshot)
        self.assertEqual(same.summary["fk"]["big"], 0)
        doc = json.loads(json.dumps(SEED))
        doc["asOf"] = "2026-10-05T19:00:00+03:00"
        thy = next(s for s in doc["stocks"] if s["k"] == "THYAO")
        thy["fk"] = thy["fk"] * 2
        res = build_compare(doc, ref)
        self.assertFalse(res.same_snapshot)
        self.assertEqual(res.summary["fk"]["big"], 1)
        self.assertIn("| THYAO |", res.text)
        self.assertIn("+100.0%", res.text)


class Cli(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.data = self.tmp / "data"
        self.data.mkdir()
        shutil.copy(REPO / "public" / "data" / "market.json", self.data / "market.json")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_cli(self, *argv, **kw):
        return cli.main(["--data-dir", str(self.data), *argv], now=NOW, env={}, **kw)

    def test_fetch_writes_files_then_second_run_merges(self):
        tv, yh = clients(all_rows())
        self.assertEqual(self.run_cli(tv=tv, yahoo=yh), 0)
        doc = json.loads((self.data / "market.json").read_text(encoding="utf-8"))
        self.assertEqual(validate_market(doc), [])
        files = sorted(p.name for p in (self.data / "prices").iterdir())
        self.assertEqual(len(files), len(UNIVERSE.stocks))
        self.assertIn("BIST-THYAO.json", files)
        self.assertIn("US-BRK.B.json", files)
        tv, yh = clients(all_rows(), history=fake_history(n=265))
        self.assertEqual(self.run_cli(tv=tv, yahoo=yh), 0)
        p = json.loads((self.data / "prices" / "US-AAPL.json").read_text(encoding="utf-8"))
        self.assertEqual(len(p["t"]), 265)

    def test_dry_run_writes_nothing(self):
        before = (self.data / "market.json").read_text(encoding="utf-8")
        tv, yh = clients(all_rows())
        self.assertEqual(self.run_cli("--dry-run", tv=tv, yahoo=yh), 0)
        self.assertEqual((self.data / "market.json").read_text(encoding="utf-8"), before)
        self.assertFalse((self.data / "prices").exists())

    def test_seed_is_idempotent(self):
        before = (self.data / "market.json").read_text(encoding="utf-8")
        self.assertEqual(self.run_cli("--seed"), 0)
        self.assertEqual((self.data / "market.json").read_text(encoding="utf-8"), before)

    def test_compare_writes_step_summary(self):
        summary = self.tmp / "summary.md"
        code = cli.main(["--data-dir", str(self.data), "--compare"], now=NOW, env={"GITHUB_STEP_SUMMARY": str(summary)})
        self.assertEqual(code, 0)
        self.assertIn("Fintables", summary.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
