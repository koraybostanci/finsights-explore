/**
 * The screener's DOM-free logic: rows, filter, sorting, summary.
 * Sorting rules match the first release (empty values always come last).
 */

import type { Evaluation, MarketId, StockView, Thresholds } from '../types.ts';
import { VLABEL, VORD, evaluate } from '../lib/evaluate.ts';
import { distancePct } from '@fintools/shared/sma';
import { nf, pct } from '@fintools/shared/format';

export interface Row {
  s: StockView;
  ev: Evaluation;
  /** Distance of the price from the 50-day average, in % */
  d50: number | null;
  /** Distance of the price from the 200-day average, in % */
  d200: number | null;
}

export type SortKey =
  | 'symbol'
  | 'verdict'
  | 'pe'
  | 'pb'
  | 'evEbitda'
  | 'peg'
  | 'netDebtEbitda'
  | 'ebitdaGrowth'
  | 'netIncomeGrowth'
  | 'roe'
  | 'marketCap'
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
  /** Header is left-aligned */
  left?: boolean;
}

const CUR_OF: Record<MarketId, string> = { BIST: 'TL', US: 'USD' };

/** Columns of the full list: the first release's columns plus the 200-day average after net debt/EBITDA. */
export function listCols(market: MarketId): Col[] {
  return [
    { key: 'symbol', lbl: 'Hisse' },
    { key: 'verdict', lbl: 'Sonuç' },
    { key: 'why', lbl: 'Gerekçe', en: 'Why', nosort: true, left: true },
    { key: 'pe', lbl: 'F/K', en: 'P/E' },
    { key: 'pb', lbl: 'PD/DD', en: 'P/B' },
    { key: 'evEbitda', lbl: 'FD/FAVÖK', en: 'EV/EBITDA' },
    { key: 'peg', lbl: 'PEG', en: 'PEG' },
    { key: 'netDebtEbitda', lbl: 'Net borç/FAVÖK', en: 'Net debt/EBITDA' },
    { key: 'd200', lbl: '200g ort.', en: 'SMA 200' },
    { key: 'ebitdaGrowth', lbl: 'FAVÖK büy.', en: 'EBITDA growth' },
    { key: 'netIncomeGrowth', lbl: 'Net kâr büy.', en: 'Net income growth' },
    { key: 'roe', lbl: 'ÖK kârl.≈', en: 'ROE' },
    { key: 'marketCap', lbl: 'Piy. değ.', en: `Market cap, bn ${CUR_OF[market]}` },
  ];
}

/** Columns of the industry comparison: a narrow table that fits without horizontal scrolling. */
export const PEER_COLS: Col[] = [
  { key: 'symbol', lbl: 'Hisse' },
  { key: 'verdict', lbl: 'Sonuç', left: true },
  { key: 'pe', lbl: 'F/K', en: 'P/E' },
  { key: 'pb', lbl: 'PD/DD', en: 'P/B' },
  { key: 'evEbitda', lbl: 'FD/FAVÖK', en: 'EV/EBITDA' },
  { key: 'peg', lbl: 'PEG', en: 'PEG' },
  { key: 'netDebtEbitda', lbl: 'Net borç/FAVÖK', en: 'Net debt/EBITDA' },
  { key: 'ebitdaGrowth', lbl: 'FAVÖK büy.', en: 'EBITDA growth' },
  { key: 'roe', lbl: 'ÖK kârl.≈', en: 'ROE' },
  { key: 'd50', lbl: '50g ort.', en: 'SMA 50' },
  { key: 'd200', lbl: '200g ort.', en: 'SMA 200' },
];

export function buildRows(list: StockView[], th: Thresholds): Row[] {
  return list.map((s) => ({
    s,
    ev: evaluate(s, th),
    d50: distancePct(s.price, s.sma50),
    d200: distancePct(s.price, s.sma200),
  }));
}

/** Is the price above the 200-day average? False when the average or the price is missing. */
export function aboveSma200(s: Pick<StockView, 'price' | 'sma200'>): boolean {
  return s.price != null && s.sma200 != null && s.price > s.sma200;
}

export interface RowFilter {
  /** Only stocks priced above the 200-day average; those without an average are hidden too */
  aboveSma: boolean;
}

export function filterRows(rows: Row[], f: RowFilter): Row[] {
  return f.aboveSma ? rows.filter((r) => aboveSma200(r.s)) : rows;
}

export function sortValue(r: Row, key: SortKey): number | string | null {
  switch (key) {
    case 'verdict':
      return VORD[r.ev.verdict] * 10 + (r.ev.warns || 0);
    case 'symbol':
      return r.s.symbol;
    case 'd50':
      return r.d50;
    case 'd200':
      return r.d200;
    default:
      return r.s[key];
  }
}

/** Returns a new array. Empty values stay last whatever the direction. */
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

const ASC_FIRST: SortKey[] = ['symbol', 'verdict', 'pe', 'pb', 'evEbitda', 'peg', 'netDebtEbitda'];

/** Direction on the first click of a column: multiples ascending, growth and return descending. */
export const defaultDir = (key: SortKey): 1 | -1 => (ASC_FIRST.includes(key) ? 1 : -1);

/** On a header click: the same column flips direction, another column starts with its default direction. */
export function nextSort(cur: SortState, key: SortKey): SortState {
  return cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: defaultDir(key) };
}

export interface VerdictCounts {
  good: number;
  warn: number;
  bad: number;
  /** Banks with data (evaluated with a separate method) */
  bank: number;
  /** Stocks whose data has not arrived yet */
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

/** Text on the verdict badge */
export function verdictLabel(r: Row): string {
  if (!r.s.hasData) return 'Veri bekliyor';
  return r.ev.verdict === 'warn' ? `${VLABEL.warn} (${r.ev.warns})` : VLABEL[r.ev.verdict];
}

/* ---------- Cell texts ---------- */

export const peText = (s: StockView): string => (!s.hasData ? '–' : s.pe == null ? (s.loss ? 'zarar' : '–') : nf(s.pe));

export const growthText = (v: number | null, why?: string): string => (v == null ? why || '–' : pct(v));

export const roeText = (roe: number | null): string => (roe == null ? '–' : '%' + nf(roe, 1));

/** Distance of the price from the average: "+%4,2", "%-3,1", or "–" when unknown */
export const distText = (d: number | null): string => pct(d, 1);

/* ---------- Industry selection ---------- */

export interface IndustryGroup {
  industry: string;
  industryTr: string;
  industryEn: string;
  stocks: StockView[];
}

/**
 * Order of the industry chips: industries that can be compared (at least two stocks)
 * first, then single-stock industries; each group keeps its input order (by name).
 */
export function orderGroups<T extends { stocks: unknown[] }>(groups: T[]): T[] {
  const rank = (g: T): number => (g.stocks.length >= 2 ? 0 : 1);
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i)
    .map((x) => x.g);
}

/**
 * The selected industry: the remembered one if it is still listed; otherwise the first
 * industry that can be compared (at least two stocks), otherwise the first industry.
 */
export function pickIndustry(groups: IndustryGroup[], remembered: string | null | undefined): string | null {
  if (!groups.length) return null;
  if (remembered && groups.some((g) => g.industry === remembered)) return remembered;
  const withPeers =
    groups.find((g) => g.stocks.filter((s) => s.hasData).length >= 2) ?? groups.find((g) => g.stocks.length >= 2);
  return (withPeers ?? groups[0]).industry;
}
