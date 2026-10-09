# Data

The Screener is static. Its numbers come from two kinds of JSON file that a scheduled GitHub Actions job (`.github/workflows/data.yml`) commits to the repository. Paths below are relative to `apps/screener/`.

- `public/data/market.json`: one record per stock (`MarketData` in `src/types.ts`, schema 3)
- `public/data/prices/<MARKET>-<SYMBOL>.json`: daily closes per stock (`PriceSeries`), the last 520 trading days, for example `prices/BIST-THYAO.json`

Both are validated against `config/market.schema.json` and `config/prices.schema.json` before anything is written.

## Sources

| Source | Used for | Notes |
|---|---|---|
| TradingView screener (`scanner.tradingview.com/{turkey,america}/scan`) | price, multiples, growth, analyst target, SMA fallback | One POST per market. Unofficial, no key, about 15 minutes delayed. An unknown optional column is dropped and reported instead of failing the run. |
| Yahoo Finance (`yfinance`) | daily closes, moving averages, chart | One request per stock. Unofficial, no key, rate-limited at times. |

There is no free official API for BIST fundamentals. If a source stops working, the app keeps the last good data and its data bar shows the date.

## Data format

`market.json` top level:

| Field | Meaning |
|---|---|
| `schema` | always `3` |
| `asOf` | time of the latest update of either market (ISO 8601 with offset) |
| `asOfBy` | update time per market (`BIST`, `US`); a scheduled run fetches one market, so the two differ |
| `source` | text shown in the data bar |
| `period` | balance-sheet period per market, `YYYY/M`, the one most stocks share |
| `industries` | id to `nameTr`, `nameEn`, `cyclical` |
| `stocks` | array of stock records |

Stock record. Multiples and prices are rounded to two decimals, market cap to one, growth to whole numbers. `null` means no value.

| Field | Meaning | TradingView column or rule |
|---|---|---|
| `symbol`, `name`, `market`, `industry` | from `config/stocks.json` | |
| `currency` | `TRY` for BIST, `USD` for US | |
| `bank`, `cyclical`, `functionalCurrency` | optional, copied from the config | |
| `price` | last price | `close`; a row without a positive price is rejected |
| `pe` | P/E, trailing 12 months | `price_earnings_ttm`; `null` when EPS is zero or negative |
| `loss` | `true` when EPS is zero or negative; otherwise absent | `earnings_per_share_diluted_ttm`; tells "loss" from "no P/E in the source" |
| `pb` | P/B | `price_book_fq` |
| `evEbitda` | EV/EBITDA | `enterprise_value_ebitda_ttm`; `null` for banks |
| `peg` | PEG, provider-specific, can be negative | `price_earnings_growth_ttm` |
| `netDebtEbitda` | net debt / EBITDA, negative is net cash | `net_debt` / `ebitda`; `null` when EBITDA is not positive; `null` for banks |
| `marketCap` | billions, in the stock's currency | `market_cap_basic` / 1e9 |
| `ebitdaGrowth` | EBITDA growth, % | `ebitda_yoy_growth_ttm`; `null` for banks |
| `netIncomeGrowth` | net income growth, % | `net_income_yoy_growth_ttm` |
| `ebitdaGrowthNote`, `netIncomeGrowthNote` | text when a percentage would mean nothing | see below |
| `targetPrice` | average analyst target | `price_target_average` |
| `sma20`, `sma50`, `sma200` | simple moving averages | computed from the Yahoo closes; the screener's `SMA20/50/200` when there are none |
| `note`, `noteAsOf` | hand-written comment and its day | copied from the config |
| `npl`, `car`, `nim` | banks only: NPL ratio, capital adequacy, net interest margin, % | `config/banks_manual.json` |

`price`, `pe`, `pb`, `evEbitda`, `targetPrice` and the SMAs must be positive, otherwise they are `null`; `peg` and `netDebtEbitda` can be negative. `marketCap` is rounded to one decimal. Growth notes: `"zarardan kâra"` or `"eksiden artıya"` when the source gives no growth although the current amount is positive (the base was zero or negative); `"kârdan zarara"` or `"artıdan eksiye"` when the current amount is negative after a drop of more than 100%.

Price file: `symbol`, `market`, `currency`, `dates` (ISO days, oldest first) and `closes` (same length as `dates`).

