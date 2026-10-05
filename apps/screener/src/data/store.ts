/**
 * Uygulamanın ortak durumu: piyasa verisi, Hisselerim (watchlist) ve olaylar.
 *
 * Veri public/data/market.json dosyasından gelir (GitHub Actions üretir).
 * Hisselerim tarayıcıda saklanır; BIST ve ABD listeleri ayrıdır.
 */

import { createStorage } from '@fintools/shared/storage';
import type { Industry, MarketData, MarketId, PriceSeries, Stock, StockView } from '../types.ts';

export const MARKETS: MarketId[] = ['BIST', 'US'];
export const MARKET_LABEL: Record<MarketId, string> = { BIST: 'BIST', US: 'ABD' };

/* ---------- Kalıcı küçük ayarlar ---------- */

export const storage = createStorage('fintools.screener.');
export const { lsGet, lsSet, lsRemove } = storage;

/* ---------- Olaylar ---------- */

export type StoreEvent = 'data' | 'watchlist' | 'ai';
const listeners: Record<StoreEvent, Set<() => void>> = { data: new Set(), watchlist: new Set(), ai: new Set() };

/** Abone ol; dönen işlev aboneliği kaldırır. */
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

/* ---------- Piyasa verisi ---------- */

const EMPTY: MarketData = { schema: 2, asOf: '', source: '', period: {}, industries: {}, stocks: [] };
let DATA: MarketData = EMPTY;
let VIEWS: StockView[] = [];
let loadError: string | null = null;

const UNKNOWN_INDUSTRY: Industry = { nameTr: 'Diğer', nameEn: 'Other', cyclical: false };

export function toView(s: Stock, industries: Record<string, Industry>): StockView {
  const ind = industries[s.industry] ?? UNKNOWN_INDUSTRY;
  const roe = s.pe != null && s.pe !== 0 && s.pb != null ? (s.pb / s.pe) * 100 : null;
  const hasData = s.price != null && (s.pe != null || s.pb != null || s.evEbitda != null);
  return { ...s, roe, industryTr: ind.nameTr, industryEn: ind.nameEn, cyclical: s.cyc ?? ind.cyclical, hasData };
}

/** Testler ve veri yükleme için: veriyi doğrudan yerleştirir. */
export function setData(d: MarketData): void {
  DATA = d;
  VIEWS = d.stocks.map((s) => toView(s, d.industries));
  emit('data');
}

/** market.json dosyasını yükler. Hata olursa veri boş kalır ve dataError() mesaj döner. */
export async function loadData(url = './data/market.json'): Promise<void> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = (await res.json()) as MarketData;
    if (!d || d.schema !== 2 || !Array.isArray(d.stocks)) throw new Error('Beklenmeyen veri biçimi');
    loadError = null;
    setData(d);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
    setData(EMPTY);
  }
}

export const data = (): MarketData => DATA;

/** Bir piyasanın verisinin tarihi; piyasa başına tarih yoksa dosyanın genel tarihi. */
export const marketAsOf = (m: MarketId): string => DATA.asOfBy?.[m] ?? DATA.asOf;

/** Bu piyasada verisi olan en az bir hisse var mı */
export const marketHasData = (m: MarketId): boolean => VIEWS.some((s) => s.market === m && s.hasData);
export const dataError = (): string | null => loadError;
export const industry = (id: string): Industry => DATA.industries[id] ?? UNKNOWN_INDUSTRY;

/** Piyasa içinde tekil kimlik, ör. "BIST-THYAO" */
export const sid = (s: { market: MarketId; symbol: string }): string => `${s.market}-${s.symbol}`;

export interface StockFilter {
  /** only: yalnız bankalar · exclude: bankasız (varsayılan) · include: hepsi */
  banks?: 'only' | 'exclude' | 'include';
  /** Yalnızca Hisselerim'dekiler (varsayılan: true) */
  watchlistOnly?: boolean;
}

/** Bir piyasanın hisseleri. BIST ve ABD hiçbir zaman aynı listede dönmez. */
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

export function findStock(market: MarketId, symbol: string): StockView | undefined {
  return VIEWS.find((s) => s.market === market && s.symbol === symbol);
}

/* ---------- Hisselerim (watchlist) ---------- */

const wlKey = (m: MarketId) => `watchlist.${m}`;

/** Kayıt yoksa evrendeki tüm (banka dışı) hisseler seçili sayılır. */
export function watchlist(market: MarketId): string[] {
  const universe = VIEWS.filter((s) => s.market === market && !s.bank).map((s) => s.symbol);
  const saved = lsGet<string[] | null>(wlKey(market), null);
  if (!saved) return universe;
  const known = new Set(universe);
  return saved.filter((k) => known.has(k));
}

export function setWatchlist(market: MarketId, tickers: string[]): void {
  lsSet(wlKey(market), [...new Set(tickers)]);
  emit('watchlist');
}

/** Kaydı siler; liste yeniden "evrendeki tüm hisseler" olur. */
export function resetWatchlist(market: MarketId): void {
  lsRemove(wlKey(market));
  emit('watchlist');
}

/** Evrendeki tüm banka dışı hisseler (Hisselerim'de olsun olmasın). */
export function universe(market: MarketId): StockView[] {
  return VIEWS.filter((s) => s.market === market && !s.bank);
}

/* ---------- Fiyat serileri (hareketli ortalama grafiği için) ---------- */

const priceCache = new Map<string, Promise<PriceSeries | null>>();

/** Günlük kapanış serisi; dosya yoksa null (veri henüz çekilmemiş). */
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
