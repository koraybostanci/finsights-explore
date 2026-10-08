/** Drawing helpers shared by the stories (hand-drawn SVG charts). */

import { cw, svgText, svgWrap, tw } from '@fintools/shared/dom';
import { esc, nf } from '@fintools/shared/format';

/** Finds an element by id inside a tab's root; returns the right one even if ids clash with other tabs. */
export function byId<T extends HTMLElement = HTMLElement>(root: ParentNode, id: string): T {
  const el = root.querySelector<T>('#' + id);
  if (!el) throw new Error(`#${id} bulunamadı`);
  return el;
}

export interface FlowRow {
  lbl: string;
  en: string;
  v: number;
  /** total: subtotal · minus: expense · key: EBITDA, net income */
  t: 'total' | 'minus' | 'key';
}

export interface FlowOpts {
  lo: number;
  hi: number;
  fmt: (v: number) => string;
  aria: string;
}

/**
 * Horizontal flow chart, shared by the income statement and the neighborhood fund.
 * The label goes above the bar on a narrow screen and to the left on a wide one.
 */
export function flowChart(el: HTMLElement, rows: FlowRow[], o: FlowOpts): void {
  const W = cw(el);
  if (!W) return;
  const narrow = W < 560;
  const labW = narrow ? 0 : Math.min(210, Math.round(W * 0.32));
  const valW = 84;
  const x0 = labW;
  const x1 = W - valW;
  const { lo, hi } = o;
  const X = (v: number): number => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  const rh = narrow ? 44 : 34;
  const bh = narrow ? 16 : 20;
  let g = '';
  let run = 0;
  if (lo < 0)
    g += `<line x1="${X(0)}" x2="${X(0)}" y1="0" y2="${rows.length * rh}" stroke="var(--muted)" stroke-width="1"/>`;
  rows.forEach((r, i) => {
    const y = i * rh;
    let a: number;
    let b: number;
    if (r.t === 'minus') {
      a = run + r.v;
      b = run;
      run += r.v;
    } else {
      a = Math.min(0, r.v);
      b = Math.max(0, r.v);
      run = r.v;
    }
    const fill = r.t === 'minus' ? 'var(--bad)' : r.t === 'key' ? (r.v < 0 ? 'var(--bad)' : 'var(--c1)') : 'var(--c3)';
    const strong = r.t !== 'minus';
    let by: number;
    if (narrow) {
      g +=
        svgText(0, y + 12, r.lbl, { fw: strong ? 700 : 400, fs: 12.5 }) +
        svgText(tw(r.lbl, 12.5, false, strong) + 10, y + 12, r.en, { fs: 10.5, fill: 'var(--muted)' });
      by = y + 18;
    } else {
      g +=
        svgText(0, y + 14, r.lbl, { fw: strong ? 700 : 400, fs: 13 }) +
        svgText(0, y + 28, r.en, { fs: 10.5, fill: 'var(--muted)' });
      by = y + 6;
    }
    g += `<rect x="${X(a)}" y="${by}" width="${Math.max(X(b) - X(a), 2)}" height="${bh}" rx="3" fill="${fill}" opacity="${
      r.t === 'minus' ? 0.55 : 1
    }"><title>${esc(r.lbl)}: ${esc(o.fmt(r.v))}</title></rect>`;
    g += svgText(Math.max(X(a), X(b)) + 6, by + bh / 2 + 4, o.fmt(r.v), {
      ff: 'var(--mono)',
      fs: 11.5,
      fw: r.t === 'key' ? 700 : 400,
      fill: strong ? 'var(--ink)' : 'var(--muted)',
    });
  });
  el.innerHTML = svgWrap(W, rows.length * rh, o.aria, g);
}

export const fmtThousands = (v: number): string => (v < 0 ? '−' : '') + nf(Math.abs(v) / 1000, 0) + ' bin';
export const fmtThousands1 = (v: number): string => (v < 0 ? '−' : '') + nf(Math.abs(v) / 1000, 1) + ' bin';

/** Tile heading: the Turkish term with its English counterpart below. */
export const tileK = (tr: string, en: string): string =>
  `<div class="k">${esc(tr)}<span class="en">${esc(en)}</span></div>`;

/** SVG path data for a line; the line breaks at null values. */
export function linePath(values: Array<number | null>, X: (i: number) => number, Y: (v: number) => number): string {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}
