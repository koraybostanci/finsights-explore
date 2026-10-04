/**
 * Tarayıcının DOM'a dokunmayan mantığı: satırlar, süzgeç, sıralama, özet.
 * Sıralama kuralları ilk sürümle aynıdır (boş değerler her zaman sonda).
 */

import type { Evaluation, MarketId, StockView, Thresholds } from '../types.ts';
import { VLABEL, VORD, evaluate } from '../lib/evaluate.ts';
import { distancePct } from '../lib/sma.ts';
import { nf, pct } from '../lib/format.ts';

export interface Row {
  s: StockView;
  ev: Evaluation;
  /** Fiyatın 50 günlük ortalamaya uzaklığı % */
  d50: number | null;
  /** Fiyatın 200 günlük ortalamaya uzaklığı % */
  d200: number | null;
}

export type SortKey =
  | 'k'
  | 'verdict'
  | 'fk'
  | 'pd'
  | 'fdf'
  | 'peg'
  | 'nb'
  | 'fg'
  | 'ng'
  | 'roe'
  | 'mv'
  | 'd50'
  | 'd200';

export interface SortState {
  key: SortKey;
  dir: 1 | -1;
}

export interface Col {
  key: SortKey | 'why';
  lbl: string;
  en?: string;
  nosort?: boolean;
  /** Başlık sola yaslı */
  left?: boolean;
}

const CUR_OF: Record<MarketId, string> = { BIST: 'TL', US: 'USD' };

/** "Tüm liste" sütunları: ilk sürümün sütunları + Net borç/FAVÖK'ten sonra 200 günlük ortalama. */
export function listCols(market: MarketId): Col[] {
  return [
    { key: 'k', lbl: 'Hisse' },
    { key: 'verdict', lbl: 'Sonuç' },
    { key: 'why', lbl: 'Gerekçe', en: 'Why', nosort: true, left: true },
    { key: 'fk', lbl: 'F/K', en: 'P/E' },
    { key: 'pd', lbl: 'PD/DD', en: 'P/B' },
    { key: 'fdf', lbl: 'FD/FAVÖK', en: 'EV/EBITDA' },
    { key: 'peg', lbl: 'PEG', en: 'PEG' },
    { key: 'nb', lbl: 'Net borç/FAVÖK', en: 'Net debt/EBITDA' },
    { key: 'd200', lbl: '200g ort.', en: 'SMA 200' },
    { key: 'fg', lbl: 'FAVÖK büy.', en: 'EBITDA growth' },
    { key: 'ng', lbl: 'Net kâr büy.', en: 'Net income growth' },
    { key: 'roe', lbl: 'ÖK kârl.≈', en: 'ROE' },
    { key: 'mv', lbl: 'Piy. değ.', en: `Market cap, bn ${CUR_OF[market]}` },
  ];
}

/** "Sektör kıyası" sütunları: yana kaydırmadan sığan dar tablo. */
export const PEER_COLS: Col[] = [
  { key: 'k', lbl: 'Hisse' },
  { key: 'verdict', lbl: 'Sonuç', left: true },
  { key: 'fk', lbl: 'F/K', en: 'P/E' },
  { key: 'pd', lbl: 'PD/DD', en: 'P/B' },
  { key: 'fdf', lbl: 'FD/FAVÖK', en: 'EV/EBITDA' },
  { key: 'peg', lbl: 'PEG', en: 'PEG' },
  { key: 'nb', lbl: 'Net borç/FAVÖK', en: 'Net debt/EBITDA' },
  { key: 'fg', lbl: 'FAVÖK büy.', en: 'EBITDA growth' },
  { key: 'roe', lbl: 'ÖK kârl.≈', en: 'ROE' },
  { key: 'd50', lbl: '50g ort.', en: 'SMA 50' },
  { key: 'd200', lbl: '200g ort.', en: 'SMA 200' },
];

export function buildRows(list: StockView[], th: Thresholds): Row[] {
  return list.map((s) => ({
    s,
    ev: evaluate(s, th),
    d50: distancePct(s.f, s.sma50),
    d200: distancePct(s.f, s.sma200),
  }));
}

/** Fiyat 200 günlük ortalamanın üstünde mi? Ortalama ya da fiyat yoksa false. */
export function aboveSma200(s: Pick<StockView, 'f' | 'sma200'>): boolean {
  return s.f != null && s.sma200 != null && s.f > s.sma200;
}

