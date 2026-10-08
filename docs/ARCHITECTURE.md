# Architecture

Two static apps, Learn and Screener, plus a small shared package. Vite + TypeScript, no framework: screens render with template strings and DOM events. See the [README](../README.md) for how to run and deploy, and [DATA.md](../apps/screener/docs/DATA.md) for the data job.

## Layout

```
apps/learn/       index.html, vite.config.ts, wrangler.jsonc, src/ (one module per tab), tests/
apps/screener/    same files, plus config/, scripts/ (Python), public/data/, docs/DATA.md
shared/src/       format, dom, sma, terms, storage, shell, sites, vite-csp, styles/
shared/tests/     tests for the shared modules
tsconfig.base.json  strict TypeScript settings, extended by both apps
```

Each app has its own `package.json` and lockfile and depends on `"@fintools/shared": "file:../../shared"`. The root `package.json` only holds scripts.

## Shared package

`@fintools/shared` is plain TypeScript with no dependencies. Apps import a module by name without an extension, for example `@fintools/shared/format` or `@fintools/shared/styles/tokens.css`. Vite serves it from outside the app folder, so each `vite.config.ts` sets `server.fs.allow` to include `../../shared`; without it the dev server answers with 403.

| Module | Purpose |
|---|---|
| `format` | number, percent, money and date formatting, `esc()` for HTML |
| `dom` | `must()`, `cw()` (container width) and SVG text helpers |
| `sma` | moving averages, crosses and trend |
| `terms` | the term dictionary (see below) |
| `storage` | `createStorage(prefix)` gives `lsGet`, `lsSet`, `lsRemove` over localStorage |
| `shell` | `createApp()`: tab row, hash routing, last tab |
| `sites` | URLs of the two apps, used for the link between them (hidden while empty) |
| `vite-csp` | the Content-Security-Policy plugin; each app passes its `connect-src` |
| `styles/` | `tokens.css`, `layout.css`, `components.css` shared by both apps |

## Tab contract

A tab is a module that exports:

```ts
export function mount(root: HTMLElement): void;  // once, after beforeMount has run
export function refresh(): void;                 // optional: tab shown, page width changed
```

`root` is the tab's `<section class="panel stack-lg">`. Charts measure their container with `cw()` and skip drawing when it returns 0 (hidden tab); `refresh()` redraws them.

Each app's `main.ts` builds a list of tabs and calls `createApp({ tabs, defaultTab, storage, beforeMount })`. `beforeMount` runs once before the tabs mount (the Screener loads its data there). The shell opens the tab named in the URL hash, otherwise the last open tab from storage, otherwise `defaultTab`. To send the user to another tab, set `location.hash = '#settings'`.

Tab ids: Learn has `stories`, `multiples`, `glossary`, `steps`, `quiz`; Screener has `screener`, `banks`, `calculator`, `settings`.

To add a tab: create a folder or file with `mount` (and `refresh` if it draws), put its CSS next to it and import it from the module, then add an entry to `TABS` in the app's `main.ts`.

## Language

The UI is Turkish with an English counterpart for technical terms at first mention: "F/K (P/E)". Write terms through `term(id)` (HTML) or `termText(id)` (plain text) from the `TERMS` dictionary in `shared/src/terms.ts`, so a term reads the same everywhere. An unknown id throws. Code, comments and docs are English.

## Storage

Each app creates its storage with its own prefix: `fintools.learn.` and `fintools.screener.`. The apps are on different origins, so the prefix is not needed to keep them apart, but it keeps keys recognizable and safe if both ever run on one origin. Use `lsGet` and `lsSet` for small UI state. Storage calls never throw.

## Principles

1. One design. Use the existing tokens (`--accent`, `--line`, `--ui` and so on) and components; do not add colours or fonts. Light and dark work because everything goes through the tokens.
2. BIST and US stocks never share a table, chart or median. `stocks(market)` in `apps/screener/src/data/store.ts` enforces this.
3. Numbers are deterministic and come from `market.json`. AI only explains, with the user's own key, and the app is fully usable without it.
4. No invented figures. Missing data shows as "–" or "Veri bekliyor", never an estimate.
5. Escape everything written into HTML from data, user input or AI output with `esc()`.
6. API keys live only in the Screener's localStorage, are never logged and never put in a URL.
7. Desktop first. The layout is responsive, but phone layouts are not a goal.

## Code conventions

- Erasable TypeScript only (no enums, no parameter properties), `import type` for types, explicit `.ts` extensions for relative imports. This lets Node run the tests directly.
- No runtime dependencies. Data is fetched with document-relative URLs (`./data/...`), so the build works under any path.
- The production build carries a Content-Security-Policy (`shared/src/vite-csp.ts`): scripts only from the site itself, so no inline `<script>`. Inline `style` attributes are allowed. Learn allows only its own origin; Screener also allows https and localhost for AI providers.

## Tests

- `node --test` runs the `.ts` tests directly: `shared/tests/`, `apps/learn/tests/`, `apps/screener/tests/`. `shared/tests/deploy-config.test.ts` guards the free-plan, assets-only Worker config.
- Screener tests read `apps/screener/tests/fixtures/market.json`, not the live data, so a data refresh cannot break them.
- The data job has Python `unittest` tests in `apps/screener/scripts/tests/`.
- `npm run check` in an app runs shared tests, typecheck, app tests and the build; CI runs the same.

## Adding a stock

Edit `apps/screener/config/stocks.json`. The steps are in [DATA.md](../apps/screener/docs/DATA.md).
