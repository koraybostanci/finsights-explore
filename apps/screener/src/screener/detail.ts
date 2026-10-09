/**
 * The expanded row (stock detail): checks, the hand-written comment, extra facts and
 * moving averages. The functions here only produce text and HTML.
 * Every number comes from the data; without data they print "–" or an explicit note.
 */

import type { Evaluation, PriceSeries, StockView } from '../types.ts';
import { ICON } from '../lib/evaluate.ts';
import { esc, fmtDate, money, nf, pct } from '@fintools/shared/format';
import { noteIsCurrent } from '../lib/note.ts';
import { distancePct, lastCross, lastSma, trend } from '@fintools/shared/sma';
import { TERMS } from '@fintools/shared/terms';
import { SMA_WINDOW, seriesUsable } from './smachart.ts';

/* ---------- Extra facts ---------- */

/** The "extra facts" sentences from the first release; the target price is written in the stock's own currency. */
export function extraInfo(s: StockView): string[] {
  const parts: string[] = [];
  if (s.pe != null && s.roe != null)
    parts.push(`Yaklaşık özkaynak kârlılığı %${nf(s.roe, 1)} (PD/DD ${nf(s.pb)} ÷ F/K ${nf(s.pe)}).`);
  if (s.pb != null && s.pb < 1) parts.push(`PD/DD ${nf(s.pb)}: piyasa şirketi özkaynağının altında fiyatlıyor.`);
  if (s.functionalCurrency) parts.push(`Fonksiyonel para birimi ${s.functionalCurrency}; kârı kur hareketinden etkilenir.`);
  if (s.targetPrice != null && s.price != null && s.price !== 0) {
    const pot = (s.targetPrice / s.price - 1) * 100;
    parts.push(
      `Analistlerin ortalama 12 aylık hedefi ${money(s.targetPrice, s.currency)}, fiyat ${money(s.price, s.currency)} (nominal potansiyel ${pct(pot)}).`,
    );
  }
  if (s.bank && (s.npl != null || s.car != null || s.nim != null))
    parts.push(
      `Takipteki kredi oranı %${nf(s.npl, 2)}, sermaye yeterliliği %${nf(s.car, 1)}, net faiz marjı %${nf(s.nim, 2)}.`,
    );
  return parts;
}

export function checksHtml(ev: Evaluation): string {
  return `<ul>${ev.checks
    .map(
      (c) =>
        `<li><span class="ico ${c.status}" aria-hidden="true">${ICON[c.status]}</span><span><b>${esc(c.label)}:</b> ${esc(c.long)}</span></li>`,
    )
    .join('')}</ul>`;
}

/**
 * The hand-written comment, labelled with the date of the data it was written against.
 * If the data belongs to a later day (dataAsOf) the comment is not shown: it may
 * contradict the new figures.
 */
export function noteHtml(s: StockView, dataAsOf?: string): string {
  if (!s.note || !noteIsCurrent(s.noteAsOf, dataAsOf)) return '';
  const lbl = s.noteAsOf ? `Yorum (${fmtDate(s.noteAsOf, false)} verisine göre yazıldı)` : 'Yorum';
  return `<p><span class="muted small">${esc(lbl)}:</span> ${esc(s.note)}</p>`;
}

/* ---------- Moving averages ---------- */

export type SmaN = 20 | 50 | 200;

export interface SmaAvg {
  n: SmaN;
  v: number | null;
  /** Distance of the price from this average, in % */
  dist: number | null;
}

export interface SmaView {
  price: number | null;
  avgs: SmaAvg[];
  /** Rule-based sentences (the trend and, if any, a recent cross) */
  sentences: string[];
}

const NS: SmaN[] = [20, 50, 200];

