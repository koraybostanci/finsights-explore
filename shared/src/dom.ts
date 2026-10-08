/** DOM and SVG helpers for the hand-drawn charts. */

import { esc } from './format.ts';

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

/** Returns the element with the given id, or throws; for fixed ids inside a module. */
export function must<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} bulunamadı`);
  return el as T;
}

/** Drawing width of a container; 0 while it is hidden (the chart is skipped). */
export function cw(target: string | HTMLElement | null): number {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  const w = el ? el.clientWidth : 0;
  return w > 0 ? Math.max(260, Math.floor(w)) : 0;
}

export interface SvgTextOpts {
  fs?: number;
  fill?: string;
  ff?: string;
  fw?: number;
  a?: 'start' | 'middle' | 'end';
}

export const svgText = (x: number, y: number, t: string | number, o: SvgTextOpts = {}): string =>
  `<text x="${x}" y="${y}" font-size="${o.fs ?? 12}" fill="${o.fill ?? 'var(--ink)'}" font-family="${
    o.ff ?? 'var(--ui)'
  }" font-weight="${o.fw ?? 400}" text-anchor="${o.a ?? 'start'}">${esc(t)}</text>`;

/** Approximate text width in px, used to avoid overlapping labels. */
export const tw = (t: string | number, fs = 12, mono = false, bold = false): number =>
  String(t).length * fs * (mono ? 0.62 : bold ? 0.6 : 0.56);

export const svgWrap = (W: number, H: number, label: string, g: string): string =>
  `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`;
