/**
 * "Ortancaya göre konum" şerit grafiği: her çarpan için bir yatay şerit,
 * hisse başına bir işaret, ortanca için bir çentik, borç şeridinde eşik için
 * kesikli bir çizgi. İlk sürümdeki grafikler gibi elle kurulan SVG'dir.
 *
 * Ölçek ve etiket yerleşimi saf işlevlerdir (DOM'a dokunmaz), testleri vardır.
 */

import { svgText, svgWrap, tw } from '../lib/dom.ts';
import { esc, nf } from '../lib/format.ts';

/* ---------- Ölçek ---------- */

/** 1, 2, 2,5, 5 ya da 10'un katı olan, verilen değerden küçük olmayan adım. */
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
 * Şeridin ölçeği: her zaman sıfırı içerir (çarpan oran olduğu için konum
 * sıfıra göre okunur), uçlar düzgün bir adıma yuvarlanır.
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

/* ---------- Etiket yerleşimi ---------- */

export interface LabelBox {
  /** İstenen merkez */
  x: number;
  /** Metin genişliği */
  w: number;
}

export interface Placed {
  /** Kenarlara sığdırılmış merkez */
  x: number;
  /** 0: şeride en yakın satır, 1: bir üstü (ya da altı) */
  level: number;
  shown: boolean;
}

/**
 * Tek eksende etiket yerleşimi: soldan sağa gider, bir etiket kendi satırında
 * öncekine çarpıyorsa bir sonraki satıra kaydırılır; orada da yer yoksa
 * gösterilmez (değer tabloda ve işaretin ipucunda durur).
 * Sonuç girdi sırasındadır.
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
 * Üst üste binen işaretleri dikeyde ayırır: sırayla 0, bir adım yukarı, bir adım
 * aşağı, iki adım yukarı, iki adım aşağı dener; böylece aynı değerde beş işaret
 * ayrı ayrı görünür. Altıncı çakışan işaret yerinde kalır (değeri tabloda ve
 * işaretin ipucunda durur). Sonuç girdi sırasında dikey kaymadır (px).
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

/* ---------- İşaretler ---------- */

export const SHAPES = ['circle', 'square', 'diamond', 'triangle'] as const;
export type Shape = (typeof SHAPES)[number];

export interface Marker {
  /** CSS rengi (belirteç): var(--c1) … var(--c4) */
  color: string;
  shape: Shape;
}

/** İlk dört hisse dört renkle daire; sonrakiler aynı renkleri başka biçimle kullanır. */
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

/** Açıklama satırı için küçük işaret (16 × 16) */
export function markerIcon(m: Marker): string {
  return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${markerSvg(m, 8, 8, 5)}</svg>`;
}

/* ---------- Yerleşim ---------- */

export interface StripDef {
  key: string;
  /** Türkçe ad, ör. "PD/DD" */
  label: string;
  /** İngilizce karşılık, ör. "P/B" */
  en: string;
  items: Array<{ k: string; v: number }>;
  median: number | null;
  /** Yalnız eşiği olan şeritte (Net borç/FAVÖK) */
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
  /** Şerit çizgisinin dikey konumu */
  y: number;
  /** Sol başlığın (çarpan adı) dikey konumu */
  labelY: number;
  x0: number;
  x1: number;
  dots: Array<{ k: string; v: number; x: number; y: number; marker: Marker }>;
  values: StripText[];
  medianX: number | null;
  thresholdX: number | null;
  /** Ortanca ve eşik çentiklerinin şeritten yukarı ve aşağı uzunluğu; üst üste dizilmiş işaretlerin arkasında kaybolmasın diye uzar */
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
/** İşaretin yarıçapı */
const DOT_R = 6;
/** Çentiğin, üstüne gelen işaretten taşan kısmı */
const TICK_OVER = 5;

/** Eşik, veriye göre çok uzakta değilse ölçeğe katılır (yoksa noktalar tek uca yığılır). */
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
    // Çentik, üstüne gelen işaret yığınından en az TICK_OVER kadar taşar.
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
        k: it.k,
        v: it.v,
        x: xs[i],
        y: y + dys[i],
        marker: markers.get(it.k) ?? markerFor(i),
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

/** Şeritlerde kullanılan alanlar (StockView bunları taşır) */
export interface StripSource {
  k: string;
  fk: number | null;
  pd: number | null;
  fdf: number | null;
  nb: number | null;
}

export interface StripMedians {
  fk: number | null;
  pd: number | null;
  fdf: number | null;
  nb: number | null;
}

/**
 * Şerit tanımları: PD/DD, FD/FAVÖK ve Net borç/FAVÖK; en az iki hissenin F/K'sı
 * varsa başa F/K eklenir. Hiç değeri olmayan şerit çizilmez.
 */
export function buildStripDefs(list: StripSource[], med: StripMedians, nbThreshold: number): StripDef[] {
  const col = (key: 'fk' | 'pd' | 'fdf' | 'nb'): Array<{ k: string; v: number }> =>
    list.flatMap((s) => {
      const v = s[key];
      return v != null && Number.isFinite(v) ? [{ k: s.k, v }] : [];
    });
  const defs: StripDef[] = [];
  const fk = col('fk');
  if (fk.length >= 2) defs.push({ key: 'fk', label: 'F/K', en: 'P/E', items: fk, median: med.fk });
  defs.push({ key: 'pd', label: 'PD/DD', en: 'P/B', items: col('pd'), median: med.pd });
  defs.push({ key: 'fdf', label: 'FD/FAVÖK', en: 'EV/EBITDA', items: col('fdf'), median: med.fdf });
  defs.push({
    key: 'nb',
    label: 'Net borç/FAVÖK',
    en: 'Net debt/EBITDA',
    items: col('nb'),
    median: med.nb,
    threshold: nbThreshold,
  });
  return defs.filter((d) => d.items.length > 0);
}

/* ---------- Çizim ---------- */

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
      g += `<g><title>${esc(d.k)}: ${esc(def.label)} ${nf(d.v)}</title>${markerSvg(d.marker, d.x, d.y)}</g>`;
    for (const v of s.values)
      if (v.shown) g += svgText(r1(v.x), v.y, v.text, { a: 'middle', fs: VAL_FS, ff: 'var(--mono)' });
  }
  return svgWrap(layout.W, layout.H, aria, g);
}
