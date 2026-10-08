/** HTML of the screener tables: header, full-list row, industry-comparison row, median row. */

import type { IndustryMedian, StockView, Thresholds } from '../types.ts';
import { ICON, VLABEL, cellColor } from '../lib/evaluate.ts';
import { esc, money, nf, pct } from '@fintools/shared/format';
import { distText, peText, growthText, roeText, verdictLabel } from './logic.ts';
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
        return `<th data-sort="${c.key}" data-f="sort:${c.key}" class="${cls}" scope="col" tabindex="0"${aria}>${esc(c.lbl)}${
          on ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''
        }${small}</th>`;
      })
      .join('') +
    '</tr>'
  );
}

/** Distance of the price from the average; the average itself goes in the tooltip (title) */
function smaCell(s: StockView, d: number | null, avg: number | null, n: 50 | 200): string {
  if (d == null || avg == null) return '<td>–</td>';
  return `<td title="${esc(`${n} günlük ortalama: ${money(avg, s.currency)}`)}">${esc(distText(d))}</td>`;
}

const nameCell = (s: StockView): string => `<td class="name"><b>${esc(s.symbol)}</b><span>${esc(s.name)}</span></td>`;

const resCell = (r: Row): string =>
  `<td class="res"><span class="pill ${r.ev.verdict}">${ICON[r.ev.verdict]} ${esc(verdictLabel(r))}</span></td>`;

const rowOpen = (r: Row, open: boolean): string =>
  `<tr class="row" data-symbol="${esc(r.s.symbol)}" data-f="row:${esc(r.s.symbol)}" tabindex="0" aria-expanded="${open}">`;

/** Multiple cells: for banks those based on EBITDA show "–" (as in the first release) */
function multipleCells(r: Row, th: Thresholds): {
  pe: string;
  pb: string;
  evEbitda: string;
  peg: string;
  netDebtEbitda: string;
  ebitdaGrowth: string;
} {
  const s = r.s;
  const bank = !!s.bank;
  return {
    pe: `<td class="${cellColor('pe', s.pe, th)}">${esc(peText(s))}</td>`,
    pb: `<td class="${cellColor('pb', s.pb, th)}">${nf(s.pb)}</td>`,
    evEbitda: `<td>${bank ? '–' : nf(s.evEbitda)}</td>`,
    peg: `<td class="${bank ? '' : cellColor('peg', s.peg, th)}">${nf(s.peg)}</td>`,
    netDebtEbitda: `<td class="${bank ? '' : cellColor('netDebtEbitda', s.netDebtEbitda, th)}">${bank ? '–' : nf(s.netDebtEbitda)}</td>`,
    ebitdaGrowth: `<td class="${bank ? '' : cellColor('ebitdaGrowth', s.ebitdaGrowth, th)}">${bank ? '–' : esc(growthText(s.ebitdaGrowth, s.ebitdaGrowthNote))}</td>`,
  };
}

/** Full-list row (13 columns) */
export function listRowHtml(r: Row, th: Thresholds, open: boolean): string {
  const s = r.s;
  const c = multipleCells(r, th);
  const why = `<ul>${r.ev.checks
    .map((k) => `<li><span class="ico ${k.status}" aria-hidden="true">${ICON[k.status]}</span><span>${esc(k.short)}</span></li>`)
    .join('')}</ul>`;
  return (
    rowOpen(r, open) +
    nameCell(s) +
    resCell(r) +
    `<td class="why">${why}</td>` +
    c.pe +
    c.pb +
    c.evEbitda +
    c.peg +
    c.netDebtEbitda +
    smaCell(s, r.d200, s.sma200, 200) +
    c.ebitdaGrowth +
    `<td>${esc(growthText(s.netIncomeGrowth, s.netIncomeGrowthNote))}</td>` +
    `<td>${esc(roeText(s.roe))}</td>` +
    `<td>${nf(s.marketCap, 0)}</td></tr>`
  );
}

/** Industry-comparison row (11 columns) */
export function peerRowHtml(r: Row, th: Thresholds, open: boolean): string {
  const s = r.s;
  const c = multipleCells(r, th);
  return (
    rowOpen(r, open) +
    nameCell(s) +
    resCell(r) +
    c.pe +
    c.pb +
    c.evEbitda +
    c.peg +
    c.netDebtEbitda +
    c.ebitdaGrowth +
    `<td>${esc(roeText(s.roe))}</td>` +
    smaCell(s, r.d50, s.sma50, 50) +
    smaCell(s, r.d200, s.sma200, 200) +
    '</tr>'
  );
}

/** Industry median row (with the industry-comparison columns) */
export function medianRowHtml(m: IndustryMedian): string {
  return `<tr class="med"><td colspan="2">Sektör ortancası <span class="en">(Median)</span></td><td>${nf(m.pe)}</td><td>${nf(
    m.pb,
  )}</td><td>${nf(m.evEbitda)}</td><td>${nf(m.peg)}</td><td>${nf(m.netDebtEbitda)}</td><td>${pct(m.ebitdaGrowth)}</td><td>${esc(
    roeText(m.roe),
  )}</td><td>–</td><td>–</td></tr>`;
}

export const detailRowHtml = (colspan: number, inner: string): string =>
  `<tr class="detail"><td colspan="${colspan}">${inner}</td></tr>`;

export const messageRowHtml = (colspan: number, text: string): string =>
  `<tr><td class="sc-msg" colspan="${colspan}">${esc(text)}</td></tr>`;

/** Summary pills; the "waiting for data" pill only shows when such stocks exist */
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
