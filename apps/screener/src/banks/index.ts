/**
 * Banks tab (BIST only): banks are judged not by EBITDA and debt but by the relation
 * between return on equity and P/B. The scatter chart, table and term cards from the
 * first release.
 */

import { on, stocks } from '../data/store.ts';
import { cw, svgText, svgWrap, tw } from '@fintools/shared/dom';
import { esc, nf, pct } from '@fintools/shared/format';
import type { StockView } from '../types.ts';

let root: HTMLElement | null = null;

const banks = (): StockView[] => stocks('BIST', { banks: 'only' });

/** Points of return on equity per 1 unit of P/B */
const yieldPerPb = (b: StockView): number | null => (b.roe != null && b.pb != null && b.pb !== 0 ? b.roe / b.pb : null);

const BT: Array<[string, string, string]> = [
  [
    'Getiri / PD/DD',
    'ROE ÷ P/B',
    "Her 1 birim PD/DD'ye karşılık kaç puan özkaynak kârlılığı alıyorsunuz. Yüksek olması, getirisine göre daha ucuz olduğunu gösterir. Tablo bu sütuna göre sıralı.",
  ],
  [
    'Takipteki kredi oranı',
    'Non-performing loans, NPL',
    'Geri ödenmeyen kredilerin toplam kredilere oranı. Yükselmesi gelecekte karşılık giderinin, yani kârı aşağı çekecek bir kalemin artacağını gösterir.',
  ],
  [
    'Sermaye yeterlilik oranı',
    'Capital adequacy ratio, CAR',
    'Bankanın kayıplara karşı tampon sermayesi. Yasal alt sınırın rahat üzerinde olması, temettü ve büyüme alanı tanır.',
  ],
  [
    'Net faiz marjı',
    'Net interest margin, NIM',
    'Kredilerden kazanılan faiz ile mevduata ödenen faiz arasındaki fark. Faiz indirimleri genelde bankaların marjını genişletir.',
  ],
];

function shellHtml(): string {
  return `<div class="stack read">
<h2>Bankalar neden ayrı?</h2>
<p>Bir sanayi şirketi için borç bir yüktür; banka için ise hammaddedir. Mevduat <span class="en">(deposits)</span> toplayıp kredi <span class="en">(loans)</span> verir. Bu yüzden bankalarda FAVÖK, FD/FAVÖK ve net borç anlamsızdır. Temel soru şudur: <em>Özkaynağına ne kadar getiri sağlıyor ve piyasa bu özkaynağa kaç kat değer biçiyor?</em> "Mahalle sandığı" hikâyesi bunun küçük bir örneği.</p>
<p>Kural basittir: özkaynak kârlılığı yüksek bir bankanın PD/DD'si de yüksek olmayı hak eder. Getirisi yüksek ama PD/DD'si düşük kalan banka görece ucuz, getirisi düşük ama PD/DD'si yüksek olan banka görece pahalı sayılır.</p>
</div>
<div class="chartbox" id="bankchart"></div>
<div class="tablebox" id="bk-tablebox"><table id="banktbl"></table></div>
<div class="cards" id="bankterms">${BT.map(
    (t) => `<article class="card"><h3>${esc(t[0])} <span class="en">(${esc(t[1])})</span></h3><p>${esc(t[2])}</p></article>`,
  ).join('')}</div>`;
}

const CHART_LBL = '<div class="lbl">BIST bankaları: getiri ve fiyat</div>';

