/**
 * Story 9: "İki ülke, iki kahveci" (two countries, two coffee shops). Explains why
 * BIST and US stocks are kept in separate tables. The interest, inflation and
 * growth figures are examples (model.ts → COUNTRY), not real rates.
 */

import { cw, svgText, svgWrap, tw } from '@fintools/shared/dom';
import { esc, nf } from '@fintools/shared/format';
import { siteLink } from '@fintools/shared/sites';
import { TERMS, term } from '@fintools/shared/terms';
import { byId, tileK } from './charts.ts';
import { COUNTRY, countryState } from './model.ts';

let root: HTMLElement | null = null;

const RATE_DEFAULT = 35;
const RATE_MAX = 60;

/** "+3,0 puan", "−28,0 puan" (percentage points) */
const points = (v: number): string => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), 1) + ' puan';

export function html(): string {
  const st = countryState(RATE_DEFAULT);
  return `
    <article class="case" id="case9">
      <div class="case-head"><span class="eyebrow">Hikâye 9 · İki ayrı piyasa</span><h3>İki ülke, iki kahveci</h3></div>
      <div class="story">
        <p>Ayşe'nin kuzeni Deniz, ABD'de Ayşe'nin Kahvesi'nin tıpatıp aynısını açıyor: aynı menü, aynı büyüklük, aynı kârlılık. İki dükkân da yıllık net kârının ${nf(st.pe, 1)} katına satılık; yani ikisinin de F/K'sı (P/E) ${nf(st.pe, 1)}. Tek fark şu: Ayşe TL kazanıyor, Deniz dolar.</p>
        <p>F/K'yı ters çevirince kazanç verimi (earnings yield) çıkar: 1 ÷ ${nf(st.pe, 1)} = %${nf(st.ey, 0)}. Alıcı bunu, parasını aynı para biriminde mevduata ya da devlet tahviline yatırsa alacağı faizle, yani risksiz faizle (risk-free rate) kıyaslar. Buradaki oranlar örnektir, gerçek oranlar zamanla değişir: dolar faizi %${COUNTRY.usRate} olsun, TL faizini siz seçin.</p>
        <div class="slider"><label for="country-s-rate">TL faizi (örnek) <output id="country-o-rate">%${RATE_DEFAULT}</output></label><input type="range" id="country-s-rate" min="5" max="${RATE_MAX}" step="5" value="${RATE_DEFAULT}"></div>
        <p>Büyüme de aynı gözle okunmaz. Diyelim gelecek yıl Ayşe'nin kârı TL olarak %${COUNTRY.trGrowth}, Deniz'in kârı dolar olarak %${COUNTRY.usGrowth} artıyor; enflasyon Türkiye'de %${COUNTRY.trInf}, ABD'de %${COUNTRY.usInf}. Enflasyon düşülünce ikisi de aşağı yukarı %4 büyümüş olur. PEG ise Ayşe'yi çok ucuz, Deniz'i pahalı gösterir.</p>
      </div>
      <div class="viz"><div id="country-v-chart"></div><div class="legend"><span><i style="background:var(--c1)"></i>${term('earningsYield')}</span><span><i style="background:var(--c2)"></i>Yerel faiz (örnek)</span></div><div id="country-t"></div></div>
      <div class="tiles" id="country-tiles"></div>
      <div class="learn"><b>Ne öğrendik?</b>
        <span>Aynı F/K iki ülkede aynı şeyi söylemez. Kazanç verimi (1 ÷ F/K) <b>o para birimindeki faizle</b> kıyaslanır: faiz yüksekken %7'lik verim az, faiz düşükken yeterli görünür. TL kâr büyümesinin içinde enflasyon vardır; bu yüzden nominal büyüme (nominal growth) ve ondan hesaplanan PEG, dolar kazanan bir şirketinkiyle yan yana konamaz.</span>
        <span>Başka farklar da var. Türkiye'de enflasyon muhasebesi (inflation accounting, TMS 29 / IAS 29) raporlanan kârı değiştirir (Hikâye 5); ABD şirketlerinin tablolarında genellikle böyle bir düzeltme yoktur. Yatırımcı, belirsizliği yüksek gördüğü ülkede aynı kâr için daha fazla getiri ister, yani aynı kâra daha düşük fiyat öder; bu belirsizliğe ülke riski (country risk) denir. Kur (exchange rate) da ayrı bir değişkendir: TL kârın dolar karşılığı kurla birlikte değişir.</span>
        <span><b>Sonuç:</b> bir hisseyi kendi piyasasındaki ve kendi sektöründeki benzerleriyle kıyaslayın. ${siteLink('screener', 'Tarayıcı uygulaması (screener app)')} bu yüzden BIST ve ABD hisselerini hiçbir zaman aynı tabloya koymaz; her piyasanın kendi tablosu ve kendi sektör ortancası (industry median) vardır.</span>
      </div>
    </article>`;
}

export function bind(r: HTMLElement): void {
  root = r;
  byId(r, 'country-s-rate').addEventListener('input', render);
  render();
}

const rate = (): number => (root ? Number(byId<HTMLInputElement>(root, 'country-s-rate').value) : RATE_DEFAULT);

