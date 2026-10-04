/**
 * Hikâye 8: "Bugün iyi bir gün müydü?" Günlük hasılat ve hareketli ortalama
 * (simple moving average, SMA). Seri kurgusaldır ve model.ts içinde tohumlu
 * olarak üretilir; her açılışta aynıdır.
 */

import { cw, svgText, svgWrap } from '@fintools/shared/dom';
import { esc, nf, pct, tl } from '@fintools/shared/format';
import { TERMS, termText } from '@fintools/shared/terms';
import { byId, linePath, tileK } from './charts.ts';
import { ROADWORK_END, ROADWORK_START, SMA_LONG, SMA_SHORT, SMA_WINDOWS, smaStory } from './model.ts';
import type { CrossMark } from './model.ts';

let root: HTMLElement | null = null;
let win = 20;
let showLong = false;

export function html(): string {
  const today = smaStory(win).today;
  return `
    <article class="case" id="case8">
      <div class="case-head"><span class="eyebrow">Hikâye 8 · Hareketli ortalama</span><h3>Bugün iyi bir gün müydü?</h3></div>
      <div class="story">
        <p>Ayşe her akşam kasayı sayıyor. Günlük hasılat bir gün yüksek, ertesi gün düşük: yağmurda müşteri azalıyor, mahalleye pazar kurulan gün ve bayramda dükkân doluyor. Bugün yağmur yağdı, kasadan ${tl(today)} çıktı. İşler iyi mi gidiyor, kötü mü? Tek bir gün bunu söylemez.</p>
        <p>Ayşe bu yüzden son N günün ortalamasını alıyor ve her akşam yeniliyor: en eski gün hesaptan çıkıyor, bugün giriyor. Buna hareketli ortalama (simple moving average, SMA) denir. Pencereyi siz seçin: kısa pencere günlük sıçramaları yakından izler, uzun pencere sakin bir çizgi verir ama geriden gelir.</p>
        <p>Grafikte son 300 gün var. ${ROADWORK_START}. günde sokakta yol çalışması başladı ve hasılat düştü; çalışma ${ROADWORK_END}. günde bitti, ardından karşıya bir iş merkezi açıldı ve dükkân toparlandı. Her pencerede ortalamanın bu dönüşü kaç gün sonra fark ettiğine bakın. Sonra ${SMA_SHORT} günü seçip ${SMA_LONG} günlük ortalamayı da açın: iki ortalamanın kesiştiği günler işaretlenir.</p>
        <div class="slider" role="group" aria-labelledby="sma-win-lbl">
          <label id="sma-win-lbl">Ortalama penceresi <output id="sma-o-win"></output></label>
          <div class="seg" id="sma-seg" style="align-self:flex-start">${SMA_WINDOWS.map(
            (w) => `<button type="button" data-win="${w}" aria-pressed="${w === win}">${w} gün</button>`,
          ).join('')}</div>
        </div>
        <div class="ctl check small"><input type="checkbox" id="sma-long"${showLong ? ' checked' : ''}><label for="sma-long">${SMA_LONG} günlük ortalamayı da göster<br><small>${SMA_SHORT} günlük ortalama onu kestiğinde kesişim işaretlenir.</small></label></div>
      </div>
      <div class="viz"><div id="sma-v-chart"></div><div class="legend" id="sma-legend"></div><p class="small muted" id="sma-note"></p></div>
      <div class="tiles" id="sma-tiles"></div>
      <div class="learn"><b>Ne öğrendik?</b>
        <span>Hareketli ortalama (SMA) günlük gürültüyü yumuşatır ama <b>her zaman geriden gelir</b>: dönüşü, olduktan sonra gösterir. Kısa pencere hızlı tepki verir ama sık sık yanıltır; uzun pencere sakindir ama geç kalır. Borsada “günlük hasılat”ın yerini hissenin günlük kapanış fiyatı (closing price) alır; en sık 20, 50 ve 200 günlük ortalamalar (SMA 20, SMA 50, SMA 200) kullanılır. 50 günlük ortalama 200 günlüğü yukarı keserse altın kesişim (golden cross), aşağı keserse ölüm kesişimi (death cross) denir.</span>
        <span>Fiyatın 200 günlük ortalamasının üstünde olması, eğilimin (trend) bir süredir yukarı olduğunu söyler; hissenin ucuz olduğunu söylemez. <b>SMA eğilimi gösterir, değeri değil.</b> Bu yüzden kârın gerçekliğinden, bilançodan ve çarpanlardan sonra gelir. Türkiye'de bir dikkat noktası daha var: fiyatlar enflasyonla birlikte yükseldiği için bir BIST hissesinin TL fiyatı 200 günlük ortalamasının üstüne kolayca çıkar. Ayşe kahveye zam yapınca hasılat da ortalamanın üstüne çıkar, ama daha çok kahve satmış olmaz. TL bazında “ortalamanın üstünde” olmak bu yüzden göründüğünden zayıf bir kanıttır.</span>
        <span class="muted">Tarayıcı, her hissenin 20, 50 ve 200 günlük ortalamalarını ve fiyatın bu ortalamalara göre yerini gösterir.</span>
      </div>
    </article>`;
}

