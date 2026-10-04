# Data

The site is static. Its numbers come from two JSON outputs that a scheduled GitHub Actions job (`.github/workflows/data.yml`) writes into the repository:

- `public/data/market.json`: one record per stock (`MarketData` in `src/types.ts`)
- `public/data/prices/<MARKET>-<TICKER>.json`: daily closes per stock (`PriceSeries`), about the last 520 trading days

Until the job has run once, `market.json` holds the seed: the BIST figures of the original app (a Fintables snapshot of 2 October 2026) and every US stock with empty figures ("Veri bekliyor"). There are no price files yet, so moving averages are empty.

## Sources and their limits

| Source | Used for | How | Caveats |
|---|---|---|---|
| TradingView screener (`scanner.tradingview.com/{turkey,america}/scan`) | Price, multiples, growth, analyst target, SMA fallback | One POST per market with plain `requests` | Unofficial endpoint, no key, about 15 minutes delayed. Field names can change; an unknown optional field is dropped and reported instead of failing the run. Subject to TradingView's terms of use. |
| Yahoo Finance (`yfinance`) | Daily closes for the moving averages and the chart | One request per stock | Unofficial, no key. Yahoo rate-limits at times; `yfinance` 0.2.58 or later works around it. Subject to Yahoo's terms of use. |

There is no free official API for BIST fundamentals. If either source stops working, the site keeps showing the last good data and the data bar shows its date.

Neither source could be called from the environment this code was written in. The request shapes and field names were checked against the source code of the `TradingView-Screener`, `tvscreener` and `yfinance` projects, and the whole flow is covered by tests with faked responses, but **the first real run is the first real test**. See the checklist at the end.

## Field mapping

| Field | Meaning | Screener column | Rule |
|---|---|---|---|
| `f` | Price | `close` | Must be positive, otherwise the row is rejected |
| `fk` | F/K (P/E), trailing 12 months | `price_earnings_ttm` | Empty when `earnings_per_share_diluted_ttm` is zero or negative |
| `pd` | PD/DD (P/B) | `price_book_fq` | Positive values only |
| `fdf` | FD/FAVÖK (EV/EBITDA) | `enterprise_value_ebitda_ttm` | Positive values only; empty for banks |
| `peg` | PEG | `price_earnings_growth_ttm` | As given (can be negative) |
| `nb` | Net borç/FAVÖK | `net_debt` ÷ `ebitda` | Negative means net cash; empty when EBITDA is missing or not positive; empty for banks |
| `mv` | Market cap, billions | `market_cap_basic` ÷ 1e9 | One decimal, in the stock's currency |
| `fg` | EBITDA growth, % | `ebitda_yoy_growth_ttm` | Whole number; see growth texts below; empty for banks |
| `ng` | Net income growth, % | `net_income_yoy_growth_ttm` | Whole number; see growth texts below |
| `h` | Average analyst target | `price_target_average` | Positive values only |
| `sma20/50/200` | Simple moving averages | Computed from the Yahoo closes | Falls back to the screener's `SMA20/50/200` when there are no closes |
| `period` | Balance-sheet period | `fiscal_period_end_fq` | The period most stocks of the market share, as `YYYY/M` |

Growth texts: when a percentage would be meaningless the number is left empty and a short text is stored instead (`fgT`, `ngT`): "zarardan kâra" or "eksiden artıya" when the source gives no growth figure although the current amount is positive (the base was zero or negative), "kârdan zarara" or "artıdan eksiye" when the current amount is negative after a drop of more than 100%.

Multiples and prices are rounded to two decimals (half up), growth to whole numbers.

### How these differ from the old Fintables figures

- **Growth.** Fintables compared the latest balance-sheet period with the same period a year earlier. The screener's `*_yoy_growth_ttm` compares trailing twelve months. The numbers will not match.
- **PEG.** Each provider uses its own growth figure. Treat PEG as provider-specific.
- **Inflation accounting.** Turkish companies report under TMS 29 / IAS 29. Providers restate differently, so F/K and FD/FAVÖK can differ noticeably between sources for the same company and date.
- **Banks.** NPL, CAR and NIM are not available from these sources (see below).

The compare step quantifies this on every run: `python scripts/fetch_data.py --compare` prints, per BIST stock, F/K, PD/DD and FD/FAVÖK from the new data next to `scripts/reference/fintables_2026-10-02.json` with the percentage gap. On GitHub it appears in the job summary.