/** The trend sentence; looks only at the ordering of the price and the averages. */
export function trendSentence(price: number | null, s50: number | null, s200: number | null): string {
  if (price == null || (s50 == null && s200 == null)) return 'Eğilimi okumak için yeterli fiyat verisi yok.';
  if (s50 == null || s200 == null) {
    const known = s50 != null ? s50 : (s200 as number);
    const name = s50 != null ? '50' : '200';
    const missing = s50 != null ? '200' : '50';
    return `Fiyat ${name} günlük ortalamanın ${price >= known ? 'üstünde' : 'altında'}. ${missing} günlük ortalama için yeterli veri yok.`;
  }
  const t = trend(price, s50, s200);
  if (t === 'up') return 'Fiyat 50 ve 200 günlük ortalamaların üstünde: eğilim yukarı.';
  if (t === 'down') return 'Fiyat 50 ve 200 günlük ortalamaların altında: eğilim aşağı.';
  const a50 = price >= s50;
  const a200 = price >= s200;
  if (a50 && a200)
    return 'Fiyat iki ortalamanın da üstünde ama 50 günlük ortalama henüz 200 günlüğün altında: eğilim karışık.';
  if (!a50 && !a200)
    return 'Fiyat iki ortalamanın da altında ama 50 günlük ortalama hâlâ 200 günlüğün üstünde: eğilim karışık.';
  return a50
    ? 'Fiyat 50 günlük ortalamanın üstünde, 200 günlük ortalamanın altında: eğilim karışık.'
    : 'Fiyat 50 günlük ortalamanın altında, 200 günlük ortalamanın üstünde: eğilim karışık.';
}

/** Sentence for the latest cross in the last 60 trading days; null if none. */
export function crossSentence(series: PriceSeries | null | undefined): string | null {
  if (!seriesUsable(series)) return null;
  const cr = lastCross(series.closes);
  if (!cr) return null;
  const day = fmtDate(series.dates[cr.index], false);
  return cr.kind === 'golden'
    ? `Yakın zamanda altın kesişim (golden cross) görüldü: 50 günlük ortalama 200 günlüğü yukarı kesti (${day}).`
    : `Yakın zamanda ölüm kesişimi (death cross) görüldü: 50 günlük ortalama 200 günlüğü aşağı kesti (${day}).`;
}

/**
 * Data for the tiles and sentences. The averages come from the market.json fields first
 * (the same numbers as the table columns), otherwise they are computed from the price series.
 */
export function smaView(s: StockView, series: PriceSeries | null | undefined): SmaView {
  const closes = seriesUsable(series) ? series.closes : null;
  const field: Record<SmaN, number | null> = { 20: s.sma20, 50: s.sma50, 200: s.sma200 };
  const price = s.price;
  const avgs = NS.map((n) => {
    const v = field[n] ?? (closes ? lastSma(closes, n) : null);
    return { n, v, dist: distancePct(price, v) };
  });
  const sentences: string[] = [];
  if (avgs.some((a) => a.v != null)) {
    sentences.push(trendSentence(price, avgs[1].v, avgs[2].v));
    const cr = crossSentence(series);
    if (cr) sentences.push(cr);
  }
  return { price, avgs, sentences };
}

const HORIZON: Record<SmaN, string> = { 20: 'Kısa vade', 50: 'Orta vade', 200: 'Uzun vade' };

/** Names from the term dictionary; falls back to the spelling given here when missing. */
const lblOf = (id: string, tr: string, en: string): { tr: string; en: string } => TERMS[id] ?? { tr, en };

/** "fiyat %4,2 üstünde" (price 4.2% above) */
export function distPhrase(d: number | null): string {
  if (d == null) return '';
  const a = Math.abs(d);
  if (a < 0.05) return 'fiyat ortalamayla aynı düzeyde';
  return `fiyat %${nf(a, 1)} ${d > 0 ? 'üstünde' : 'altında'}`;
}

export const SMA_REMINDER =
  'Ortalama eğilimi gösterir, değeri değil: fiyatın ortalamanın üstünde olması hissenin ucuz ya da pahalı olduğunu söylemez.';

export function smaTilesHtml(s: StockView, v: SmaView, priceDate: string): string {
  const tile = (k: string, en: string, val: string, d: string): string =>
    `<div><div class="k">${esc(k)}<span class="en">${esc(en)}</span></div><div class="v">${esc(val)}</div><div class="d">${esc(d)}</div></div>`;
  const pr = lblOf('price', 'Fiyat', 'Price');
  return `<div class="tiles">${tile(pr.tr, pr.en, money(v.price, s.currency), priceDate)}${v.avgs
    .map((a) => {
      const t = lblOf(`sma${a.n}`, `${a.n} günlük ortalama`, `SMA ${a.n}`);
      const ph = distPhrase(a.dist);
      return tile(t.tr, t.en, money(a.v, s.currency), ph ? `${HORIZON[a.n]} · ${ph}` : HORIZON[a.n]);
    })
    .join('')}</div>`;
}

