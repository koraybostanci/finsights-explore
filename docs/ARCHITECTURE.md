# finsights.explore: architecture and conventions

A static web app (GitHub Pages) that teaches stock valuation with a coffee-shop story and then applies the same logic to BIST and US stocks. It continues the "BIST 30 Çarpan Rehberi" artifact; `docs/reference/original-artifact.html` is that page and is the reference for look, copy and behaviour.

## Principles

1. **The original design stays.** Same tokens, fonts and components (`src/styles/app.css` is the original stylesheet). New UI is built from existing components; new CSS uses the existing custom properties (`--accent`, `--line`, `--ui` …) and never introduces a new colour, font or visual language. Light and dark both work because everything goes through the tokens.
2. **Learn, then apply.** Stories first; every new feature has a "learn" part and an "apply" part.
3. **BIST and US stocks never share a table, chart or median.** Every list is for one market. `store.stocks(market)` enforces this.
4. **Turkish UI, English counterparts for technical terms.** Use `term('fk')` from `src/terms.ts` so "F/K (P/E)" is written the same way everywhere.
5. **Numbers are deterministic.** They come from `public/data/market.json`. AI only explains and asks questions, with the user's own API key, and the app is fully usable without a key.
6. **Desktop web app first.** The original responsive behaviour is kept, but phone layouts are not a goal.
7. **No invented figures.** Missing data is shown as "–" or "Veri bekliyor", never estimated.

## Stack

- Vite + TypeScript, no framework. Screens render with template strings and DOM events, as the original did.
- TypeScript is written in erasable syntax only (no enums, no parameter properties), with `import type` for types and explicit `.ts` extensions in imports. This lets Node run the unit tests directly: `node --test "tests/**/*.test.ts"`.
- No runtime dependencies.
- No Vite-specific APIs in `src/` (`import.meta.env` etc.); data is fetched with document-relative URLs (`./data/...`), so the build works under any Pages path.

## Layout

```
index.html                  shell markup (header, tab bar, footer)
src/main.ts                 shell: tabs, data bar, mounts each tab module
src/types.ts                data contract and shared types
src/data/store.ts           market data, watchlist per market, events, price series
src/lib/                    format, dom/svg helpers, evaluate (screening rules), stats, sma
src/terms.ts                term dictionary (TR + EN)
src/styles/app.css          original stylesheet (do not restyle)
src/styles/shared.css       new shared components (.seg, .box, tr.med, .two …)
src/learn/                  Senaryolar, Çarpanlar, Sözlük, Karar adımları
src/screener/               Tarayıcı (Sektör kıyası + Tüm liste, stock detail)
src/banks/                  Bankalar (BIST only)
src/calc/                   Kendi hesabın
src/ai/                     provider adapters, prompts; types.ts is the contract
src/settings/               Ayarlar (AI provider, watchlist)
src/quiz/                   Kendini sına
config/stocks.json          the stock universe and industries (edited by hand)
scripts/                    data job (Python), run by GitHub Actions
public/data/market.json     generated data, committed
public/data/prices/         daily closes per stock, generated
tests/                      unit tests (node:test)
```

## Tab modules

Each tab is a module with:

```ts
export function mount(root: HTMLElement): void;   // once, after data is loaded
export function refresh(): void;                  // when the tab is shown and on resize (redraw charts)
```

`root` is the tab's `<section class="panel stack-lg">`. Charts measure their container with `cw()` and skip drawing when it returns 0 (tab hidden). Modules subscribe to store events with `on('data' | 'watchlist' | 'ai', fn)`.

To send the user to another tab: `location.hash = '#ayarlar'` (tab ids: `senaryo`, `kavramlar`, `sozluk`, `adimlar`, `tarayici`, `bankalar`, `hesap`, `sina`, `ayarlar`).

## Data contract

See `src/types.ts`. Short field names (`k`, `ad`, `fk`, `pd`, `fdf`, `peg`, `nb`, `mv`, `fg`, `ng`, `h`) are kept from the original so the screening rules read the same.

- `public/data/market.json` → `MarketData` (`schema: 1`).
- `public/data/prices/<MARKET>-<TICKER>.json` → `PriceSeries` (daily closes, oldest first).
- `StockView` adds derived fields (`roe`, `sek`, `sekEn`, `cyclical`, `hasData`).
- A stock with no data yet has `f: null` and nulls throughout; `hasData` is false and it is shown as "Veri bekliyor".
- `asOfBy` holds the data time per market, because the data job fetches one market per scheduled run. Read it with `marketAsOf(market)`; never show one market's figures with the other market's date.
- An empty `fk` means a loss only when `loss` is true. Without the flag the app says the F/K is missing, not that the company lost money.
- Hand-written notes (`not`) are shown only while the market's data is from the day they were written (`noteIsCurrent`).

## Rules for code

- Everything written into HTML from data, user input or AI output goes through `esc()`.
- API keys live only in `localStorage` (prefix `finsights.`), are never logged and never put in a URL.
- The production build carries a Content-Security-Policy (`vite.config.ts`): scripts only from the site itself, so no inline `<script>` and no third-party script. Inline `style` attributes are allowed.
- User-visible text is Turkish, sentence case, in the voice of the original copy.
- Feature CSS lives next to the feature (`src/screener/screener.css`, imported from its module).
- Persist small UI state with `lsGet` / `lsSet` from the store.

## Local checks

```
npm install
npm run typecheck   # app code and tests
npm test
npm run build     # output in dist/
```
