# Plan: from "BIST 30 Çarpan Rehberi" artifact to a GitHub Pages app

Status: draft for approval · 3 Oct 2026

## 1. Where we start

The current app is one 105 KB HTML file (vanilla JS, hand-drawn SVG charts, three Google fonts) with seven tabs:

| Tab | Content |
|---|---|
| Senaryolar | 7 stories (Ayşe'nin Kahvesi → bilanço, gelir tablosu, çarpanlar, PEG, enflasyon muhasebesi, döngüsellik, banka mantığı), each with sliders and a "Ne öğrendik?" box |
| Çarpanlar, Sözlük, Karar adımları | Formula cards, searchable glossary (TR + EN), ordered decision checklist |
| BIST 30 tarayıcı, Bankalar | 25 non-bank stocks + 5 banks, six pass/fail criteria with adjustable thresholds |
| Kendi hesabın | Calculator for any stock's numbers |

Three things do not survive the move off claude.ai:

1. **Data refresh.** The "Verileri güncelle" button fires a Claude scheduled task that reads Fintables and writes into the artifact's database. None of that exists on GitHub Pages.
2. **The stock list is code.** 30 tickers, their sector labels, the `cyc` (cyclical) flag and a hand-written note per stock are hard-coded. Story call-outs quote fixed numbers ("THYAO PD/DD 0,40").
3. **There is no AI call inside the page.** The "AI" today is the scheduled task plus notes written at build time. Requirement 2 therefore needs a decision on what the AI does (section 3.3).

## 2. Requirements, made concrete

| # | Requirement | What it means in the build |
|---|---|---|
| 1 | US stocks, configurable list, grouped per industry | Stock list moves to a config file + in-app watchlist. Every stock carries market, sector, industry. BIST and US stocks never share a table: the screener has a market switch, and inside each market it groups by industry and shows the industry median. |
| 2 | AI provider configurable (Claude, Gemini, OpenAI, OpenCode Go) | Settings page: provider, API key, model, "test connection". Keys stay in the browser. One adapter per API shape. |
| 3 | Name + design mockups with alternatives | The existing design is kept. Mockups show the new screens in that design, with two layout options for the screener and four name options. |
| 4 | Concept unchanged: learn, then apply | Stories stay first. Every new feature (US stocks, SMA, AI) gets a "learn" part and an "apply" part. |
| 5 | SMA information, also per selected stock | New story + glossary terms; SMA 20/50/200 per stock, price-vs-SMA chart, screener columns. |
| 6 | Turkish UI, English counterpart on technical terms | One term dictionary (`tr`, `en`, short definition) used everywhere, so "Hareketli ortalama (Simple moving average, SMA)" is rendered the same way in stories, tables and AI answers. |

## 3. Alternatives

### 3.1 Where the numbers come from

A static site cannot scrape, and no free official API offers BIST fundamentals.

| Option | How | For | Against |
|---|---|---|---|
| **A. GitHub Actions data job (recommended)** | A scheduled workflow runs a script, writes `data/*.json`, Pages serves it | Free, no key in the browser, works for every visitor, same pipeline for BIST and US, SMA computed from our own price history | Sources are unofficial (see below); a newly added ticker appears after the next run |
| B. Browser calls a data API with the user's key | FMP / Twelve Data / Finnhub | Instant, official | BIST is on paid tiers (Twelve Data lists Borsa İstanbul under Grow+), another key to manage |
| C. Keep the Claude scheduled task, let it commit JSON to the repo | Today's pipeline, new destination | Keeps Fintables-quality BIST numbers | Only works from your Claude account, token cost grows with list size, fragile |
| D. Let the configured AI fetch the numbers | Provider web-search tools | No pipeline | Non-deterministic numbers, costs per refresh, OpenCode Go models have no search tool. Not recommended for figures. |

Source candidates for option A:

- **TradingView screener endpoint** (via `tradingview-screener`): one request per market for Turkey and the US; its field list covers P/E, P/B, EV/EBITDA, growth, sector, industry and SMA 20/50/200 (exact field names to be confirmed on the first run). No key, 15-minute delayed, unofficial.
- **Yahoo Finance** (via `yfinance`): price history and fundamentals for both markets (`THYAO.IS`, `AAPL`). No key, unofficial, has had rate-limit episodes (fixed in 0.2.58+ with browser impersonation).
- **borsapy**: BIST-only, rich (statements, ratios, analyst targets), personal/educational use only.
- **SEC EDGAR**: official US statements, free. Useful later for a "read the real filing" learning step.

Proposal: TradingView screener as primary (fundamentals + SMA + industry in two requests), Yahoo for the daily closes behind the SMA chart, and a first-run cross-check against the 2 Oct Fintables snapshot already in the app (e.g. THYAO F/K 3,60, PD/DD 0,40) so we know how far the new source deviates before trusting it.

Known gap: the bank tab's NPL, CAR and NIM came from Fintables. They are not in these sources. Either the bank view shrinks to ROE vs PD/DD (the core lesson), or those three stay as a small manually maintained file.

### 3.2 How the stock list is configured

| Option | How | Note |
|---|---|---|
| **A. Universe file + local watchlist (recommended)** | `config/stocks.json` in the repo defines the universe (default: BIST 30 + ~40 US names across the same industries). In the app, "Hisselerim" picks from it; the choice is stored in the browser. | Add/remove inside the universe is instant. A ticker outside it means editing one JSON line; Settings shows the snippet and a link to GitHub's editor. |
| B. A + commit from Settings | Settings takes a fine-grained GitHub token, commits the config and starts the data job | Feels like an app, but a write token sits in the browser |
| C. Wide universe | Pre-fetch BIST 100 + S&P 500 | "Add any stock" without touching the repo; bigger data files, more load on unofficial sources |

Industry is taken from the data source's classification, mapped to a Turkish label with the English one beside it (e.g. "Havayolu · Airlines"), and can be overridden per ticker in the config. BIST and US stocks are kept in separate tables (decision of 4 Oct 2026). Each market has its own table, its own industry groups and its own medians; the watchlist in Settings is split the same way. A short lesson explains why the two are not put side by side (currency, inflation accounting, country risk).

### 3.3 What the AI does

Numbers stay deterministic; the AI explains and questions. Candidates:

1. **Hisse yorumu** – explains one stock's multiples and SMA position in the coffee-shop vocabulary. Replaces the hand-written per-stock notes, so it works for any stock you add.
2. **Sektör karşılaştırması** – compares the stocks of one industry and says what the differences might mean.
3. **Kendini sına** – builds a short quiz from the stories and asks you to apply it to real stocks in your list.
4. **Hoca'ya sor** – free question box, grounded in the glossary and the current data.

Without a key the app still works fully; rule-based reasons (already there) cover the basics.

Provider adapters (three API shapes cover all four providers):

| Provider | Endpoint | Browser status |
|---|---|---|
| Claude | `api.anthropic.com/v1/messages` + `anthropic-dangerous-direct-browser-access: true` | Preflight tested today: allowed |
| OpenAI | `api.openai.com/v1/chat/completions` | Works per community reports; a one-day CORS outage in Oct 2025 was a bug. Not testable from my sandbox. |
| Gemini | native `generateContent` | The OpenAI-compatible endpoint has open preflight complaints, so native is the safer path. Not testable from my sandbox. |
| OpenCode Go | `opencode.ai/zen/go/v1/chat/completions` (OpenAI shape), `/v1/messages` (Anthropic shape) | **Unverified.** Docs describe CLI use only. If the browser is blocked, this provider needs a tiny proxy or is dropped. |
| Custom (OpenAI-compatible) | user-supplied base URL | Covers OpenRouter, Groq, local Ollama |

Model is a dropdown filled from the provider's model-list call, with a free-text fallback, so nothing is hard-coded.

Key handling: stored in `localStorage` on the device only. One caveat for GitHub Pages: every `username.github.io/*` project shares one origin, so your other Pages projects could read it. A custom domain removes that.

### 3.4 Stack

| Option | For | Against |
|---|---|---|
| **A. No-build ES modules (recommended)** | Push = deploy, existing code ports directly, one file per feature keeps parallel agents out of each other's way | No types |
| B. Vite + TypeScript | Types, bundling, tests | Build step, more scaffolding |

Either way: desktop web app first, existing responsive behaviour kept, unit tests for the calculation modules.

## 4. Name and design

Name candidates (not trademark-checked):

| Name | Why |
|---|---|
| **Mihenk** | Touchstone: the stone that tests whether gold is real. Valuation in one word. |
| **Fincan** | The coffee-shop story is the heart of the app. Cozy; "fincan fincan öğren". |
| **Defter** | "Defter değeri" (book value) + a learner's notebook. |
| **Telve** | Coffee grounds. Tagline: "Fal değil, hesap." |
| **Sarraf** | The one who knows what things are worth. |

Design decision (4 Oct 2026): **the existing design stays.** Same tokens (teal accent, Bricolage Grotesque / Literata / JetBrains Mono, white cards on the grey-blue ground), same components (sticky tab bar, controls panel, pills, table with expandable rows, tiles, chart boxes, "Ne öğrendik?" boxes). New features are built out of these components; no new visual language. The app is a desktop web app first; the current responsive behaviour is kept but phone use is not a goal for now, so no PWA work.

Mockups (desktop, 1280 px, built from the app's own stylesheet) cover only what is new:

- **Tarayıcı, option 1: one table per market.** A BIST / ABD switch, then today's table with industry header rows, a median row per industry and an SMA 200 column. The expanded row gains the AI commentary and a moving-averages block.
- **Tarayıcı, option 2: industry comparison.** A second view in the same tab: pick a market, then an industry, and see that market's peers in a narrower table that fits without sideways scrolling, a position-versus-median chart and the AI industry comparison.
- **Ayarlar.** AI provider, key, model, connection test; watchlist grouped by industry.
- **Name options** in the existing header.

impeccable (pbakaus) and hallmark (nutlope) are downloaded in the workspace and are used for the audit pass in package 6, not for restyling.

## 5. Work packages

Step 0 is serial and done by me; packages 1–5 run as parallel agents with disjoint files; 6 is an independent check.

| # | Package | Owns | Depends on |
|---|---|---|---|
| 0 | Scaffold and contracts: Vite + TypeScript project, the existing stylesheet moved over unchanged as the design system, typed data contract, module interfaces, fixture data built from the 2 Oct snapshot | `index.html`, `src/styles/`, `src/types.ts`, `public/data/fixture.json` | screener layout pick |
| 1 | Data pipeline: fetch script, universe config, scheduled workflow, schema validation, cross-check vs Fintables snapshot | `scripts/`, `config/stocks.json`, `.github/workflows/data.yml` | 0 |
| 2 | App shell: tab navigation, light/dark theme as today, shared components lifted from the current page (term, pill, table, tiles, chart primitives) | `src/shell/`, `src/components/` | 0 |
| 3 | Learning content: port 7 stories unchanged, add SMA story and a short "BIST ile ABD neden ayrı tabloda?" lesson, glossary with EN counterparts, data-driven examples in place of fixed numbers | `src/learn/`, `src/terms.ts` | 0 |
| 4 | Screener and stock detail: industry grouping, peer medians, watchlist, banks, SMA block, calculator | `src/screener/`, `src/stock/` | 0 |
| 5 | AI layer and settings: adapters, settings tab, prompts, Hisse yorumu, Sektör karşılaştırması, Kendini sına | `src/ai/`, `src/settings/`, `src/quiz/` | 0 |
| 6 | Verification: unit tests on formulas, side-by-side screenshots against the original artifact at 1280, contrast and a11y pass, impeccable/hallmark audit | `tests/` | 1–5 |
| 7 | Integration, Pages workflow, README (TR), push | `.github/workflows/pages.yml`, `README.md` | 6, repo name |

## 6. Risks and limits

- **My sandbox cannot reach market-data hosts** (Yahoo, TradingView, İş Yatırım all blocked). The pipeline is developed against fixtures and first runs for real on GitHub Actions; expect one fix round after the first run.
- **Unofficial sources can change or block.** The app shows data age prominently and keeps the last good file.
- **OpenAI, Gemini and OpenCode Go browser access is unverified from here**; the "test connection" button is the real check, on your device.
- **BIST multiples from a new source will differ from Fintables** (TTM definitions, inflation accounting). The cross-check quantifies it.
- **Not investment advice**; the disclaimer stays, and AI answers are framed as explanations.

## 7. Decisions

Taken on 3 Oct 2026:

| Topic | Decision | Consequence |
|---|---|---|
| AI role (3.3) | Hisse yorumu, Sektör karşılaştırması, Kendini sına. No free chat. | Three fixed prompt templates, each fed the term dictionary and the relevant rows of data. Structured output for the quiz. |
| Data (3.1) | A: GitHub Actions job | `scripts/` in Python, runs on a schedule and on demand, commits `public/data/*.json`. |
| Stock list (3.2) | A: universe file + local watchlist | `config/stocks.json` is the only place the pipeline reads tickers from. No GitHub token in the browser. |
| Stack (3.4) | B: Vite + TypeScript | Typed data contract shared by all packages (`src/types.ts`), Vitest for formulas, Pages deploy builds `dist/`. Folder names in section 5 move under `src/`. |

Still open:

1. Name and design direction, from the mockups.
2. Bank metrics (NPL, CAR, NIM): drop, or keep as a small manual file.
3. Repo name.

## Sources

- [OpenCode Go docs](https://opencode.ai/docs/go/)
- [Claude API CORS header – Simon Willison](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access)
- [Gemini OpenAI-compatibility CORS thread](https://discuss.ai.google.dev/t/gemini-api-cors-error-with-openai-compatability/58619)
- [OpenAI browser CORS incident, Oct 2025](https://community.openai.com/t/chat-completions-api-endpoint-down-blocked-any-web-browser-request/1362527)
- [Twelve Data – Borsa İstanbul coverage](https://twelvedata.com/exchanges/XIST)
- [TradingView-Screener package](https://github.com/shner-elmo/TradingView-Screener)
- [yfinance rate-limit issue #2422](https://github.com/ranaroussi/yfinance/issues/2422)
- [borsapy](https://github.com/saidsurucu/borsapy)
- [impeccable](https://github.com/pbakaus/impeccable) · [hallmark](https://github.com/nutlope/hallmark)
