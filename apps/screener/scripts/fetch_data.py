#!/usr/bin/env python3
"""Data job entry point. See apps/screener/docs/DATA.md.

    python scripts/fetch_data.py              fetch both markets, write public/data
    python scripts/fetch_data.py --market US  one market
    python scripts/fetch_data.py --dry-run    fetch and validate, write nothing
    python scripts/fetch_data.py --seed       offline rebuild of market.json from the config
    python scripts/fetch_data.py --compare    BIST figures against the Fintables snapshot
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fsdata.cli import run  # noqa: E402

if __name__ == "__main__":
    sys.exit(run())