function renderChart(): void {
  const box = root?.querySelector<HTMLElement>('#bankchart');
  if (!box) return;
  const B = banks();
  const withData = B.filter((b): b is StockView & { pb: number; roe: number } => b.pb != null && b.roe != null);
  if (!withData.length) {
    box.innerHTML = `${CHART_LBL}<p class="muted small">${
      B.length
        ? 'Bankaların verisi henüz gelmedi; grafik ilk veri güncellemesiyle çizilir.'
        : 'Veride banka yok; grafik çizilemiyor.'
    }</p>`;
    return;
  }
  const W = cw(box) - 28;
  if (W <= 0) return;
  const H = Math.round(Math.min(400, Math.max(280, W * 0.55)));
  const m = { l: 52, r: 16, t: 22, b: 46 };
  const pbs = withData.map((b) => b.pb);
  const roes = withData.map((b) => b.roe);
  const x0 = Math.min(0.5, Math.floor(Math.min(...pbs) * 10) / 10);
  const x1 = Math.max(1.2, Math.ceil(Math.max(...pbs) * 10) / 10);
  const y0 = Math.min(10, Math.floor(Math.min(...roes) / 4) * 4);
  const y1 = Math.max(26, Math.ceil(Math.max(...roes) / 4) * 4);
  const X = (v: number): number => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
  const Y = (v: number): number => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const xstep = W < 480 ? 0.2 : 0.1;
  let g = '';
  for (let v = x0; v <= x1 + 1e-9; v += xstep)
    g +=
      `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}" stroke="var(--line)" stroke-width="1"/>` +
      svgText(X(v), H - m.b + 17, nf(v, 1), { a: 'middle', fs: 11, ff: 'var(--mono)', fill: 'var(--muted)' });
  for (let v = y0; v <= y1; v += 4)
    g +=
      `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/>` +
      svgText(m.l - 8, Y(v) + 4, '%' + v, { a: 'end', fs: 11, ff: 'var(--mono)', fill: 'var(--muted)' });
  if (x0 <= 1 && x1 >= 1)
    g +=
      `<line x1="${X(1)}" x2="${X(1)}" y1="${m.t}" y2="${H - m.b}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/>` +
      svgText(X(1) + 6, m.t + 12, 'PD/DD = 1', { fs: 11, fill: 'var(--muted)' });
  g += svgText((m.l + W - m.r) / 2, H - 8, 'PD/DD · P/B (sola doğru daha ucuz)', { a: 'middle', fs: 11.5, fill: 'var(--muted)' });
  g += `<text transform="translate(13 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle" font-size="11.5" fill="var(--muted)" font-family="var(--ui)">ÖK kârlılığı ≈ · ROE</text>`;

  // Label placement: pick the first position that overlaps neither the points nor earlier labels
  interface Rect {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  const pts = withData.map((b) => ({ b, x: X(b.pb), y: Y(b.roe) }));
  const placed: Rect[] = [];
  const lh = 14;
  const lw = (t: string): number => tw(t, 12, true) + 4;
  const hit = (r: Rect): boolean =>
    placed.some((p) => !(r.x2 < p.x1 || r.x1 > p.x2 || r.y2 < p.y1 || r.y1 > p.y2)) ||
    pts.some((p) => p.x > r.x1 - 7 && p.x < r.x2 + 7 && p.y > r.y1 - 7 && p.y < r.y2 + 7) ||
    r.x1 < m.l ||
    r.x2 > W - m.r ||
    r.y1 < m.t ||
    r.y2 > H - m.b;
  const labels: Array<{ symbol: string; r: Rect }> = [];
  for (const p of [...pts].sort((a, b) => a.y - b.y)) {
    const w = lw(p.b.symbol);
    const cands: Array<[number, number]> = [
      [10, -lh / 2],
      [-10 - w, -lh / 2],
      [-w / 2, -lh - 10],
      [-w / 2, 10],
      [10, -lh - 6],
      [10, 6],
      [-10 - w, -lh - 6],
      [-10 - w, 6],
    ];
    let best: Rect | null = null;
    for (const [dx, dy] of cands) {
      const r = { x1: p.x + dx, y1: p.y + dy, x2: p.x + dx + w, y2: p.y + dy + lh };
      if (!hit(r)) {
        best = r;
        break;
      }
    }
    if (!best) best = { x1: p.x + 10, y1: p.y - lh / 2, x2: p.x + 10 + w, y2: p.y + lh / 2 };
    placed.push(best);
    labels.push({ symbol: p.b.symbol, r: best });
  }
  for (const p of pts)
    g += `<g class="pt" data-symbol="${esc(p.b.symbol)}"><circle cx="${p.x}" cy="${p.y}" r="14" fill="transparent"/><circle cx="${p.x}" cy="${p.y}" r="6" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></g>`;
  for (const l of labels) g += svgText(l.r.x1 + 2, l.r.y2 - 3, l.symbol, { fs: 12, fw: 700, ff: 'var(--mono)' });

  const waiting = B.length - withData.length;
  box.innerHTML = `${CHART_LBL}${svgWrap(
    W,
    H,
    'Bankaların PD/DD ve özkaynak kârlılığı saçılım grafiği',
    g,
  )}<div class="tip" id="btip" hidden></div><p class="muted small">Sol üst köşe: yüksek getiri, düşük fiyat. Sağ alt köşe: düşük getiri, yüksek fiyat. Özkaynak kârlılığı PD/DD ÷ F/K ile yaklaşık hesaplanmıştır.${
    waiting > 0 ? ` Verisi eksik ${waiting} banka grafikte yok.` : ''
  }</p>`;

  const tip = box.querySelector<HTMLElement>('#btip');
  if (!tip) return;
  box.querySelectorAll<SVGGElement>('.pt').forEach((p) => {
    p.addEventListener('mousemove', (e) => {
      const b = withData.find((z) => z.symbol === p.dataset.symbol);
      if (!b) return;
      const r = box.getBoundingClientRect();
      tip.textContent = `${b.name}: PD/DD ${nf(b.pb)} · ÖK kârl. %${nf(b.roe, 1)} · F/K ${nf(b.pe)}`;
      tip.hidden = false;
      let lx = e.clientX - r.left + 12;
      if (lx + tip.offsetWidth > r.width - 8) lx = e.clientX - r.left - tip.offsetWidth - 12;
      tip.style.left = Math.max(4, lx) + 'px';
      tip.style.top = e.clientY - r.top - 34 + 'px';
    });
    p.addEventListener('mouseleave', () => {
      tip.hidden = true;
    });
  });
}

function renderTable(): void {
  const tbl = root?.querySelector<HTMLElement>('#banktbl');
  const box = root?.querySelector<HTMLElement>('#bk-tablebox');
  if (!tbl || !box) return;
  const B = banks();
  box.hidden = !B.length;
  if (!B.length) return;
  const st = [...B].sort((a, b) => {
    const x = yieldPerPb(a);
    const y = yieldPerPb(b);
    if (x == null && y == null) return a.symbol.localeCompare(b.symbol, 'tr');
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x;
  });
  tbl.innerHTML =
    `<thead><tr><th class="nosort" scope="col">Banka</th><th class="nosort" scope="col">F/K<small>P/E</small></th><th class="nosort" scope="col">PD/DD<small>P/B</small></th><th class="nosort" scope="col">ÖK kârl.≈<small>ROE</small></th><th class="nosort" scope="col">Getiri / PD/DD<small>ROE ÷ P/B</small></th><th class="nosort" scope="col">Takipteki kredi %<small>NPL</small></th><th class="nosort" scope="col">Sermaye yeterliliği %<small>CAR</small></th><th class="nosort" scope="col">Net faiz marjı %<small>NIM</small></th><th class="nosort" scope="col">Net kâr büy.<small>Net income growth</small></th></tr></thead><tbody>` +
    st
      .map(
        (b) =>
          `<tr><td class="name"><b>${esc(b.symbol)}</b><span>${esc(b.name)}</span></td><td>${nf(b.pe)}</td><td class="${
            b.pb != null && b.pb < 1 ? 'v-good' : ''
          }">${nf(b.pb)}</td><td>${b.roe == null ? '–' : '%' + nf(b.roe, 1)}</td><td>${nf(yieldPerPb(b), 1)}</td><td>${nf(
            b.npl,
            2,
          )}</td><td>${nf(b.car, 1)}</td><td>${nf(b.nim, 2)}</td><td>${esc(b.netIncomeGrowth == null ? b.netIncomeGrowthNote || '–' : pct(b.netIncomeGrowth))}</td></tr>`,
      )
      .join('') +
    `</tbody>`;
}

function render(): void {
  renderChart();
  renderTable();
}

export function mount(el: HTMLElement): void {
  root = el;
  el.innerHTML = shellHtml();
  on('data', render);
  render();
}

/** When the tab becomes visible or the width changes, the chart is redrawn at the new width. */
export function refresh(): void {
  renderChart();
}
