/**
 * Fiyat ve hareketli ortalamalar çizgi grafiği (ilk sürümün elle kurulan SVG tarzında).
 * Girdi gerçek günlük kapanış serisidir; seri yoksa grafik çizilmez.
 */

import type { PriceSeries } from '../types.ts';
import { svgText, svgWrap } from '../lib/dom.ts';
import { nf } from '../lib/format.ts';
import { lastCross, smaSeries } from '../lib/sma.ts';
import type { CrossKind } from '../lib/sma.ts';
import { niceStep } from './strip.ts';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** Grafikte gösterilen işlem günü sayısı (yaklaşık bir yıl) */
export const SMA_WINDOW = 250;

export interface SmaLine {
  id: 'price' | 'sma20' | 'sma50' | 'sma200';
  /** "x,y x,y …"; hiç nokta yoksa boş */
  points: string;
  /** Çizilen nokta sayısı */
  n: number;
}

export interface SmaChartModel {
  W: number;
  H: number;
  m: { l: number; r: number; t: number; b: number };
  /** Gösterilen ilk ve son günün sırası (seri içinde) */
  start: number;
  end: number;
  yLo: number;
  yHi: number;
  yTicks: Array<{ v: number; y: number; text: string }>;
  xTicks: Array<{ i: number; x: number; text: string }>;
  lines: SmaLine[];
  cross: { kind: CrossKind; index: number; x: number; y: number } | null;
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

/** Seri çizilebilir mi: en az iki gün, sayılar geçerli */
export function seriesUsable(series: PriceSeries | null | undefined): series is PriceSeries {
  return (
    !!series &&
    series.closes.length >= 2 &&
    series.closes.length === series.dates.length &&
    series.closes.every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}

export function smaChartModel(series: PriceSeries, W: number, win = SMA_WINDOW): SmaChartModel | null {
  if (!seriesUsable(series) || !(W > 0)) return null;
  const c = series.closes;
  const n = c.length;
  const start = Math.max(0, n - win);
  const end = n - 1;
  const H = Math.round(Math.min(280, Math.max(200, W * 0.3)));
  const m = { l: 58, r: 12, t: 10, b: 26 };

  const avgs: Array<{ id: SmaLine['id']; data: Array<number | null> }> = [
    { id: 'sma200', data: smaSeries(c, 200) },
    { id: 'sma50', data: smaSeries(c, 50) },
    { id: 'sma20', data: smaSeries(c, 20) },
    { id: 'price', data: c },
  ];

  let lo = Infinity;
  let hi = -Infinity;
  for (const a of avgs)
    for (let i = start; i <= end; i++) {
      const v = a.data[i];
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  if (hi === lo) {
    hi += Math.abs(hi) * 0.01 || 1;
    lo -= Math.abs(lo) * 0.01 || 1;
  }
  const pad = (hi - lo) * 0.06;
  const yLo = lo - pad;
  const yHi = hi + pad;

  const X = (i: number): number => m.l + ((i - start) / Math.max(end - start, 1)) * (W - m.l - m.r);
  const Y = (v: number): number => H - m.b - ((v - yLo) / (yHi - yLo)) * (H - m.t - m.b);

  const step = niceStep((hi - lo) / 4);
  const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const yTicks: SmaChartModel['yTicks'] = [];
  for (let v = Math.ceil(yLo / step) * step; v <= yHi + 1e-9; v += step) yTicks.push({ v, y: r1(Y(v)), text: nf(v, dec) });

  // Ay başları: ocakta yıl, diğer aylarda ay adı
  const marks: Array<{ i: number; x: number; text: string }> = [];
  for (let i = start + 1; i <= end; i++) {
    const cur = series.dates[i].slice(0, 7);
    if (cur !== series.dates[i - 1].slice(0, 7)) {
      const mo = Number(cur.slice(5, 7));
      marks.push({ i, x: r1(X(i)), text: mo === 1 ? cur.slice(0, 4) : (MONTHS[mo - 1] ?? cur) });
    }
  }
  const maxTicks = Math.max(2, Math.floor((W - m.l - m.r) / 64));
  const every = Math.max(1, Math.ceil(marks.length / maxTicks));
  const xTicks = marks.filter((_, j) => j % every === 0);

  const lines: SmaLine[] = avgs.map((a) => {
    const pts: string[] = [];
    for (let i = start; i <= end; i++) {
      const v = a.data[i];
      if (v != null) pts.push(`${r1(X(i))},${r1(Y(v))}`);
    }
    return { id: a.id, points: pts.join(' '), n: pts.length };
  });

  const cr = lastCross(c);
  const crossAt = cr && cr.index >= start ? avgs[1].data[cr.index] : null;
  const cross =
    cr && crossAt != null ? { kind: cr.kind, index: cr.index, x: r1(X(cr.index)), y: r1(Y(crossAt)) } : null;

  return { W, H, m, start, end, yLo, yHi, yTicks, xTicks, lines, cross };
}

const STYLE: Record<SmaLine['id'], string> = {
  sma200: 'stroke="var(--c3)" stroke-width="2" stroke-dasharray="6 5"',
  sma50: 'stroke="var(--c2)" stroke-width="2"',
  sma20: 'stroke="var(--c1)" stroke-width="2"',
  price: 'stroke="var(--ink)" stroke-width="2.25"',
};

export function smaChartSvg(series: PriceSeries, W: number, aria: string): string | null {
  const md = smaChartModel(series, W);
  if (!md) return null;
  const { H, m } = md;
  let g = '';
  for (const t of md.yTicks)
    g +=
      `<line x1="${m.l}" x2="${W - m.r}" y1="${t.y}" y2="${t.y}" stroke="var(--line)" stroke-width="1"/>` +
      svgText(m.l - 8, t.y + 4, t.text, { a: 'end', fs: 11, ff: 'var(--mono)', fill: 'var(--muted)' });
  for (const t of md.xTicks)
    g +=
      `<line x1="${t.x}" x2="${t.x}" y1="${H - m.b}" y2="${H - m.b + 4}" stroke="var(--line)" stroke-width="1"/>` +
      svgText(t.x, H - m.b + 17, t.text, { a: 'middle', fs: 11, fill: 'var(--muted)' });
  for (const l of md.lines)
    if (l.n >= 2)
      g += `<polyline fill="none" ${STYLE[l.id]} stroke-linejoin="round" stroke-linecap="round" points="${l.points}"/>`;
  if (md.cross)
    g += `<circle cx="${md.cross.x}" cy="${md.cross.y}" r="5" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5"><title>${
      md.cross.kind === 'golden' ? 'Altın kesişim (golden cross)' : 'Ölüm kesişimi (death cross)'
    }</title></circle>`;
  return svgWrap(W, H, aria, g);
}
