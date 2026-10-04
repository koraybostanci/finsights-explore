/**
 * Uygulamanın ortak durumu: piyasa verisi, Hisselerim (watchlist) ve olaylar.
 *
 * Veri public/data/market.json dosyasından gelir (GitHub Actions üretir).
 * Hisselerim tarayıcıda saklanır; BIST ve ABD listeleri ayrıdır.
 */

import type { Industry, MarketData, MarketId, PriceSeries, Stock, StockView } from '../types.ts';

export const MARKETS: MarketId[] = ['BIST', 'US'];
export const MARKET_LABEL: Record<MarketId, string> = { BIST: 'BIST', US: 'ABD' };

const LS_PREFIX = 'finsights.';

/* ---------- Kalıcı küçük ayarlar ---------- */

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* özel pencere ya da dolu depolama: ayar bu oturumla sınırlı kalır */
  }
}

export function lsRemove(key: string): void {
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    /* yok say */
  }
}

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

const EMPTY: MarketData = { schema: 1, asOf: '', source: '', period: {}, industries: {}, stocks: [] };
let DATA: MarketData = EMPTY;
let VIEWS: StockView[] = [];
let loadError: string | null = null;

const UNKNOWN_INDUSTRY: Industry = { tr: 'Diğer', en: 'Other', cyclical: false };

export function toView(s: Stock, industries: Record<string, Industry>): StockView {
  const ind = industries[s.ind] ?? UNKNOWN_INDUSTRY;
  const roe = s.fk != null && s.fk !== 0 && s.pd != null ? (s.pd / s.fk) * 100 : null;
  const hasData = s.f != null && (s.fk != null || s.pd != null || s.fdf != null);
  return { ...s, roe, sek: ind.tr, sekEn: ind.en, cyclical: s.cyc ?? ind.cyclical, hasData };
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
    if (!d || d.schema !== 1 || !Array.isArray(d.stocks)) throw new Error('Beklenmeyen veri biçimi');
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
export const sid = (s: { market: MarketId; k: string }): string => `${s.market}-${s.k}`;

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
      (!wl || s.bank || wl.has(s.k)),
  );
}

export function findStock(market: MarketId, k: string): StockView | undefined {
  return VIEWS.find((s) => s.market === market && s.k === k);
}

/* ---------- Hisselerim (watchlist) ---------- */

const wlKey = (m: MarketId) => `watchlist.${m}`;

/** Kayıt yoksa evrendeki tüm (banka dışı) hisseler seçili sayılır. */
export function watchlist(market: MarketId): string[] {
  const universe = VIEWS.filter((s) => s.market === market && !s.bank).map((s) => s.k);
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
export function loadPrices(s: { market: MarketId; k: string }): Promise<PriceSeries | null> {
  const id = sid(s);
  let p = priceCache.get(id);
  if (!p) {
    p = fetch(`./data/prices/${encodeURIComponent(id)}.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<PriceSeries>) : null))
      .then((d) => (d && Array.isArray(d.c) && Array.isArray(d.t) && d.c.length === d.t.length ? d : null))
      .catch(() => null);
    priceCache.set(id, p);
  }
  return p;
}
