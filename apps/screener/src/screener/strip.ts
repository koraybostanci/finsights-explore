/**
 * Strip chart of each stock's position against the industry median: one horizontal
 * strip per multiple, one marker per stock, a tick for the median and, on the debt
 * strip, a dashed line for the threshold. Hand-built SVG, like the charts in the first release.
 *
 * Scale and label placement are pure functions (no DOM access) and have tests.
 */

import { svgText, svgWrap, tw } from '@fintools/shared/dom';
import { esc, nf } from '@fintools/shared/format';
import { TERMS } from '@fintools/shared/terms';

/* ---------- Scale ---------- */

/** The step, a multiple of 1, 2, 2.5, 5 or 10 (times a power of ten), that is not smaller than the given value. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}

const tidy = (v: number): number => Math.round(v * 1e9) / 1e9;

export interface Scale {
  lo: number;
  hi: number;
  step: number;
}

/**
 * Scale of a strip: always includes zero (a multiple is a ratio, so position is read
 * relative to zero); the ends are rounded to a tidy step.
 */
export function stripScale(values: number[]): Scale {
  const vals = values.filter((v) => Number.isFinite(v));
  const lo0 = Math.min(0, ...vals);
  const hi0 = Math.max(0, ...vals);
  const span = hi0 - lo0 || 1;
  const step = niceStep(span / 4);
  const lo = Math.floor(lo0 / step + 1e-9) * step;
  let hi = Math.ceil(hi0 / step - 1e-9) * step;
  if (hi <= lo) hi = lo + step;
  return { lo: tidy(lo), hi: tidy(hi), step };
}

/* ---------- Label placement ---------- */

export interface LabelBox {
  /** Requested centre */
  x: number;
  /** Text width */
  w: number;
}

export interface Placed {
  /** Centre fitted within the edges */
  x: number;
  /** 0: the row closest to the strip, 1: the row above it (or below) */
  level: number;
  shown: boolean;
}

/**
 * Label placement along one axis: goes left to right; a label that collides with the
 * previous one on its row moves to the next row, and if there is no room there either
 * it is hidden (the value stays in the table and in the marker's tooltip).
 * The result is in input order.
 */
export function placeLabels(items: LabelBox[], lo: number, hi: number, gap = 6, levels = 2): Placed[] {
  const out: Placed[] = items.map((it) => ({ x: it.x, level: 0, shown: false }));
  const order = items.map((_, i) => i).sort((a, b) => items[a].x - items[b].x || a - b);
  const lastEnd: number[] = new Array(levels).fill(-Infinity);
  for (const i of order) {
    const w = items[i].w;
    const half = w / 2;
    const cx = hi - lo >= w ? Math.min(Math.max(items[i].x, lo + half), hi - half) : (lo + hi) / 2;
    out[i].x = cx;
    for (let lv = 0; lv < levels; lv++) {
      if (cx - half >= lastEnd[lv] + gap) {
        out[i].level = lv;
        out[i].shown = true;
        lastEnd[lv] = cx + half;
        break;
      }
    }
  }
  return out;
}

/**
 * Separates overlapping markers vertically: tries 0, one step up, one step down, two
 * steps up, two steps down in turn, so five markers at the same value stay individually
 * visible. A sixth overlapping marker stays in place (its value is in the table and in
 * the marker's tooltip). The result is the vertical offset in px, in input order.
 */
export function dotOffsets(xs: number[], minDist = 11, step = 11): number[] {
  const out: number[] = new Array(xs.length).fill(0);
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b] || a - b);
  const placed: Array<{ x: number; dy: number }> = [];
  for (const i of order) {
    let dy = 0;
    for (const cand of [0, -step, step, -2 * step, 2 * step]) {
      if (!placed.some((p) => Math.hypot(p.x - xs[i], p.dy - cand) < minDist)) {
        dy = cand;
        break;
      }
    }
    out[i] = dy;
    placed.push({ x: xs[i], dy });
  }
  return out;
}