Differences from the Fintables figures (the previous data source; the reference snapshot is from 2 October 2026): growth compares trailing twelve months, not the latest period with the same period a year earlier; PEG uses each provider's own growth; Turkish inflation accounting (TMS 29 / IAS 29) is restated differently by each provider, so P/E and EV/EBITDA can differ noticeably. `python scripts/fetch_data.py --compare` prints, per BIST stock, P/E, P/B and EV/EBITDA next to `scripts/reference/fintables_2026-10-02.json` with the percentage gap. Small gaps in P/B and larger ones in P/E and EV/EBITDA are expected; several hundred percent on one stock usually means a wrong symbol or currency.

## The stock universe

`config/stocks.json` is the only place the job reads tickers from. It is edited by hand and validated against `config/stocks.schema.json` at the start of every run; a mistake stops the run with a message naming the entry.

To add a stock, add one object to `stocks`:

```json
{ "symbol": "ADBE", "name": "Adobe", "market": "US", "industry": "software", "tv": "NASDAQ:ADBE" }
```

- `symbol` and `name`: ticker and company name as shown in the app. `market`: `"BIST"` or `"US"`.
- `industry`: an id from `industries` in the same file. To add one: `"id": { "nameTr": "...", "nameEn": "...", "cyclical": false }`. Stocks of one market with the same industry are compared with each other.
- `tv`: TradingView symbol with exchange (`BIST:THYAO`, `NYSE:KO`). Required for US; BIST defaults to `BIST:<symbol>`.
- `yf`: Yahoo symbol. Defaults to `<symbol>.IS` for BIST and `<symbol>` for US; write it out when it differs, for example `BRK-B`.
- Optional: `bank` (uses `config/banks_manual.json` for NPL, CAR and NIM, which the sources do not provide; update `asOf` there when banks report), `cyclical` (overrides the industry's cyclical flag), `functionalCurrency` (functional currency note), `note` and `noteAsOf`.

The app shows a `note` only while the market's data is from the `noteAsOf` day or earlier; newer data hides it because it could contradict the new figures. To keep a note visible, rewrite it and set `noteAsOf` to the date of the data it describes.

To remove a stock, delete its object. Its price file is deleted only by a manual run of the workflow with market `all` (scheduled runs pass `--market`, and `--seed` deletes nothing). A new stock appears after the next run, or run the job by hand. People then pick which stocks they follow under Ayarlar in the app.

## How the job runs

- Schedule (Monday to Friday, UTC): 15:45 for BIST, after the 18:10 Istanbul close plus the screener delay; 21:45 for the US, after the New York close in both summer and winter time. A scheduled run fetches only its own market. A manual run (Actions, data, Run workflow) fetches `all`, `BIST` or `US`.
- Steps: install, Python unit tests, fetch, compare, then commit `apps/screener/public/data` if it changed. If the push is rejected because `main` moved, the job runs `git pull --rebase` and retries, three attempts in all. The commit triggers a rebuild of the Screener.
- The runs share one concurrency group and never overlap.
- The commit step runs even when the fetch failed, because whatever was written is valid. A failed fetch then fails the run at the end.

When things go wrong:

- A stock missing from the screener keeps its previous figures (carried forward) and is listed in the log.
- If more than half of a market's stocks have no screener data (`--fail-share`), that market keeps its previous data and the run ends red. The other market is still written.
- If Yahoo returns nothing for more than half of a market, fundamentals are still written, the SMAs fall back to the screener's values, and the run ends red.
- An invalid result writes nothing.

In the run summary, "columns the screener did not know" means a column was renamed (fix `TV_COLUMNS` in `scripts/fsdata/mapping.py`); "carried forward" usually means a wrong `tv` symbol; "no closes" usually means a wrong `yf` symbol. A warning that the last Yahoo close and the screener price differ a lot also points at a wrong symbol. If every request gets HTTP 403 or 429, a source is blocking GitHub's servers: re-run later.

## Running it yourself

From `apps/screener/`:

```
python -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt
python -m unittest discover -s scripts/tests -t scripts   # tests, no network
python scripts/fetch_data.py --dry-run                    # fetch and validate, write nothing
python scripts/fetch_data.py --market US                  # one market
python scripts/fetch_data.py                              # both markets
python scripts/fetch_data.py --compare                    # BIST against the Fintables snapshot
python scripts/fetch_data.py --seed                       # offline: rebuild market.json from the config and existing values
```

The tests fake both sources, so they need no network.