## The stock universe: `config/stocks.json`

This file is the only place the job reads tickers from, and it is meant to be edited by hand.

To add a stock, add one object to `stocks`:

```json
{ "k": "AAPL", "ad": "Apple", "market": "US", "industry": "consumer_electronics", "tv": "NASDAQ:AAPL", "yf": "AAPL" }
```

- `k`: ticker as shown in the app. `ad`: company name.
- `market`: `"BIST"` or `"US"`. The two are never mixed in the app.
- `industry`: an id from `industries` in the same file. Stocks of one market with the same industry are compared with each other. To add an industry, add `"id": { "tr": "…", "en": "…", "cyclical": true|false }`.
- `tv`: TradingView symbol with exchange (`BIST:THYAO`, `NASDAQ:AAPL`, `NYSE:KO`). Required for US stocks; BIST defaults to `BIST:<k>`.
- `yf`: Yahoo symbol. Defaults to `<k>.IS` for BIST and `<k>` for US (write it out when it differs, e.g. `BRK-B`).
- Optional: `bank` (BIST only for now), `cyc` (overrides the industry's cyclical flag), `usd` (functional currency note), `note` and `noteAsOf` (a hand-written comment shown with its date).

To remove a stock, delete its object. Its price file is removed on the next full run.

The file is validated against `config/stocks.schema.json` at the start of every run; a mistake stops the run with a message that names the entry.

The new stock appears in the app after the next run of the data job (or run it by hand, see below). In the app, people then choose which stocks of the universe they follow under Ayarlar → Hisselerim.

## Bank figures: `config/banks_manual.json`

The bank tab is BIST-only. Its NPL, CAR and NIM figures are not in the free sources, so they are kept by hand in this file and merged into the bank records on every run. Update them when the banks publish quarterly results and change `asOf`.

## How the job runs

- **Schedule** (weekdays, UTC): 15:45 for BIST (after the 18:10 Istanbul close plus the screener delay) and 21:45 for the US (after the New York close in both summer and winter time). Each scheduled run fetches only its own market. A manual run (Actions → data → Run workflow) can fetch one market or both.
- **Steps**: install, run the Python unit tests, fetch, compare, commit `public/data` if it changed. The `pages` workflow then rebuilds and deploys the site.
- **When things go wrong**
  - A stock missing from the screener keeps its previous figures (carried forward) and is listed in the log.
  - If more than half of a market's stocks have no screener data (`--fail-share`), that market keeps its previous data entirely and the run ends red. The other market is still written.
  - If Yahoo fails for more than half of a market, fundamentals are still written, moving averages fall back to the screener's values, and the run ends red.
  - The result is validated against `config/market.schema.json` before anything is written. An invalid result writes nothing.
  - A red run never leaves the site broken: whatever is committed is valid.

## Running it yourself

```
python -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt
python -m unittest discover -s scripts/tests -t scripts   # tests, no network
python scripts/fetch_data.py --dry-run                    # fetch and validate, write nothing
python scripts/fetch_data.py --market US                  # one market
python scripts/fetch_data.py                              # both
python scripts/fetch_data.py --compare                    # BIST against the Fintables snapshot
python scripts/fetch_data.py --seed                       # offline: rebuild market.json from the config and existing values
```

## First-run checklist

1. In the repository settings, set Pages → Source to "GitHub Actions", and under Actions → General allow workflows read and write permissions (the data job pushes commits).
2. Actions → data → Run workflow, market "all".
3. Open the run's summary:
   - "columns the screener did not know" means a field name has changed. That figure stays empty; fix the name in `TV_COLUMNS` in `scripts/fsdata/mapping.py`.
   - "carried forward" lists stocks the screener did not return. Usually the `tv` symbol in the config is wrong (exchange changed).
   - "no closes" lists stocks Yahoo did not return. Usually the `yf` symbol is wrong.
   - A warning that the last Yahoo close and the screener price differ a lot points at a wrong symbol too.
4. Read the compare table. Small gaps in PD/DD and larger ones in F/K and FD/FAVÖK are expected (see above). A gap of several hundred percent on one stock usually means a wrong symbol or a currency problem.
5. If a source is blocked from GitHub's servers (HTTP 403/429 for every request), the run ends red and the site keeps its previous data. Re-run later; if it persists, the source seam in `scripts/fsdata/sources.py` is where another provider would be plugged in.
6. Check the site: Tarayıcı should show US stocks with figures, and an opened row should show the moving-average chart.
