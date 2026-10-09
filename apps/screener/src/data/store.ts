/**
 * Shared app state: market data, the watchlist and change events.
 *
 * Data comes from public/data/market.json (written by the scheduled data job).
 * The watchlist is stored in the browser, with a separate list for BIST and US.
 */

import { createStorage } from '@fintools/shared/storage';
import type { Industry, MarketData, MarketId, PriceSeries, Stock, StockView } from '../types.ts';

export const MARKETS: MarketId[] = ['BIST', 'US'];
export const MARKET_LABEL: Record<MarketId, string> = { BIST: 'BIST', US: 'ABD' };

/* ---------- Persistent small settings ---------- */

export const storage = createStorage('fintools.screener.');
export const { lsGet, lsSet, lsRemove } = storage;

/* ---------- Events ---------- */

export type StoreEvent = 'data' | 'watchlist' | 'ai';
const listeners: Record<StoreEvent, Set<() => void>> = { data: new Set(), watchlist: new Set(), ai: new Set() };

/** Subscribe; the returned function unsubscribes. */
export function on(ev: StoreEvent, fn: () => void): () => void {
  listeners[ev].add(fn);
  return () => listeners[ev].delete(fn);
}

export function emit(ev: StoreEvent): void {
  listeners[ev].forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

/* ---------- Market data ---------- */

const EMPTY: MarketData = { schema: 3, asOf: '', source: '', period: {}, industries: {}, stocks: [] };
let DATA: MarketData = EMPTY;
let VIEWS: StockView[] = [];
let loadError: string | null = null;

const UNKNOWN_INDUSTRY: Industry = { nameTr: 'Diğer', nameEn: 'Other', cyclical: false };

export function toView(s: Stock, industries: Record<string, Industry>): StockView {
  const ind = industries[s.industry] ?? UNKNOWN_INDUSTRY;
  const roe = s.pe != null && s.pe !== 0 && s.pb != null ? (s.pb / s.pe) * 100 : null;
  const hasData = s.price != null && (s.pe != null || s.pb != null || s.evEbitda != null);
  return { ...s, roe, industryTr: ind.nameTr, industryEn: ind.nameEn, cyclical: s.cyclical ?? ind.cyclical, hasData };
}

/** For tests and data loading: installs the data directly. */
export function setData(d: MarketData): void {
  DATA = d;
  VIEWS = d.stocks.map((s) => toView(s, d.industries));
  emit('data');
}

/** Loads market.json. On failure the data stays empty and dataError() returns the message. */
export async function loadData(url = './data/market.json'): Promise<void> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = (await res.json()) as MarketData;
    if (!d || d.schema !== 3 || !Array.isArray(d.stocks)) throw new Error('Beklenmeyen veri biçimi');
    loadError = null;
    setData(d);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
    setData(EMPTY);
  }
}

export const data = (): MarketData => DATA;

/** Data date of one market; falls back to the file-wide date when there is no per-market date. */
export const marketAsOf = (m: MarketId): string => DATA.asOfBy?.[m] ?? DATA.asOf;

/** Whether at least one stock in this market has data */
export const marketHasData = (m: MarketId): boolean => VIEWS.some((s) => s.market === m && s.hasData);
export const dataError = (): string | null => loadError;
export const industry = (id: string): Industry => DATA.industries[id] ?? UNKNOWN_INDUSTRY;

/** Id unique across markets, e.g. "BIST-THYAO" */
export const sid = (s: { market: MarketId; symbol: string }): string => `${s.market}-${s.symbol}`;

export interface StockFilter {
  /** only: banks only · exclude: no banks (default) · include: everything */
  banks?: 'only' | 'exclude' | 'include';
  /** Only stocks on the watchlist (default: true) */
  watchlistOnly?: boolean;
}

/** The stocks of one market. BIST and US are never returned in the same list. */
export function stocks(market: MarketId, f: StockFilter = {}): StockView[] {
  const banks = f.banks ?? 'exclude';
  const wlOnly = f.watchlistOnly ?? true;
  const wl = wlOnly ? new Set(watchlist(market)) : null;
  return VIEWS.filter(
    (s) =>
      s.market === market &&
      (banks === 'include' || (banks === 'only' ? !!s.bank : !s.bank)) &&
      (!wl || s.bank || wl.has(s.symbol)),
  );
}

/* ---------- Watchlist ---------- */

const wlKey = (m: MarketId) => `watchlist.${m}`;

/** With nothing saved, every (non-bank) stock in the universe counts as selected. */
export function watchlist(market: MarketId): string[] {
  const universe = VIEWS.filter((s) => s.market === market && !s.bank).map((s) => s.symbol);
  const saved = lsGet<string[] | null>(wlKey(market), null);
  if (!saved) return universe;
  const known = new Set(universe);
  return saved.filter((sym) => known.has(sym));
}

export function setWatchlist(market: MarketId, tickers: string[]): void {
  lsSet(wlKey(market), [...new Set(tickers)]);
  emit('watchlist');
}

/** Deletes the saved list; the watchlist becomes "every stock in the universe" again. */
export function resetWatchlist(market: MarketId): void {
  lsRemove(wlKey(market));
  emit('watchlist');
}

/** Every non-bank stock in the universe, on the watchlist or not. */
export function universe(market: MarketId): StockView[] {
  return VIEWS.filter((s) => s.market === market && !s.bank);
}

/* ---------- Price series (for the moving-average chart) ---------- */

const priceCache = new Map<string, Promise<PriceSeries | null>>();

/** Daily close series; null when the file is missing (not fetched yet). */
export function loadPrices(s: { market: MarketId; symbol: string }): Promise<PriceSeries | null> {
  const id = sid(s);
  let p = priceCache.get(id);
  if (!p) {
    p = fetch(`./data/prices/${encodeURIComponent(id)}.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<PriceSeries>) : null))
      .then((d) => (d && Array.isArray(d.closes) && Array.isArray(d.dates) && d.closes.length === d.dates.length ? d : null))
      .catch(() => null);
    priceCache.set(id, p);
  }
  return p;
}