export function bind(r: HTMLElement): void {
  root = r;
  byId(r, 'sma-seg').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-win]');
    if (!b) return;
    win = Number(b.dataset.win);
    render();
  });
  byId<HTMLInputElement>(r, 'sma-long').addEventListener('change', (e) => {
    showLong = (e.target as HTMLInputElement).checked;
    render();
  });
  render();
}

/** Kutucuklar, açıklama ve grafik. */
function render(): void {
  if (!root) return;
  const st = smaStory(win);
  byId(root, 'sma-o-win').textContent = `${win} gün`;
  byId(root, 'sma-seg')
    .querySelectorAll<HTMLButtonElement>('button[data-win]')
    .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.win) === win)));

  const below = st.dist < 0;
  byId(root, 'sma-tiles').innerHTML = `
    <div>${tileK('Bugünkü hasılat', "Today's takings")}<div class="v">${tl(st.today)}</div><div class="d">Yağmurlu bir gün.</div></div>
    <div>${tileK(`${win} günlük ortalama`, `SMA ${win}`)}<div class="v">${tl(st.avgToday)}</div><div class="d">Son ${win} günün toplamı ÷ ${win}</div></div>
    <div>${tileK('Ortalamaya uzaklık', 'Distance from average')}<div class="v">${pct(st.dist, 1)}</div><div class="d">${
      below ? `Son ${win} güne göre zayıf bir gün.` : `Son ${win} güne göre iyi bir gün.`
    }</div></div>
    <div>${tileK(TERMS.lag.tr, TERMS.lag.en)}<div class="v">≈ ${nf(Math.round(st.lag), 0)} gün</div><div class="d">Ortalama kabaca (N\u00a0−\u00a01)\u00a0÷\u00a02 gün öncesini gösterir.</div></div>`;

  const crossOn = showLong && win === SMA_SHORT;
  const longOn = showLong && win !== SMA_LONG;
  const sw = (c: string): string => `<i style="background:${c}"></i>`;
  byId(root, 'sma-legend').innerHTML =
    `<span>${sw('var(--muted)')}Günlük hasılat</span><span>${sw('var(--c1)')}${win} günlük ortalama</span>` +
    (longOn ? `<span>${sw('var(--c2)')}${SMA_LONG} günlük ortalama</span>` : '') +
    (crossOn
      ? `<span>${sw('var(--good)')}${esc(termText('goldenCross'))}</span><span>${sw('var(--bad)')}${esc(termText('deathCross'))}</span>`
      : '');

  const late = st.trough - ROADWORK_END;
  let note =
    late > 0
      ? `${win} günlük ortalama en düşük noktasını ${st.trough}. günde gördü: yol çalışması bittikten ${late} gün sonra.`
      : `${win} günlük ortalama en düşük noktasını ${st.trough}. günde gördü.`;
  if (crossOn) {
    const d = st.crosses.find((c) => c.kind === 'death');
    const g = st.crosses.find((c) => c.kind === 'golden');
    if (d) note += ` ${SMA_SHORT} günlük ortalama ${SMA_LONG} günlüğü ${d.day}. günde aşağı kesti (ölüm kesişimi).`;
    if (g)
      note += ` ${g.day}. günde yukarı kesti (altın kesişim): yol çalışması bittikten ${g.day - ROADWORK_END} gün sonra.`;
  } else if (showLong && win !== SMA_SHORT) {
    note += ` Kesişim işaretleri için ${SMA_SHORT} günü seçin.`;
  }
  byId(root, 'sma-note').textContent = note;
  draw();
}