function gapText(gap: number): string {
  if (gap < -0.05) return 'Faiz daha çok kazandırıyor: alıcı kârın büyümesine güveniyor olmalı.';
  if (gap > 0.05) return 'Dükkân, faizden fazla kazandırıyor.';
  return 'Dükkân ile faiz aynı getiriyi veriyor.';
}

function render(): void {
  if (!root) return;
  const st = countryState(rate());
  byId(root, 'country-o-rate').textContent = '%' + st.tr.rate;

  byId(root, 'country-tiles').innerHTML = `
    <div>${tileK(TERMS.earningsYield.tr, TERMS.earningsYield.en)}<div class="v">%${nf(st.ey, 1)}</div><div class="d">1 ÷ F/K. İki dükkânda da aynı.</div></div>
    <div>${tileK('Ayşe: verim − TL faizi', 'Yield minus local rate')}<div class="v">${points(st.tr.gap)}</div><div class="d">${gapText(st.tr.gap)}</div></div>
    <div>${tileK('Deniz: verim − dolar faizi', 'Yield minus local rate')}<div class="v">${points(st.us.gap)}</div><div class="d">${gapText(st.us.gap)}</div></div>
    <div>${tileK('Faize denk F/K', 'Break-even P/E')}<div class="v">${nf(st.tr.parityPe, 1)}</div><div class="d">TL: 100 ÷ ${st.tr.rate}. Dolar: 100 ÷ ${st.us.rate} = ${nf(st.us.parityPe, 1)}. Bu F/K'da kazanç verimi faize eşit olur.</div></div>`;

  const row = (label: string, a: string, b: string): string =>
    `<tr><td class="name">${label}</td><td>${esc(a)}</td><td>${esc(b)}</td></tr>`;
  byId(root, 'country-t').innerHTML = `<div class="tablebox"><table><thead><tr><th class="nosort"></th><th class="nosort">Ayşe'nin Kahvesi<small>TL · Türkiye</small></th><th class="nosort">Deniz'in Kahvesi<small>USD · ABD</small></th></tr></thead><tbody>${
    row(term('pe'), nf(st.pe, 1), nf(st.pe, 1)) +
    row(term('earningsYield'), '%' + nf(st.ey, 1), '%' + nf(st.ey, 1)) +
    row('Yerel faiz (örnek)', '%' + st.tr.rate, '%' + st.us.rate) +
    row('Verim − faiz', points(st.tr.gap), points(st.us.gap)) +
    row(term('nominalGrowth'), '%' + st.tr.growth, '%' + st.us.growth) +
    row('Enflasyon (örnek)', '%' + st.tr.inf, '%' + st.us.inf) +
    row(term('realGrowth'), '%' + nf(st.tr.realGrowth, 1), '%' + nf(st.us.realGrowth, 1)) +
    row(term('peg'), nf(st.tr.peg, 2), nf(st.us.peg, 2))
  }</tbody></table></div>`;
  draw();
}

export function draw(): void {
  if (!root) return;
  const host = byId(root, 'country-v-chart');
  const W = cw(host);
  if (!W) return;
  const st = countryState(rate());
  const narrow = W < 560;
  const labW = narrow ? 0 : Math.min(200, Math.round(W * 0.32));
  const x0 = labW;
  const x1 = W - 60;
  const X = (v: number): number => x0 + (Math.min(v, RATE_MAX) / RATE_MAX) * (x1 - x0);
  const groups: Array<{ n: string; sub: string; rateLabel: string; rate: number }> = [
    { n: "Ayşe'nin Kahvesi", sub: 'TL · Türkiye', rateLabel: 'TL faizi', rate: st.tr.rate },
    { n: "Deniz'in Kahvesi", sub: 'USD · ABD', rateLabel: 'Dolar faizi', rate: st.us.rate },
  ];
  const bh = 18;
  const rh = narrow ? 76 : 62;
  let g = '';
  groups.forEach((c, i) => {
    const y = i * rh;
    let by: number;
    if (narrow) {
      g +=
        svgText(0, y + 13, c.n, { fw: 700, fs: 12.5 }) +
        svgText(tw(c.n, 12.5, false, true) + 10, y + 13, c.sub, { fs: 10.5, fill: 'var(--muted)' });
      by = y + 20;
    } else {
      g += svgText(0, y + 18, c.n, { fw: 700, fs: 13 }) + svgText(0, y + 33, c.sub, { fs: 10.5, fill: 'var(--muted)' });
      by = y + 6;
    }
    const bars: Array<[string, number, string]> = [
      [TERMS.earningsYield.tr, st.ey, 'var(--c1)'],
      [c.rateLabel, c.rate, 'var(--c2)'],
    ];
    bars.forEach(([lbl, v, col], k) => {
      const yy = by + k * (bh + 4);
      const w = Math.max(X(v) - x0, 3);
      g += `<rect x="${x0}" y="${yy}" width="${w}" height="${bh}" rx="4" fill="${col}"><title>${esc(lbl)}: %${nf(v, 1)}</title></rect>`;
      g += svgText(x0 + w + 6, yy + 13, '%' + nf(v, k === 0 ? 1 : 0), { ff: 'var(--mono)', fs: 12, fw: k === 0 ? 700 : 400 });
    });
  });
  host.innerHTML = svgWrap(
    W,
    groups.length * rh - (narrow ? 12 : 10),
    'İki kahvecinin kazanç verimi ve yerel faiz: verim aynı, faiz farklı',
    g,
  );
}
