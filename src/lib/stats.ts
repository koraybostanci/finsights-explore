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
    fk: col((s) => s.fk),
    pd: col((s) => s.pd),
    fdf: col((s) => s.fdf),
    peg: col((s) => s.peg),
    nb: col((s) => s.nb),
    fg: col((s) => s.fg),
    ng: col((s) => s.ng),
    roe: col((s) => s.roe),
  };
}

/** Hisseleri sektör kimliğine göre gruplar; grup sırası sektör adına göredir. */
export function groupByIndustry(stocks: StockView[]): Array<{ ind: string; sek: string; sekEn: string; stocks: StockView[] }> {
  const map = new Map<string, { ind: string; sek: string; sekEn: string; stocks: StockView[] }>();
  for (const s of stocks) {
    let g = map.get(s.ind);
    if (!g) {
      g = { ind: s.ind, sek: s.sek, sekEn: s.sekEn, stocks: [] };
      map.set(s.ind, g);
    }
    g.stocks.push(s);
  }
  return [...map.values()].sort((a, b) => a.sek.localeCompare(b.sek, 'tr'));
}
