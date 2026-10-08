/**
 * Pure helpers for the watchlist: Turkish-aware search and list operations.
 * No DOM access; tests/settings.test.ts covers them.
 */

import type { StockView } from '../types.ts';

/**
 * Ignores letter differences in search: case is converted by Turkish rules
 * (I → ı, İ → i), then dotted/dotless i and ş, ğ, ü, ö, ç are reduced to their plain
 * counterparts. So "isctr", "ISCTR", "turk" and "Türk" all match.
 */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A lower number is a better match; -1 when there is no match. */
export function matchRank(s: { symbol: string; name: string }, query: string): number {
  const q = fold(query);
  if (!q) return -1;
  const sym = fold(s.symbol);
  const name = fold(s.name);
  const hay = `${sym} ${name}`;
  const tokens = q.split(' ');
  if (!tokens.every((t) => hay.includes(t))) return -1;
  if (sym === q) return 0;
  if (sym.startsWith(q)) return 1;
  if (name.startsWith(q)) return 2;
  if (name.split(' ').some((w) => w.startsWith(tokens[0]))) return 3;
  if (sym.includes(q)) return 4;
  return 5;
}

/**
 * Searches a market's universe by symbol or company name. The best match comes first;
 * ties are ordered by symbol. An empty query returns nothing.
 */
export function searchUniverse(universe: StockView[], query: string, limit = 8): StockView[] {
  return universe
    .map((s) => ({ s, r: matchRank(s, query) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.s.symbol.localeCompare(b.s.symbol, 'tr'))
    .slice(0, limit)
    .map((x) => x.s);
}

/** Adds the symbol to the list (if absent); order is preserved. */
export const addTicker = (list: string[], ticker: string): string[] =>
  list.includes(ticker) ? list.slice() : [...list, ticker];

/** Removes the symbol from the list. */
export const removeTicker = (list: string[], ticker: string): string[] => list.filter((x) => x !== ticker);

/** Stocks in the universe but not in the list (the ones that can be added again), ordered by symbol. */
export function notInList(universe: StockView[], list: string[]): StockView[] {
  const have = new Set(list);
  return universe.filter((s) => !have.has(s.symbol)).sort((a, b) => a.symbol.localeCompare(b.symbol, 'tr'));
}