export interface RowFilter {
  /** Yalnız fiyatı 200 günlük ortalamanın üstünde olanlar; ortalaması olmayanlar da gizlenir */
  aboveSma: boolean;
}

export function filterRows(rows: Row[], f: RowFilter): Row[] {
  return f.aboveSma ? rows.filter((r) => aboveSma200(r.s)) : rows;
}

export function sortValue(r: Row, key: SortKey): number | string | null {
  switch (key) {
    case 'verdict':
      return VORD[r.ev.verdict] * 10 + (r.ev.warns || 0);
    case 'k':
      return r.s.k;
    case 'd50':
      return r.d50;
    case 'd200':
      return r.d200;
    default:
      return r.s[key];
  }
}

/** Yeni bir dizi döner. Boş değerler yön ne olursa olsun sonda kalır. */
export function sortRows(rows: Row[], key: SortKey, dir: 1 | -1): Row[] {
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y), 'tr') * dir;
    return (x - y) * dir;
  });
}

const ASC_FIRST: SortKey[] = ['k', 'verdict', 'fk', 'pd', 'fdf', 'peg', 'nb'];

/** Bir sütuna ilk tıklamada yön: çarpanlar küçükten büyüğe, büyüme ve getiri büyükten küçüğe. */
export const defaultDir = (key: SortKey): 1 | -1 => (ASC_FIRST.includes(key) ? 1 : -1);

/** Başlığa tıklanınca: aynı sütunsa yön değişir, değilse o sütunun ilk yönü. */
export function nextSort(cur: SortState, key: SortKey): SortState {
  return cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: defaultDir(key) };
}

export interface VerdictCounts {
  good: number;
  warn: number;
  bad: number;
  /** Verisi olan bankalar (ayrı yöntemle değerlendirilir) */
  bank: number;
  /** Verisi henüz gelmemiş hisseler */
  waiting: number;
}

export function countVerdicts(rows: Row[]): VerdictCounts {
  const c: VerdictCounts = { good: 0, warn: 0, bad: 0, bank: 0, waiting: 0 };
  for (const r of rows) {
    if (!r.s.hasData) c.waiting++;
    else if (r.ev.verdict === 'na') c.bank++;
    else c[r.ev.verdict]++;
  }
  return c;
}

/** Sonuç rozetindeki metin */
export function verdictLabel(r: Row): string {
  if (!r.s.hasData) return 'Veri bekliyor';
  return r.ev.verdict === 'warn' ? `${VLABEL.warn} (${r.ev.warns})` : VLABEL[r.ev.verdict];
}

/* ---------- Hücre metinleri ---------- */

export const fkText = (s: StockView): string => (!s.hasData ? '–' : s.fk == null ? (s.loss ? 'zarar' : '–') : nf(s.fk));

export const growthText = (v: number | null, why?: string): string => (v == null ? why || '–' : pct(v));

export const roeText = (roe: number | null): string => (roe == null ? '–' : '%' + nf(roe, 1));

/** Fiyatın ortalamaya uzaklığı: "+%4,2", "%-3,1", bilinmiyorsa "–" */
export const distText = (d: number | null): string => pct(d, 1);

/* ---------- Sektör seçimi ---------- */

export interface IndustryGroup {
  ind: string;
  sek: string;
  sekEn: string;
  stocks: StockView[];
}

/**
 * Sektör çiplerinin sırası: önce kıyas yapılabilenler (en az iki hisse), sonra
 * tek hisseli sektörler; her iki grup kendi içinde girdi sırasını (ada göre) korur.
 */
export function orderGroups<T extends { stocks: unknown[] }>(groups: T[]): T[] {
  const rank = (g: T): number => (g.stocks.length >= 2 ? 0 : 1);
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i)
    .map((x) => x.g);
}

/**
 * Seçili sektör: hatırlanan hâlâ listedeyse o; değilse kıyas yapılabilen
 * (en az iki hissesi olan) ilk sektör, o da yoksa ilk sektör.
 */
export function pickIndustry(groups: IndustryGroup[], remembered: string | null | undefined): string | null {
  if (!groups.length) return null;
  if (remembered && groups.some((g) => g.ind === remembered)) return remembered;
  const withPeers =
    groups.find((g) => g.stocks.filter((s) => s.hasData).length >= 2) ?? groups.find((g) => g.stocks.length >= 2);
  return (withPeers ?? groups[0]).ind;
}