/* ---------- Markers ---------- */

export const SHAPES = ['circle', 'square', 'diamond', 'triangle'] as const;
export type Shape = (typeof SHAPES)[number];

export interface Marker {
  /** CSS colour (token): var(--c1) … var(--c4) */
  color: string;
  shape: Shape;
}

/** The first four stocks get four colours as circles; later ones reuse the colours with another shape. */
export function markerFor(i: number): Marker {
  return { color: `var(--c${(i % 4) + 1})`, shape: SHAPES[Math.floor(i / 4) % SHAPES.length] };
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

export function markerSvg(m: Marker, cx: number, cy: number, r = 6): string {
  const st = `fill="${m.color}" stroke="var(--surface)" stroke-width="2"`;
  const x = r1(cx);
  const y = r1(cy);
  if (m.shape === 'square') {
    const a = r - 0.5;
    return `<rect x="${r1(x - a)}" y="${r1(y - a)}" width="${a * 2}" height="${a * 2}" rx="1.5" ${st}/>`;
  }
  if (m.shape === 'diamond') {
    const a = r + 1.5;
    return `<polygon points="${x},${r1(y - a)} ${r1(x + a)},${y} ${x},${r1(y + a)} ${r1(x - a)},${y}" ${st}/>`;
  }
  if (m.shape === 'triangle') {
    const a = r + 1.5;
    return `<polygon points="${x},${r1(y - a)} ${r1(x + a)},${r1(y + a - 2)} ${r1(x - a)},${r1(y + a - 2)}" ${st}/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${r}" ${st}/>`;
}

/** Small marker for the legend row (16 × 16) */
export function markerIcon(m: Marker): string {
  return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${markerSvg(m, 8, 8, 5)}</svg>`;
}

/* ---------- Layout ---------- */

export interface StripDef {
  key: string;
  /** Turkish name, e.g. "PD/DD" */
  label: string;
  /** English counterpart, e.g. "P/B" */
  en: string;
  items: Array<{ symbol: string; v: number }>;
  median: number | null;
  /** Only on the strip that has a threshold (net debt/EBITDA) */
  threshold?: number | null;
}

export interface StripText {
  text: string;
  x: number;
  y: number;
  shown: boolean;
}

export interface StripGeom {
  def: StripDef;
  scale: Scale;
  /** Vertical position of the strip line */
  y: number;
  /** Vertical position of the left heading (the multiple's name) */
  labelY: number;
  x0: number;
  x1: number;
  dots: Array<{ symbol: string; v: number; x: number; y: number; marker: Marker }>;
  values: StripText[];
  medianX: number | null;
  thresholdX: number | null;
  /** How far the median and threshold ticks reach up and down from the strip; they extend so they do not vanish behind stacked markers */
  medianTick: TickReach;
  thresholdTick: TickReach;
  below: Array<StripText & { kind: 'median' | 'threshold' }>;
  bottom: number;
}

export interface StripLayout {
  W: number;
  H: number;
  narrow: boolean;
  strips: StripGeom[];
}

export interface TickReach {
  up: number;
  down: number;
}

const VAL_FS = 11.5;
const LBL_FS = 11.5;
const LINE = 14;
const TICK = 12;
/** Marker radius */
const DOT_R = 6;
/** How far a tick sticks out past the marker on top of it */
const TICK_OVER = 5;

/** The threshold joins the scale unless it is far from the data (otherwise the points would pile up at one end). */
export function thresholdInScale(values: number[], th: number): boolean {
  const reach = Math.max(10, 10 * Math.max(0, ...values.map((v) => Math.abs(v))));
  return Math.abs(th) <= reach;
}

export function layoutStrips(defs: StripDef[], W: number, markers: Map<string, Marker>): StripLayout {
  const narrow = W < 460;
  const labW = narrow ? 0 : 122;
  const x0 = labW + 12;
  const x1 = W - 18;
  const strips: StripGeom[] = [];
  let cursor = 0;

  for (const def of defs) {
    const vals = def.items.map((it) => it.v);
    const th = def.threshold;
    const thIn = th != null && thresholdInScale(vals, th);
    const domain = [...vals];
    if (def.median != null) domain.push(def.median);
    if (thIn && th != null) domain.push(th);
    const scale = stripScale(domain);
    const X = (v: number): number => x0 + ((v - scale.lo) / (scale.hi - scale.lo)) * (x1 - x0);

    const xs = def.items.map((it) => X(it.v));
    const dys = dotOffsets(xs);
    const medianX = def.median != null ? X(def.median) : null;
    const thresholdX = thIn && th != null ? X(th) : null;
    // The tick sticks out of the marker stack on top of it by at least TICK_OVER.
    const reach = (x: number | null): TickReach => {
      const r: TickReach = { up: TICK, down: TICK };
      if (x == null) return r;
      xs.forEach((dx, i) => {
        if (Math.abs(dx - x) > DOT_R + 1) return;
        r.up = Math.max(r.up, -dys[i] + DOT_R + TICK_OVER);
        r.down = Math.max(r.down, dys[i] + DOT_R + TICK_OVER);
      });
      return r;
    };
    const medianTick = reach(medianX);
    const thresholdTick = reach(thresholdX);
    const up = Math.max(TICK, Math.max(0, ...dys.map((d) => -d)) + DOT_R, medianTick.up, thresholdTick.up);
    const down = Math.max(TICK, Math.max(0, ...dys) + DOT_R, medianTick.down, thresholdTick.down);

    const valTexts = def.items.map((it) => nf(it.v));
    const valPlaced = placeLabels(
      valTexts.map((t, i) => ({ x: xs[i], w: tw(t, VAL_FS, true) })),
      labW,
      W,
    );
    const aboveLevels = valPlaced.reduce((m, p) => (p.shown ? Math.max(m, p.level + 1) : m), 0);

    const y = cursor + 6 + (narrow ? 20 : 0) + aboveLevels * LINE + up + 2;
    const base0 = y - up - 5;

    const belowRaw: Array<{ kind: 'median' | 'threshold'; text: string; x: number }> = [];
    if (def.median != null) belowRaw.push({ kind: 'median', text: `ortanca ${nf(def.median)}`, x: X(def.median) });
    if (th != null)
      belowRaw.push(
        thIn
          ? { kind: 'threshold', text: `eşik ${nf(th, 1)}`, x: X(th) }
          : { kind: 'threshold', text: `eşik ${nf(th, 1)} (ölçek dışı)`, x: th < 0 ? x0 : x1 },
      );
    const belowPlaced = placeLabels(
      belowRaw.map((b) => ({ x: b.x, w: tw(b.text, LBL_FS) })),
      labW,
      W,
      8,
    );
    const belowLevels = belowPlaced.reduce((m, p) => (p.shown ? Math.max(m, p.level + 1) : m), 0);
    const baseB = y + down + 14;
    const bottom = Math.max(baseB + (Math.max(belowLevels, 1) - 1) * LINE + 5, narrow ? 0 : y + 24);

    strips.push({
      def,
      scale,
      y,
      labelY: narrow ? cursor + 16 : y + 4,
      x0,
      x1,
      dots: def.items.map((it, i) => ({
        symbol: it.symbol,
        v: it.v,
        x: xs[i],
        y: y + dys[i],
        marker: markers.get(it.symbol) ?? markerFor(i),
      })),
      values: valPlaced.map((p, i) => ({ text: valTexts[i], x: p.x, y: base0 - p.level * LINE, shown: p.shown })),
      medianX,
      thresholdX,
      medianTick,
      thresholdTick,
      below: belowPlaced.map((p, i) => ({
        kind: belowRaw[i].kind,
        text: belowRaw[i].text,
        x: p.x,
        y: baseB + p.level * LINE,
        shown: p.shown,
      })),
      bottom,
    });
    cursor = bottom + 12;
  }

  return { W, H: Math.max(cursor - 8, 0), narrow, strips };
}

/** Fields used by the strips (StockView carries them) */
export interface StripSource {
  symbol: string;
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  netDebtEbitda: number | null;
}

export interface StripMedians {
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  netDebtEbitda: number | null;
}

/**
 * Strip definitions: P/B, EV/EBITDA and net debt/EBITDA; P/E is added at the front when
 * at least two stocks have a P/E. A strip with no values is not drawn.
 */
export function buildStripDefs(list: StripSource[], med: StripMedians, netDebtThreshold: number): StripDef[] {
  const col = (key: 'pe' | 'pb' | 'evEbitda' | 'netDebtEbitda'): Array<{ symbol: string; v: number }> =>
    list.flatMap((s) => {
      const v = s[key];
      return v != null && Number.isFinite(v) ? [{ symbol: s.symbol, v }] : [];
    });
  const defs: StripDef[] = [];
  const pe = col('pe');
  if (pe.length >= 2) defs.push({ key: 'pe', label: TERMS.pe.tr, en: TERMS.pe.en, items: pe, median: med.pe });
  defs.push({ key: 'pb', label: TERMS.pb.tr, en: TERMS.pb.en, items: col('pb'), median: med.pb });
  defs.push({ key: 'evEbitda', label: TERMS.evEbitda.tr, en: TERMS.evEbitda.en, items: col('evEbitda'), median: med.evEbitda });
  defs.push({
    key: 'netDebtEbitda',
    label: TERMS.netDebtEbitda.tr,
    en: TERMS.netDebtEbitda.en,
    items: col('netDebtEbitda'),
    median: med.netDebtEbitda,
    threshold: netDebtThreshold,
  });
  return defs.filter((d) => d.items.length > 0);
}

/* ---------- Rendering ---------- */

export function stripSvg(layout: StripLayout, aria: string): string {
  let g = '';
  for (const s of layout.strips) {
    const { def, y } = s;
    if (layout.narrow) {
      g +=
        svgText(0, s.labelY, def.label, { fw: 700, fs: 12.5 }) +
        svgText(tw(def.label, 12.5, false, true) + 10, s.labelY, def.en, { fs: 10.5, fill: 'var(--muted)' });
    } else {
      g +=
        svgText(0, s.labelY, def.label, { fw: 700, fs: 12.5 }) +
        svgText(0, s.labelY + 15, def.en, { fs: 10.5, fill: 'var(--muted)' });
    }
    g += `<line x1="${r1(s.x0)}" x2="${r1(s.x1)}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="2" stroke-linecap="round"/>`;
    if (s.thresholdX != null)
      g += `<line x1="${r1(s.thresholdX)}" x2="${r1(s.thresholdX)}" y1="${y - s.thresholdTick.up}" y2="${y + s.thresholdTick.down}" stroke="var(--warn)" stroke-width="2" stroke-dasharray="3 3"/>`;
    if (s.medianX != null)
      g += `<line x1="${r1(s.medianX)}" x2="${r1(s.medianX)}" y1="${y - s.medianTick.up}" y2="${y + s.medianTick.down}" stroke="var(--ink)" stroke-width="2"/>`;
    for (const b of s.below)
      if (b.shown)
        g += svgText(r1(b.x), b.y, b.text, {
          a: 'middle',
          fs: LBL_FS,
          fill: b.kind === 'threshold' ? 'var(--warn)' : 'var(--muted)',
        });
    for (const d of s.dots)
      g += `<g><title>${esc(d.symbol)}: ${esc(def.label)} ${nf(d.v)}</title>${markerSvg(d.marker, d.x, d.y)}</g>`;
    for (const v of s.values)
      if (v.shown) g += svgText(r1(v.x), v.y, v.text, { a: 'middle', fs: VAL_FS, ff: 'var(--mono)' });
  }
  return svgWrap(layout.W, layout.H, aria, g);
}
