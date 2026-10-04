"""finsights.explore data pipeline.

Reads config/stocks.json, fetches fundamentals (TradingView screener) and daily
closes (Yahoo Finance), and writes public/data/market.json plus
public/data/prices/<MARKET>-<TICKER>.json. See docs/DATA.md.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = REPO_ROOT / "config"
DATA_DIR = REPO_ROOT / "public" / "data"
REFERENCE_FILE = REPO_ROOT / "scripts" / "reference" / "fintables_2026-10-02.json"

MARKETS = ("BIST", "US")
CURRENCY = {"BIST": "TRY", "US": "USD"}

# What the app shows in the data bar ("Kaynak: ...")
SOURCE_LABEL = "TradingView ve Yahoo Finance"