/** Legend row; lists only the averages drawn on the chart (a short series has no 200-day average). */
export function smaLegendHtml(days: number): string {
  const item = (color: string, text: string): string => `<span><i style="background:var(${color})"></i>${text}</span>`;
  const avg = (n: SmaN, color: string, extra = ''): string => (days > n ? item(color, `${n} günlük ortalama${extra}`) : '');
  return `<div class="legend">${item('--ink', 'Fiyat')}${avg(20, '--c1')}${avg(50, '--c2')}${avg(200, '--c3', ' (kesikli)')}</div>`;
}

/** Period line under the chart: "Son 250 işlem günü · 3 Ekim 2025 – 2 Ekim 2026" */
export function smaRangeText(series: PriceSeries): string {
  const n = series.closes.length;
  const shown = Math.min(n, SMA_WINDOW);
  return `Son ${shown} işlem günü · ${fmtDate(series.dates[n - shown], false)} – ${fmtDate(series.dates[n - 1], false)}`;
}

/**
 * Inner HTML of the moving-averages section.
 * series: undefined means the series is loading, null means no file, an array means the
 * chart will be drawn (the chart container is left empty and filled separately once the
 * width is measured).
 */
export function smaBlockHtml(
  s: StockView,
  series: PriceSeries | null | undefined,
  priceDate: string,
  chartId: string,
): string {
  const v = smaView(s, series);
  let chart: string;
  if (series === undefined) chart = `<p class="muted small"><span class="spin"></span> Fiyat serisi yükleniyor…</p>`;
  else if (!seriesUsable(series))
    chart = `<p class="muted small">Fiyat serisi henüz yok; ilk veri güncellemesinde gelir.</p>`;
  else
    chart = `<div class="chartbox" id="${esc(chartId)}"></div>${smaLegendHtml(series.closes.length)}<p class="muted small">${esc(
      smaRangeText(series),
    )}</p>`;
  const says = v.sentences.length ? `<p>${v.sentences.map(esc).join(' ')}</p>` : '';
  return `<div class="lbl">Hareketli ortalamalar · <span lang="en">Simple moving averages (SMA)</span></div>
${smaTilesHtml(s, v, priceDate)}
${chart}
${says}
<p class="muted small">${esc(SMA_REMINDER)}</p>`;
}

/* ---------- Whole detail ---------- */

export interface DetailParts {
  /** HTML of the AI comment section (produced by ai-ui.ts) */
  ai: string;
  /** HTML of the moving-averages section */
  sma: string;
  /** The stock id used for ids and data attributes, e.g. "BIST-THYAO" */
  id: string;
  /** Date of the data in the stock's market; the hand-written comment's freshness is checked against it */
  asOf?: string;
}

export function detailHtml(s: StockView, ev: Evaluation, p: DetailParts): string {
  // The language is set so English text in an upper-cased label is not cased with Turkish rules ("İ").
  const name = s.market === 'US' ? `<span lang="en">${esc(s.name)}</span>` : esc(s.name);
  const title = `<div class="lbl">${name} · ${esc(s.industryTr)} <span lang="en">(${esc(s.industryEn)})</span></div>`;
  if (!s.hasData)
    return `<div class="det"><div>${title}<p>Bu hissenin verisi henüz gelmedi; bir sonraki veri güncellemesinde dolar.</p></div></div>`;
  const extra = extraInfo(s);
  return `<div class="det">
<div><div class="lbl">Ölçüt ölçüt</div>${checksHtml(ev)}</div>
<div class="stack">
<div>${title}${noteHtml(s, p.asOf)}</div>
<div class="stack sc-ai" data-ai-for="${esc(p.id)}">${p.ai}</div>
${extra.length ? `<div><div class="lbl">Ek bilgiler</div><p>${extra.map(esc).join(' ')}</p></div>` : ''}
</div>
<div class="stack sc-wide" data-sma-for="${esc(p.id)}">${p.sma}</div>
</div>`;
}
