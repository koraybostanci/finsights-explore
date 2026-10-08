"""Command line: python scripts/fetch_data.py [--market BIST|US] [--dry-run] [--seed] [--compare]."""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Mapping, Sequence

from . import CONFIG_DIR, DATA_DIR, MARKETS, REFERENCE_FILE
from .compare import build_compare
from .config import ConfigError, load_banks, load_universe
from .pipeline import DEFAULT_DAYS, DEFAULT_FAIL_SHARE, build_seed, run_fetch
from .sources import TradingViewClient, YahooClient
from .util import read_json
from .writer import (
    ValidationFailed,
    load_price_file,
    read_market,
    remove_orphan_prices,
    validate_market,
    write_market,
    write_prices,
)

log = logging.getLogger("fintools")

TURKEY = timezone(timedelta(hours=3), "TRT")  # Turkey has been on UTC+3 all year since 2016


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="fetch_data.py",
        description="Fetch fundamentals (TradingView) and daily closes (Yahoo Finance) for the stocks in "
        "config/stocks.json and write public/data/market.json and public/data/prices/.",
    )
    p.add_argument("--market", choices=MARKETS, help="only this market (the other keeps its values)")
    p.add_argument("--dry-run", action="store_true", help="fetch and validate, write nothing")
    p.add_argument("--seed", action="store_true", help="offline: rebuild market.json from the config plus existing values")
    p.add_argument("--compare", action="store_true", help="print the BIST comparison against the Fintables snapshot and exit")
    p.add_argument(
        "--fail-share",
        type=float,
        default=float(os.environ.get("FINTOOLS_FAIL_SHARE", DEFAULT_FAIL_SHARE)),
        help="a market with more than this share of stocks missing keeps its previous data (default 0.5)",
    )
    p.add_argument("--days", type=int, default=DEFAULT_DAYS, help="trading days kept per price file (default 520)")
    p.add_argument("--pause", type=float, default=1.0, help="seconds between requests to the same source (default 1)")
    p.add_argument("--config-dir", type=Path, default=CONFIG_DIR)
    p.add_argument("--data-dir", type=Path, default=DATA_DIR)
    return p


def _append_summary(env: Mapping[str, str], text: str) -> None:
    path = env.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(text if text.endswith("\n") else text + "\n")
    except OSError as e:
        log.warning("cannot append to GITHUB_STEP_SUMMARY: %s", e)


def _do_compare(args: argparse.Namespace, env: Mapping[str, str]) -> int:
    try:
        doc = read_json(args.data_dir / "market.json")
        reference = read_json(REFERENCE_FILE)
    except (OSError, ValueError) as e:
        print(f"compare: cannot read the files ({e})", file=sys.stderr)
        return 2
    result = build_compare(doc, reference)
    print(result.text)
    _append_summary(env, result.text)
    return 0


def main(
    argv: Sequence[str] | None = None,
    *,
    tv: TradingViewClient | None = None,
    yahoo: YahooClient | None = None,
    now: datetime | None = None,
    env: Mapping[str, str] | None = None,
) -> int:
    args = build_parser().parse_args(argv)
    env = os.environ if env is None else env
    now = now or datetime.now(TURKEY)

    if args.compare:
        return _do_compare(args, env)

    try:
        universe = load_universe(args.config_dir / "stocks.json")
        banks = load_banks(args.config_dir / "banks_manual.json")
    except ConfigError as e:
        print(f"config error: {e}", file=sys.stderr)
        return 2
    prev = read_market(args.data_dir)

    try:
        if args.seed:
            reference = None
            if REFERENCE_FILE.exists():
                reference = read_json(REFERENCE_FILE)
            doc = build_seed(universe, banks, prev, reference, now)
            problems = validate_market(doc)
            if problems:
                raise ValidationFailed("seed would be invalid:\n  " + "\n  ".join(problems[:30]))
            n_bist = sum(1 for s in doc["stocks"] if s["market"] == "BIST")
            msg = f"seed: {len(doc['stocks'])} stocks ({n_bist} BIST, {len(doc['stocks']) - n_bist} US)"
            if args.dry_run:
                print(msg + " (dry run, nothing written)")
            else:
                changed = write_market(doc, args.data_dir)
                print(msg + (" written" if changed else ", market.json already up to date"))
            return 0

        tv = tv or TradingViewClient(pause=args.pause)
        yahoo = yahoo or YahooClient(pause=max(args.pause * 0.4, 0.0))
        markets = (args.market,) if args.market else MARKETS
        result = run_fetch(
            universe,
            banks,
            prev,
            load_price_file(args.data_dir),
            tv,
            yahoo,
            now,
            markets=markets,
            fail_share=args.fail_share,
            days=args.days,
        )
        problems = validate_market(result.doc)
        if problems:
            raise ValidationFailed("market.json would be invalid:\n  " + "\n  ".join(problems[:30]))
        lines = [s.summary() for s in result.statuses.values()]
        if args.dry_run:
            lines.append(f"dry run: {len(result.prices)} price files and market.json would be written; nothing was")
        else:
            written = write_prices(result.prices, args.data_dir)
            removed = remove_orphan_prices(universe, args.data_dir) if not args.market else []
            changed = write_market(result.doc, args.data_dir)
            lines.append(
                f"wrote {len(written)} price files, market.json {'updated' if changed else 'unchanged'}"
                + (f", removed {len(removed)} price files of stocks no longer in the config" if removed else "")
            )
    except ValidationFailed as e:
        print(f"validation error, nothing written:\n{e}", file=sys.stderr)
        return 2

    print("\n".join(lines))
    _append_summary(env, "### Data job\n\n" + "\n".join(f"- {line}" for line in lines) + "\n")
    return result.exit_code


def run() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    return main()
