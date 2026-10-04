# finsights.explore

Hisse değerlemeyi önce bir kahvecinin hikâyesiyle öğreten, sonra aynı mantığı BIST ve ABD hisselerine gerçek verilerle uygulatan bir web uygulaması. Eğitim amaçlıdır; yatırım tavsiyesi değildir.

A static web app that teaches stock valuation with a coffee-shop story (in Turkish, with English counterparts for the technical terms) and then applies the same rules to BIST and US stocks. It continues the "BIST 30 Çarpan Rehberi" page and keeps its design.

## What is in it

- **Senaryolar**: nine short stories with sliders and charts (balance sheet, income statement, multiples, PEG, inflation accounting, cyclicality, banks, moving averages, why two markets are kept apart).
- **Çarpanlar, Sözlük, Karar adımları**: formulas, a searchable glossary, an ordered checklist.
- **Tarayıcı**: screening rules with adjustable thresholds. BIST and US stocks are always in separate tables. "Sektör kıyası" compares the stocks of one industry with the industry median; "Tüm liste" is the full table. An opened row shows the reasons, moving averages (SMA 20/50/200) and, with an API key, an AI commentary.
- **Bankalar** (BIST only), **Kendi hesabın** (calculator), **Kendini sına** (quiz).
- **Ayarlar**: the AI provider (Claude, Gemini, OpenAI, OpenCode Go or any OpenAI-compatible address) with your own API key, and your watchlist per market.

Everything works without an API key. The key, if you add one, stays in your browser and requests go straight from the browser to the provider.

## Develop

Needs Node 22.18 or later.

```
npm install
npm run dev         # local server
npm run typecheck   # app code and tests
npm test            # unit tests (Node's test runner)
npm run build       # output in dist/
```

There is no `package-lock.json` in the repository yet. Commit the one your first `npm install` creates; the Pages workflow then installs with `npm ci` and builds become reproducible.

Data job (Python 3.12): see [docs/DATA.md](docs/DATA.md).

## Deploy to GitHub Pages

1. Push to `main`.
2. Repository Settings → Pages → Source: **GitHub Actions**.
3. Settings → Actions → General → Workflow permissions: **Read and write** (the data job commits `public/data`).
4. Actions → **data** → Run workflow, to fetch the first real data. After that it runs on weekdays by itself and the site redeploys after each run.

## Configure

- **Stocks**: `config/stocks.json` (one object per stock, grouped by industry). See [docs/DATA.md](docs/DATA.md).
- **Bank figures** kept by hand: `config/banks_manual.json`.
- **How the code is organised**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Data sources

Fundamentals from the TradingView screener and daily closes from Yahoo Finance, both unofficial and delayed. Until the data job has run, the app shows the BIST figures of a Fintables snapshot dated 2 October 2026 and no US figures.
