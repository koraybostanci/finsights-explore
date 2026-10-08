/** Median and industry summary. */

import type { IndustryMedian, StockView } from '../types.ts';

/** Skips empty values; null when there are none. */
export function median(values: Array<number | null | undefined>): number | null {
  const a = values.filter((v): v is number => v != null && !Number.isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Medians of the stocks in one industry that have data. */
export function industryMedian(stocks: StockView[]): IndustryMedian {
  const withData = stocks.filter((s) => s.hasData);
  const col = (f: (s: StockView) => number | null) => median(withData.map(f));
  return {
    n: withData.length,
    pe: col((s) => s.pe),
    pb: col((s) => s.pb),
    evEbitda: col((s) => s.evEbitda),
    peg: col((s) => s.peg),
    netDebtEbitda: col((s) => s.netDebtEbitda),
    ebitdaGrowth: col((s) => s.ebitdaGrowth),
    netIncomeGrowth: col((s) => s.netIncomeGrowth),
    roe: col((s) => s.roe),
  };
}

/** Groups stocks by industry id; groups are ordered by industry name. */
export function groupByIndustry(stocks: StockView[]): Array<{ industry: string; industryTr: string; industryEn: string; stocks: StockView[] }> {
  const map = new Map<string, { industry: string; industryTr: string; industryEn: string; stocks: StockView[] }>();
  for (const s of stocks) {
    let g = map.get(s.industry);
    if (!g) {
      g = { industry: s.industry, industryTr: s.industryTr, industryEn: s.industryEn, stocks: [] };
      map.set(s.industry, g);
    }
    g.stocks.push(s);
  }
  return [...map.values()].sort((a, b) => a.industryTr.localeCompare(b.industryTr, 'tr'));
}
