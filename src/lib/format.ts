/** Biçimlendirme yardımcıları. Sayılar Türkçe yazımla (1.234,56) gösterilir. */

import type { Currency } from '../types.ts';

export const nf = (v: number | null | undefined, d = 2): string =>
  v == null || Number.isNaN(v)
    ? '–'
    : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const pct = (v: number | null | undefined, d = 0): string =>
  v == null ? '–' : (v > 0 ? '+' : '') + '%' + nf(v, d);

export const tl = (v: number | null | undefined): string => nf(v, 0) + ' TL';

const CUR_LABEL: Record<Currency, string> = { TRY: 'TL', USD: 'USD' };

/** "291,00 TL", "187,20 USD" */
export const money = (v: number | null | undefined, cur: Currency, d = 2): string =>
  v == null ? '–' : `${nf(v, d)} ${CUR_LABEL[cur]}`;

export const curLabel = (cur: Currency): string => CUR_LABEL[cur];

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML'e yazılacak her dış metin bundan geçer. */
export const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** "2 Ekim 2026 15:00" (İstanbul saatiyle) */
export function fmtDate(iso: string, withTime = true): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      timeZone: 'Europe/Istanbul',
    });
  } catch {
    return iso;
  }
}
