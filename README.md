# fintools

Two small static web apps for learning stock valuation and screening BIST and US stocks. For education only, not investment advice.

- **Learn**, "Hisse Değerleme Rehberi (Valuation Guide)": stories with sliders and charts, multiples, a glossary, decision steps and a quiz. No data, no network, no API key.
- **Screener**, "Hisse Tarayıcı (Stock Screener)": BIST and US stocks checked against adjustable rules, a bank view, a calculator, and settings with a watchlist and optional AI comments. AI uses your own API key, which stays in your browser; requests go straight to the provider. Everything else works without a key.

The UI is Turkish, with an English counterpart for technical terms, for example "F/K (P/E)". Code and documentation are English.

## Layout

```
apps/learn/      Learn app (Vite + TypeScript)
apps/screener/   Screener app, its data job (Python) and data: config/, scripts/, public/data/
shared/          @fintools/shared: code and styles used by both apps
docs/            ARCHITECTURE.md
```

Each app is an independent npm project with its own lockfile. There are no npm workspaces and no runtime dependencies.

## Run and check

Needs Node 22.18 or later.

```
npm --prefix apps/learn ci
npm --prefix apps/screener ci
npm run dev:learn          # or dev:screener
npm run check              # shared tests, typecheck, tests and build of both apps
```

`npm run check:learn` and `npm run check:screener` check one app. The Python tests for the data job are in [apps/screener/docs/DATA.md](apps/screener/docs/DATA.md).

## Data

The Screener's numbers come from a scheduled GitHub Actions job (`.github/workflows/data.yml`) that commits `apps/screener/public/data`. Sources, schema, adding a stock and the failure rules are in [apps/screener/docs/DATA.md](apps/screener/docs/DATA.md). Code structure and conventions are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deploy

Cloudflare Workers with static assets: one Worker per app, each built from this repo by Workers Builds. A data commit triggers a rebuild of the Screener.

In the Cloudflare dashboard, create two Workers from this repository:

| Setting | Learn | Screener |
|---|---|---|
| Worker name (matches `wrangler.jsonc`) | `fintools-learn` | `fintools-screener` |
| Root directory | `apps/learn` | `apps/screener` |
| Build command | `npm run check && npm run build` | same |
| Deploy command | `npx wrangler deploy` | same |
| Build watch paths | `apps/learn/*`, `shared/*`, `tsconfig.base.json` | `apps/screener/*`, `shared/*`, `tsconfig.base.json` |

Also:

- Make sure the `workers.dev` subdomain is enabled for each Worker.
- Leave the preview settings at their defaults.
- After the first deploy, put both URLs into `shared/src/sites.ts`. Until then the apps do not link to each other.

## Notes

- Each app has its own origin, so `localStorage` is separate: watchlist, thresholds and the API key live only in the Screener. Learn keeps just its last tab and quiz score.
- Fundamentals come from the unofficial TradingView screener and daily closes from Yahoo Finance. Both are delayed.
