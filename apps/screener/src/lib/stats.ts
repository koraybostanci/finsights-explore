/** Ortanca (median) ve sektör özeti. */

import type { IndustryMedian, StockView } from '../types.ts';

/** Boş değerleri atar; hiç değer yoksa null. */
export function median(values: Array<number | null | undefined>): number | null {
  const a = values.filter((v): v is number => v != null && !Number.isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Aynı sektördeki, verisi olan hisselerin ortancaları. */
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

/** Hisseleri sektör kimliğine göre gruplar; grup sırası sektör adına göredir. */
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