/** SVG metni: çizgilerin üstünde okunabilsin diye zemin renginde kenarlıkla. */
const halo = (x: number, y: number, t: string, fill: string, a: 'start' | 'middle' | 'end'): string =>
  `<text x="${x}" y="${y}" font-size="11.5" font-weight="700" font-family="var(--ui)" fill="${fill}" text-anchor="${a}" stroke="var(--surface)" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke">${esc(t)}</text>`;

export function draw(): void {
  if (!root) return;
  const host = byId(root, 'sma-v-chart');
  const W = cw(host);
  if (!W) return;
  const st = smaStory(win);
  const n = st.daily.length;
  const H = Math.round(Math.min(340, Math.max(240, W * 0.5)));
  const m = { l: 34, r: 12, t: 24, b: 26 };
  const lo = Math.floor(Math.min(...st.daily) / 1000) * 1000;
  const hi = Math.ceil(Math.max(...st.daily) / 1000) * 1000;
  const X = (i: number): number => m.l + (i / (n - 1)) * (W - m.l - m.r);
  const Y = (v: number): number => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const day = (d: number): number => X(d - 1);

  let g = `<rect x="${day(ROADWORK_START)}" y="${m.t - 18}" width="${day(ROADWORK_END) - day(ROADWORK_START)}" height="${
    H - m.t - m.b + 18
  }" fill="var(--warn-soft)"/>`;
  g += svgText((day(ROADWORK_START) + day(ROADWORK_END)) / 2, m.t - 5, 'Yol çalışması', {
    a: 'middle',
    fs: 11.5,
    fill: 'var(--warn)',
    fw: 700,
  });
  for (let v = lo; v <= hi; v += 2000) {
    g +=
      `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/>` +
      svgText(m.l - 6, Y(v) + 4, nf(v / 1000, 0), { a: 'end', fs: 10.5, ff: 'var(--mono)', fill: 'var(--muted)' });
  }
  g += svgText(0, m.t - 5, 'bin TL', { fs: 10.5, fill: 'var(--muted)' });
  [1, 100, 200, 300].forEach((d) => {
    g += svgText(day(d), H - 6, d === 1 ? '1. gün' : d === n ? 'Bugün' : `${d}`, {
      a: d === 1 ? 'start' : d === n ? 'end' : 'middle',
      fs: 11,
      fill: 'var(--muted)',
    });
  });

  g += `<path d="${linePath(st.daily, X, Y)}" fill="none" stroke="var(--muted)" stroke-width="1" opacity=".55" stroke-linejoin="round"/>`;
  const longOn = showLong && win !== SMA_LONG;
  if (longOn)
    g += `<path d="${linePath(st.long, X, Y)}" fill="none" stroke="var(--c2)" stroke-width="2" stroke-dasharray="6 4" stroke-linejoin="round"/>`;
  g += `<path d="${linePath(st.avg, X, Y)}" fill="none" stroke="var(--c1)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

  if (showLong && win === SMA_SHORT) {
    st.crosses.forEach((c: CrossMark) => {
      const cx = day(c.day);
      const cy = Y(st.long[c.day - 1]);
      const col = c.kind === 'golden' ? 'var(--good)' : 'var(--bad)';
      const label = c.kind === 'golden' ? TERMS.goldenCross.tr : TERMS.deathCross.tr;
      g += `<circle cx="${cx}" cy="${cy}" r="5.5" fill="var(--surface)" stroke="${col}" stroke-width="2.5"><title>${esc(label)}: ${c.day}. gün</title></circle>`;
      g += halo(cx, c.kind === 'golden' ? cy + 22 : cy - 12, label, col, 'middle');
    });
  }

  const tx = X(n - 1);
  const ty = Y(st.today);
  g += `<circle cx="${tx}" cy="${ty}" r="4.5" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"><title>Bugün: ${esc(tl(st.today))}</title></circle>`;
  g += halo(tx - 8, ty + 18, 'Bugün', 'var(--ink)', 'end');

  host.innerHTML = svgWrap(
    W,
    H,
    `Ayşe'nin Kahvesi'nin son 300 günlük hasılatı ve ${win} günlük hareketli ortalaması`,
    g,
  );
}
