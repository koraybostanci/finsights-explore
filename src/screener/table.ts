/** Tarayıcı tablolarının HTML'i: başlık, "Tüm liste" satırı, "Sektör kıyası" satırı, ortanca satırı. */

import type { IndustryMedian, StockView, Thresholds } from '../types.ts';
import { ICON, VLABEL, cellColor } from '../lib/evaluate.ts';
import { esc, money, nf, pct } from '../lib/format.ts';
import { distText, fkText, growthText, roeText, verdictLabel } from './logic.ts';
import type { Col, Row, SortState, VerdictCounts } from './logic.ts';

export function headHtml(cols: Col[], sort: SortState): string {
  return (
    '<tr>' +
    cols
      .map((c) => {
        const small = c.en ? `<small>${esc(c.en)}</small>` : '';
        if (c.nosort || c.key === 'why')
          return `<th class="nosort${c.left ? ' left' : ''}" scope="col">${esc(c.lbl)}${small}</th>`;
        const on = c.key === sort.key;
        const cls = [on ? 'sorted' : '', c.left ? 'left' : ''].filter(Boolean).join(' ');
        const aria = on ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : '';
        return `<th data-k="${c.key}" data-f="sort:${c.key}" class="${cls}" scope="col" tabindex="0"${aria}>${esc(c.lbl)}${
          on ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''
        }${small}</th>`;
      })
      .join('') +
    '</tr>'
  );
}

/** Fiyatın ortalamaya uzaklığı; ortalamanın kendisi ipucunda (title) */
function smaCell(s: StockView, d: number | null, avg: number | null, n: 50 | 200): string {
  if (d == null || avg == null) return '<td>–</td>';
  return `<td title="${esc(`${n} günlük ortalama: ${money(avg, s.cur)}`)}">${esc(distText(d))}</td>`;
}

const nameCell = (s: StockView): string => `<td class="name"><b>${esc(s.k)}</b><span>${esc(s.ad)}</span></td>`;

const resCell = (r: Row): string =>
  `<td class="res"><span class="pill ${r.ev.verdict}">${ICON[r.ev.verdict]} ${esc(verdictLabel(r))}</span></td>`;

const rowOpen = (r: Row, open: boolean): string =>
  `<tr class="row" data-k="${esc(r.s.k)}" data-f="row:${esc(r.s.k)}" tabindex="0" aria-expanded="${open}">`;

/** Çarpan hücreleri: bankalarda FAVÖK'e dayananlar "–" (ilk sürümdeki gibi) */
function multipleCells(r: Row, th: Thresholds): { fk: string; pd: string; fdf: string; peg: string; nb: string; fg: string } {
  const s = r.s;
  const bank = !!s.bank;
  return {
    fk: `<td class="${cellColor('fk', s.fk, th)}">${esc(fkText(s))}</td>`,
    pd: `<td class="${cellColor('pd', s.pd, th)}">${nf(s.pd)}</td>`,
    fdf: `<td>${bank ? '–' : nf(s.fdf)}</td>`,
    peg: `<td class="${bank ? '' : cellColor('peg', s.peg, th)}">${nf(s.peg)}</td>`,
    nb: `<td class="${bank ? '' : cellColor('nb', s.nb, th)}">${bank ? '–' : nf(s.nb)}</td>`,
    fg: `<td class="${bank ? '' : cellColor('fg', s.fg, th)}">${bank ? '–' : esc(growthText(s.fg, s.fgT))}</td>`,
  };
}

/** "Tüm liste" satırı (13 sütun) */
export function listRowHtml(r: Row, th: Thresholds, open: boolean): string {
  const s = r.s;
  const c = multipleCells(r, th);
  const why = `<ul>${r.ev.checks
    .map((k) => `<li><span class="ico ${k.st}" aria-hidden="true">${ICON[k.st]}</span><span>${esc(k.s)}</span></li>`)
    .join('')}</ul>`;
  return (
    rowOpen(r, open) +
    nameCell(s) +
    resCell(r) +
    `<td class="why">${why}</td>` +
    c.fk +
    c.pd +
    c.fdf +
    c.peg +
    c.nb +
    smaCell(s, r.d200, s.sma200, 200) +
    c.fg +
    `<td>${esc(growthText(s.ng, s.ngT))}</td>` +
    `<td>${esc(roeText(s.roe))}</td>` +
    `<td>${nf(s.mv, 0)}</td></tr>`
  );
}

/** "Sektör kıyası" satırı (11 sütun) */
export function peerRowHtml(r: Row, th: Thresholds, open: boolean): string {
  const s = r.s;
  const c = multipleCells(r, th);
  return (
    rowOpen(r, open) +
    nameCell(s) +
    resCell(r) +
    c.fk +
    c.pd +
    c.fdf +
    c.peg +
    c.nb +
    c.fg +
    `<td>${esc(roeText(s.roe))}</td>` +
    smaCell(s, r.d50, s.sma50, 50) +
    smaCell(s, r.d200, s.sma200, 200) +
    '</tr>'
  );
}

/** Sektör ortancası satırı ("Sektör kıyası" sütunlarıyla) */
export function medianRowHtml(m: IndustryMedian): string {
  return `<tr class="med"><td colspan="2">Sektör ortancası <span class="en">(Median)</span></td><td>${nf(m.fk)}</td><td>${nf(
    m.pd,
  )}</td><td>${nf(m.fdf)}</td><td>${nf(m.peg)}</td><td>${nf(m.nb)}</td><td>${pct(m.fg)}</td><td>${esc(
    roeText(m.roe),
  )}</td><td>–</td><td>–</td></tr>`;
}

export const detailRowHtml = (colspan: number, inner: string): string =>
  `<tr class="detail"><td colspan="${colspan}">${inner}</td></tr>`;

export const messageRowHtml = (colspan: number, text: string): string =>
  `<tr><td class="sc-msg" colspan="${colspan}">${esc(text)}</td></tr>`;

/** Özet rozetleri; "Veri bekliyor" yalnızca böyle hisse varsa görünür */
export function summaryHtml(c: VerdictCounts, showBanks: boolean): string {
  const pill = (v: 'good' | 'warn' | 'bad', n: number): string =>
    `<span class="pill ${v}">${ICON[v]} ${VLABEL[v]}: ${n}</span>`;
  return (
    pill('good', c.good) +
    pill('warn', c.warn) +
    pill('bad', c.bad) +
    (showBanks ? `<span class="pill na">${ICON.na} Banka: ${c.bank}</span>` : '') +
    (c.waiting > 0 ? `<span class="pill na">${ICON.na} Veri bekliyor: ${c.waiting}</span>` : '')
  );
}
