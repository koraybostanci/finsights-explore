/**
 * Stories tab: the Ayşe coffee shop stories.
 * Stories 1-7 were carried over unchanged from the first version (BIST 30 Multiples Guide);
 * 8 (moving average) and 9 (two markets) are new. The calculations live in model.ts.
 *
 * mount: when the tab is first built; refresh: when the tab becomes visible and when
 * the width changes (the charts are redrawn).
 */

import { cw, svgText, svgWrap, tw } from '@fintools/shared/dom';
import { esc, nf, pct, tl } from '@fintools/shared/format';
import { siteLink } from '@fintools/shared/sites';
import { termText } from '@fintools/shared/terms';
import { byId, flowChart, fmtThousands, fmtThousands1, tileK } from './charts.ts';
import {
  ICE_CREAM_MONTHLY,
  CAFE,
  PEG_C,
  PEG_PE,
  iceCreamState,
  inflationState,
  evOf,
  priceState,
  peText,
  pegOf,
  pegText,
  fundState,
} from './model.ts';
import type { PriceState } from './model.ts';
import * as smaStory from './story-sma.ts';
import * as marketsStory from './story-markets.ts';

/** Date of the figures in the "BIST 30'da" notes */
const CALLOUT_DATE = '2 Ekim 2026';

/** Real-company example: the figures are dated and do not change when the data is updated. */
const bist = (text: string): string => `<span class="muted">BIST 30'da (${CALLOUT_DATE}): ${text}</span>`;

let root: HTMLElement | null = null;

const el = <T extends HTMLElement = HTMLElement>(id: string): T => byId<T>(root as HTMLElement, id);
const num = (id: string): number => Number(el<HTMLInputElement>(id).value);

export function markup(): string {
  return `
    <div class="stack read">
      <h2>Bir kahveciyi satın almak</h2>
      <p>Borsadaki her hisse, bir şirketin küçük bir parçasıdır. Dev şirketlerin rakamları gözü korkutur, ama mantık mahalledeki bir kahvecininkiyle aynıdır. Aşağıdaki dokuz hikâye her kavramı tek tek tanıtır; ilk yedisinin sonunda BIST 30'da aynı durumun nerede görüldüğü yazıyor (${CALLOUT_DATE} verisiyle). Son iki hikâye hareketli ortalamayı (moving average) ve BIST ile ABD hisselerinin neden ayrı tablolarda durduğunu anlatır.</p>
    </div>
    <div class="howto">
      <div><b>Senaryolar</b>Kavramları hikâyeyle öğrenin. Kaydırıcıları oynatın.</div>
      <div><b>Çarpanlar ve Sözlük</b>Formüller, tuzaklar ve terimlerin İngilizce karşılıkları.</div>
      <div><b>Karar adımları</b>Bir hisseye hangi sırayla bakılır.</div>
      <div><b>Kendini sına</b>Öğrendiklerinizi kavram sorularıyla sınayın.</div>
      <div><b>${siteLink('screener', 'Tarayıcı uygulaması (screener app)')}</b>Aynı mantığı gerçek hisselere uygulayın. BIST ve ABD ayrı tablolarda.</div>
    </div>

    <article class="case" id="case1">
      <div class="case-head"><span class="eyebrow">Hikâye 1 · Bilanço</span><h3>Ayşe'nin Kahvesi neye sahip?</h3></div>
      <div class="story">
        <p>Ayşe bir kahveci açıyor. Kendisi ve iki ortağı 600.000 TL koyuyor, bankadan 200.000 TL kredi alıyor. Bu 800.000 TL ile kahve makinesi ve dekorasyona 600.000 TL harcıyor, 50.000 TL'lik çekirdek ve süt stoğu alıyor, 150.000 TL kasada kalıyor.</p>
        <p>Şirketin sermayesi 100.000 paya (lot) bölünmüş. Sağdaki iki çubuk aynı 800.000 TL'nin iki yüzü: üstteki paranın nereye gittiğini, alttaki nereden geldiğini gösteriyor.</p>
      </div>
      <div class="viz"><div id="v-balance"></div><div class="legend" id="l-balance"></div></div>
      <div class="tiles">
        <div><div class="k">Özkaynak<span class="en">Shareholders' equity</span></div><div class="v">600.000 TL</div><div class="d">Varlıklar − borçlar</div></div>
        <div><div class="k">Pay sayısı<span class="en">Shares outstanding</span></div><div class="v">100.000</div><div class="d">Ödenmiş sermaye 100.000 TL</div></div>
        <div><div class="k">Pay başına defter değeri<span class="en">Book value per share</span></div><div class="v">6,00 TL</div><div class="d">600.000 ÷ 100.000</div></div>
        <div><div class="k">Net borç<span class="en">Net debt</span></div><div class="v">50.000 TL</div><div class="d">200.000 kredi − 150.000 nakit</div></div>
      </div>
      <div class="learn"><b>Ne öğrendik?</b>
        <span>Bilanço (balance sheet) iki taraftan oluşur ve iki taraf hep eşittir: <b>varlıklar = borçlar + özkaynak</b>. Özkaynak (shareholders' equity), şirket bugün kapansa borçlar ödendikten sonra ortaklara kalan paradır; buna defter değeri (book value) da denir. Ayşe'nin Kahvesi'nin defter değeri 600.000 TL, pay başına 6 TL.</span>
        ${bist("THYAO'nun özkaynağı 1 trilyon TL'yi aşıyor ama piyasa değeri (market cap) bunun yarısından az. PD/DD (P/B) 0,40 bundan çıkıyor.")}
      </div>
    </article>

    <article class="case" id="case2">
      <div class="case-head"><span class="eyebrow">Hikâye 2 · Gelir tablosu</span><h3>Bir yılda ne kazandı?</h3></div>
      <div class="story">
        <p>Kahveci yılda 2 milyon TL'lik kahve satıyor. Bu paranın nasıl erimeye başladığını yukarıdan aşağı izleyin: önce kahvenin maliyeti, sonra kira ve maaşlar, sonra makinenin yıpranması, faiz ve vergi. En altta kalan net kârdır (net income). Bu döküme gelir tablosu (income statement) denir.</p>
        <p>Mavi çubuklar ara toplamlar, kırmızılar giderler. Her kırmızı çubuk bir önceki toplamdan düşülür.</p>
      </div>
      <div class="viz"><div id="v-income"></div><div class="legend"><span><i style="background:var(--c3)"></i>Ara toplam</span><span><i style="background:var(--c1)"></i>FAVÖK ve net kâr</span><span><i style="background:var(--bad);opacity:.55"></i>Gider</span></div></div>
      <div class="learn"><b>Ne öğrendik?</b>
        <span><b>FAVÖK (EBITDA)</b> işin kendisinin ne kazandırdığını gösterir; faiz, vergi ve amortisman (depreciation) gibi finansman ve muhasebe kalemlerinden önce durur. <b>Net kâr (net income)</b> ortaklara kalan paradır. Net kâr pay sayısına bölünürse <b>hisse başına kâr (EPS)</b> çıkar: 210.000 ÷ 100.000 = 2,10 TL.</span>
        ${bist("TCELL'in 2026/6 döneminde FAVÖK'ü 61 milyar TL, net kârı ise 10 milyar TL. Aradaki farkı amortisman ve finansman giderleri açıklıyor.")}
      </div>
    </article>

    <article class="case" id="case3">
      <div class="case-head"><span class="eyebrow">Hikâye 3 · Piyasa değeri ve çarpanlar</span><h3>Pay başına kaç TL verirdiniz?</h3></div>
      <div class="story">
        <p>Bir yatırımcı Ayşe'nin Kahvesi'nin paylarını almak istiyor. Fiyatı kaydırıcıyla siz belirleyin. Fiyat değiştikçe şirketin piyasa değeri (market cap) ve tüm çarpanlar (multiples) nasıl değişiyor, izleyin. Kahveci önümüzdeki yıl ikinci şubesini açacak; kâr büyümesini de kendiniz tahmin edin.</p>
        <div class="slider"><label for="s-price">Pay fiyatı <output id="o-price">30 TL</output></label><input type="range" id="s-price" min="6" max="60" step="1" value="30"></div>
        <div class="slider"><label for="s-growth"><span>Beklenen net kâr büyümesi <span class="en">(net income growth)</span></span> <output id="o-growth">+%25</output></label><input type="range" id="s-growth" min="-20" max="80" step="5" value="25"></div>
        <div id="v-price"></div>
      </div>
      <div class="viz"><div class="tiles" id="tiles-price"></div></div>
      <div class="learn"><b>Ne öğrendik?</b>
        <span>Kâr ve özkaynak değişmeden, sadece fiyat değişince bütün çarpanlar değişir. Çarpanlar şirketi değil, <b>fiyatı</b> ölçer. Pay başına 6 TL'de PD/DD tam 1 olur, yani defter değerine alırsınız. Ama bu kahveci özkaynağına %35 getiri sağlıyor; bu kadar kârlı bir işi defter değerine satan olmaz.</span>
        ${bist("BIMAS'ın PD/DD'si 2,46 ama özkaynak kârlılığı yüksek ve istikrarlı olduğu için piyasa bu primi ödüyor.")}
      </div>
    </article>

    <article class="case" id="case4">
      <div class="case-head"><span class="eyebrow">Hikâye 4 · Büyüme ve PEG</span><h3>Aynı fiyat, üç farklı kahveci</h3></div>
      <div class="story">
        <p>Şehirde üç kahveci satılık. Üçünün de bu yılki net kârı 210.000 TL, üçü de 3 milyon TL'ye satılıyor. Yani üçünün F/K'sı (P/E) da 14,3. Ama hikâyeleri çok farklı:</p>
        <ul class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;max-width:68ch">
          <li><b>Köşe Kahvecisi:</b> yıllardır aynı müşteriler, kâr her yıl %5 artıyor. Borcu yok.</li>
          <li><b>Zincir Kahve:</b> üç yeni şube açtı, kâr %35 büyüyor. Şubeler için 1,5 milyon TL kredi kullandı.</li>
          <li><b>Film Seti Kahvesi:</b> geçen yıl 70.000 TL kazanmıştı. Bu yıl dükkân üç ay bir dizi çekimine kiralandı, kâr 210.000 TL'ye fırladı. Kahve satışları aynı.</li>
        </ul>
      </div>
      <div class="viz"><div id="v-peg"></div><div id="t-peg"></div></div>
      <div class="learn"><b>Ne öğrendik?</b>
        <span><b>PEG = F/K ÷ büyüme</b>. Aynı F/K'ya ödenen fiyat, büyüyen şirkette daha makuldür: Zincir Kahve 0,41 ile en cazip görünüyor. Ama borcu da en yüksek; firma değeri (EV) borcu ekleyince 4,5 milyon TL'ye çıkıyor. Film Seti Kahvesi'nin PEG'i 0,07 ile "süper ucuz" görünüyor, oysa büyümenin tamamı tek seferlik kira gelirinden geliyor. Gelecek yıl kâr eski seviyesine dönecek.</span>
        ${bist("TOASO (PEG 0,02) ve TUPRS (0,07) Film Seti Kahvesi'ne benziyor; GUBRF (0,57) ise büyümesi faaliyetten gelen bir Zincir Kahve örneği.")}
      </div>
    </article>

    <article class="case" id="case5">
      <div class="case-head"><span class="eyebrow">Hikâye 5 · Enflasyon muhasebesi</span><h3>Kahve satmadan gelen kâr</h3></div>
      <div class="story">
        <p>Ayşe'nin bankaya 200.000 TL borcu var ve bu tutar sabit. Fiyatlar yılda %35 artıyorsa, bir yıl sonra o 200.000 TL'nin alım gücü epey azalır; borç reel olarak erir. Türkiye'de 2024'ten beri uygulanan enflasyon muhasebesi (inflation accounting, TMS 29 / IAS 29) bu erimeyi kâr olarak yazar: <b>net parasal pozisyon kazancı</b> (net monetary position gain).</p>
        <div class="slider"><label for="s-inf">Yıllık enflasyon <output id="o-inf">%35</output></label><input type="range" id="s-inf" min="0" max="70" step="5" value="35"></div>
      </div>
      <div class="viz"><div id="v-inflation"></div><div class="legend"><span><i style="background:var(--c1)"></i>Kahve satışından gelen kâr</span><span><i style="background:var(--c2)"></i>Parasal kazanç (borcun reel erimesi)</span></div></div>
      <div class="tiles" id="tiles-inflation"></div>
      <div class="learn"><b>Ne öğrendik?</b>
        <span>Ayşe tek fincan fazla kahve satmadan net kârı büyüyor. Net kâr sıçradığında ilk soru şu olmalı: <b>FAVÖK (EBITDA) de büyüdü mü?</b> Büyümediyse artış muhtemelen parasal kazanç ya da tek seferlik bir kalemden geliyor. Hesap burada basitleştirildi; gerçek uygulamada tüm kalemler enflasyona göre yeniden ifade edilir.</span>
        ${bist("MGROS'un esas faaliyeti zararda ama net kârı pozitif; TTKOM'un net kâr artışında parasal kazanç (+%135) belirleyici.")}
      </div>
    </article>

    <article class="case" id="case6">
      <div class="case-head"><span class="eyebrow">Hikâye 6 · Döngüsellik</span><h3>Sahil dondurmacısı</h3></div>
      <div class="story">
        <p>Ayşe'nin kuzeni Mert, sahilde bir dondurmacı işletiyor. Kışın zarar ediyor, yazın çok kazanıyor. Yıllık net kârı 535.000 TL ve dükkânı 5 milyon TL'ye satılık.</p>
        <p>Biri sadece yaz aylarına bakıp "çeyrekte 430.000 kazanıyor, yılda 1,7 milyon eder" derse ne olur?</p>
      </div>
      <div class="viz"><div id="v-icecream"></div></div>
      <div class="tiles" id="tiles-icecream"></div>
      <div class="learn"><b>Ne öğrendik?</b>
        <span>Döngüsel (cyclical) işlerde kârın zirvede olduğu dönem, F/K'yı ve PEG'i yapay olarak düşük gösterir. Bu "değer tuzağı"nın (value trap) en bilinen hâlidir. Döngü burada mevsim; borsada ise emtia (commodity) fiyatları, rafineri marjları ya da çelik talebi gibi yıllara yayılan döngülerdir.</span>
        ${bist('TUPRS (rafineri marjı), EREGL ve KRDMD (çelik), TRALT (altın fiyatı), THYAO ve PGSUS (turizm sezonu, yakıt fiyatı).')}
      </div>
    </article>

    <article class="case" id="case7">
      <div class="case-head"><span class="eyebrow">Hikâye 7 · Banka mantığı</span><h3>Mahalle sandığı</h3></div>
      <div class="story">
        <p>Mahallede bir sandık kuruluyor. Kurucular 100.000 TL koyuyor (özkaynak, equity). Komşulardan 1 milyon TL mevduat (deposits) topluyor ve onlara %35 faiz ödüyor. Bu paranın 950.000 TL'sini esnafa %45 faizle kredi (loans) olarak veriyor.</p>
        <p>Yani sandık, kendi parasının 11 katı büyüklüğünde bir bilançoyu yönetiyor. Peki kredilerin bir kısmı geri dönmezse?</p>
        <div class="slider"><label for="s-npl">Geri ödenmeyen kredi oranı <output id="o-npl">%2,0</output></label><input type="range" id="s-npl" min="0" max="10" step="0.5" value="2"></div>
      </div>
      <div class="viz"><div id="v-fund"></div></div>
      <div class="tiles" id="tiles-fund"></div>
      <div class="learn"><b>Ne öğrendik?</b>
        <span>Banka borçla çalışır; borç onun hammaddesidir. Bu yüzden bankalarda FAVÖK ve net borç anlamsızdır. Önemli olan özkaynak kârlılığı (ROE) ve bunu bozan takipteki kredilerdir (NPL). Kaldıraç 11 kat olduğu için batık kredideki küçük bir artış kârı tamamen silebilir. Sermaye yeterlilik oranı (CAR) bu yüzden izlenir. Bankada pratik bir kural var: <b>PD/DD ≈ ÖK kârlılığı × F/K</b>.</span>
        ${bist('GARAN %24,5 ÖK kârlılığı ve 1,08 PD/DD; ISCTR %13,3 kârlılık ve 0,61 PD/DD. Piyasa getirisi düşük bankayı daha ucuz fiyatlıyor.')}
      </div>
    </article>
    ${smaStory.html()}
    ${marketsStory.html()}`;
}

/* ---------- Story 1: balance sheet, horizontal stacked bars ---------- */

type Part = [string, number, string];

function renderBalanceSheet(): void {
  const host = el('v-balance');
  const W = cw(host);
  if (!W) return;
  const rows: Array<{ lbl: string; en: string; parts: Part[] }> = [
    {
      lbl: 'Varlıklar',
      en: 'Assets',
      parts: [
        ['Makine ve dekorasyon', 600000, 'var(--c1)'],
        ['Stok', 50000, 'var(--c2)'],
        ['Nakit', 150000, 'var(--c3)'],
      ],
    },
    {
      lbl: 'Borç + özkaynak',
      en: 'Liabilities + equity',
      parts: [
        ['Banka kredisi', 200000, 'var(--c4)'],
        ['Özkaynak', 600000, 'var(--c1)'],
      ],
    },
  ];
  const narrow = W < 520;
  const x0 = narrow ? 0 : 150;
  const x1 = W;
  const sc = (v: number): number => (v / 800000) * (x1 - x0);
  const bh = 46;
  let g = '';
  let y = 0;
  rows.forEach((r) => {
    if (narrow) {
      g +=
        svgText(0, y + 13, r.lbl, { fw: 700, fs: 13 }) +
        svgText(tw(r.lbl, 13, false, true) + 10, y + 13, r.en, { fill: 'var(--muted)', fs: 10.5 });
      y += 20;
    } else {
      g += svgText(0, y + 21, r.lbl, { fw: 700, fs: 13.5 }) + svgText(0, y + 37, r.en, { fill: 'var(--muted)', fs: 11 });
    }
    let x = x0;
    r.parts.forEach((p) => {
      const w = sc(p[1]);
      const amt = tl(p[1]);
      g += `<rect x="${x + 1}" y="${y}" width="${Math.max(w - 2, 1)}" height="${bh}" rx="4" fill="${p[2]}"><title>${esc(p[0])}: ${amt}</title></rect>`;
      const need = Math.max(tw(p[0], 12), tw(amt, 11, true)) + 16;
      if (w > need) {
        g +=
          svgText(x + 8, y + 20, p[0], { fill: '#fff', fw: 700, fs: 12 }) +
          svgText(x + 8, y + 36, amt, { fill: '#fff', ff: 'var(--mono)', fs: 11 });
      }
      x += w;
    });
    y += bh + (narrow ? 18 : 26);
  });
  host.innerHTML = svgWrap(
    W,
    y - (narrow ? 18 : 26),
    "Ayşe'nin Kahvesi bilançosu: varlıklar 800 bin TL; kaynaklar 200 bin kredi ve 600 bin özkaynak",
    g,
  );
  el('l-balance').innerHTML =
    rows
      .flatMap((r) => r.parts)
      .map((p) => `<span><i style="background:${p[2]}"></i>${esc(p[0])} <b class="mono">${tl(p[1])}</b></span>`)
      .join('') + `<span>Her iki taraf: <b class="mono">800.000 TL</b></span>`;
}

/* ---------- Story 2: income waterfall ---------- */

function renderIncome(): void {
  flowChart(
    el('v-income'),
    [
      { lbl: 'Hasılat', en: 'Revenue', v: 2000000, t: 'total' },
      { lbl: 'Satışların maliyeti', en: 'COGS', v: -700000, t: 'minus' },
      { lbl: 'Brüt kâr', en: 'Gross profit', v: 1300000, t: 'total' },
      { lbl: 'Kira, maaş, fatura', en: 'Operating expenses', v: -900000, t: 'minus' },
      { lbl: 'FAVÖK', en: 'EBITDA', v: 400000, t: 'key' },
      { lbl: 'Amortisman', en: 'Depreciation', v: -60000, t: 'minus' },
      { lbl: 'Esas faaliyet kârı', en: 'Operating profit (EBIT)', v: 340000, t: 'total' },
      { lbl: 'Faiz gideri', en: 'Interest expense', v: -60000, t: 'minus' },
      { lbl: 'Vergi (%25)', en: 'Tax', v: -70000, t: 'minus' },
      { lbl: 'Net kâr', en: 'Net income', v: 210000, t: 'key' },
    ],
    { lo: 0, hi: 2000000, fmt: fmtThousands, aria: "Ayşe'nin Kahvesi gelir tablosu: 2 milyon hasılattan 210 bin net kâra" },
  );
}

/* ---------- Story 3: price slider ---------- */

const readPrice = (): PriceState => priceState(num('s-price'), num('s-growth'));

function renderPrice(): void {
  const { p, gr, marketCap, pe, pb, ev, evEbitda, peg, roe, ey, eps } = readPrice();
  el('o-price').textContent = p + ' TL';
  el('o-growth').textContent = (gr > 0 ? '+' : '') + '%' + gr;
  const pbText =
    pb < 0.995 ? 'Defter değerinin altında.' : pb < 1.05 ? 'Tam defter değerinde.' : 'Defter değerinin ' + nf(pb, 1) + ' katı.';
  el('tiles-price').innerHTML = `
   <div>${tileK('Piyasa değeri', 'Market cap')}<div class="v">${nf(marketCap / 1e6, 2)} mn TL</div><div class="d">${p} TL × ${nf(CAFE.shares, 0)} pay</div></div>
   <div>${tileK('F/K', 'P/E')}<div class="v">${nf(pe, 1)}</div><div class="d">${peText(pe)}</div></div>
   <div>${tileK('PD/DD', 'P/B')}<div class="v">${nf(pb, 2)}</div><div class="d">${pbText}</div></div>
   <div>${tileK('FD/FAVÖK', 'EV/EBITDA')}<div class="v">${nf(evEbitda, 1)}</div><div class="d">Firma değeri ${nf(ev / 1e6, 2)} mn TL, borç dahil.</div></div>
   <div>${tileK('PEG', 'PEG ratio')}<div class="v">${nf(peg, 2)}</div><div class="d">${pegText(peg)}</div></div>
   <div>${tileK('Kazanç verimi', 'Earnings yield')}<div class="v">%${nf(ey, 1)}</div><div class="d">1 ÷ F/K. Mevduat faiziyle kıyaslayın.</div></div>
   <div>${tileK('ÖK kârlılığı', 'ROE')}<div class="v">%${nf(roe, 0)}</div><div class="d">Fiyattan bağımsız: işin kendi verimi.</div></div>
   <div>${tileK('Hisse başına kâr', 'EPS')}<div class="v">${nf(eps, 2)} TL</div><div class="d">Fiyattan bağımsız.</div></div>`;
  renderGauge();
}

function renderGauge(): void {
  const host = el('v-price');
  const W = cw(host);
  if (!W) return;
  const { pe } = readPrice();
  const x0 = 8;
  const x1 = W - 8;
  const mx = 60;
  const X = (v: number): number => x0 + (Math.min(v, mx) / mx) * (x1 - x0);
  let g = svgText(x0, 12, `${termText('pe')} ölçeği`, { fs: 11.5, fill: 'var(--muted)', fw: 600 });
  g += `<rect x="${x0}" y="22" width="${X(8) - x0}" height="10" fill="var(--good)" opacity=".35" rx="3"/><rect x="${X(8)}" y="22" width="${
    X(15) - X(8)
  }" height="10" fill="var(--warn)" opacity=".35"/><rect x="${X(15)}" y="22" width="${x1 - X(15)}" height="10" fill="var(--bad)" opacity=".3" rx="3"/>`;
  [0, 8, 15, 30, 45, 60].forEach((v) => {
    g += svgText(X(v), 50, String(v), {
      a: v === 0 ? 'start' : v === 60 ? 'end' : 'middle',
      fs: 11,
      ff: 'var(--mono)',
      fill: 'var(--muted)',
    });
  });
  g += `<circle cx="${X(pe)}" cy="27" r="8" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
  host.innerHTML = svgWrap(W, 56, 'F/K ölçeği üzerinde mevcut konum', g);
}

/* ---------- Story 4: PEG comparison ---------- */

function renderPeg(): void {
  const host = el('v-peg');
  const W = cw(host);
  if (!W) return;
  const pe = PEG_PE;
  const narrow = W < 560;
  const labW = narrow ? 0 : Math.min(200, Math.round(W * 0.3));
  const top = 22;
  const rh = narrow ? 58 : 50;
  const x0 = labW;
  const x1 = W - 84;
  const mx = 3;
  const X = (v: number): number => x0 + (Math.min(v, mx) / mx) * (x1 - x0);
  const plotH = PEG_C.length * rh;
  let g = '';
  const band = (i: number): [number, number] =>
    narrow ? [top + i * rh + 18, top + i * rh + 48] : [top + i * rh + 4, top + i * rh + 38];
  [0, 1, 2, 3].forEach((v) => {
    PEG_C.forEach((_c, i) => {
      const [a, b] = band(i);
      g += `<line x1="${X(v)}" x2="${X(v)}" y1="${a}" y2="${b}" stroke="${v === 1 ? 'var(--muted)' : 'var(--line)'}" stroke-width="${
        v === 1 ? 1.5 : 1
      }" ${v === 1 ? 'stroke-dasharray="4 4"' : ''}/>`;
    });
    g += svgText(X(v), top + plotH + 16, nf(v, 0), {
      a: v === 0 && x0 < 6 ? 'start' : 'middle',
      fs: 11,
      ff: 'var(--mono)',
      fill: 'var(--muted)',
    });
  });
  g += svgText(X(1), narrow ? top - 8 : top - 6, 'PEG = 1', { fs: 11, fill: 'var(--muted)', a: 'middle', fw: 600 });
  PEG_C.forEach((c, i) => {
    const y = top + i * rh;
    const peg = pegOf(c);
    const col = c.st === 'good' ? 'var(--good)' : c.st === 'warn' ? 'var(--warn)' : 'var(--bad)';
    let by: number;
    if (narrow) {
      g +=
        svgText(0, y + 12, c.n, { fw: 700, fs: 12.5 }) +
        svgText(tw(c.n, 12.5, false, true) + 10, y + 12, '%' + c.g + ' · ' + c.t, { fill: 'var(--muted)', fs: 10.5 });
      by = y + 22;
    } else {
      g +=
        svgText(0, y + 18, c.n, { fw: 700, fs: 13 }) +
        svgText(0, y + 33, 'büyüme %' + c.g + ' · ' + c.t, { fill: 'var(--muted)', fs: 10.5 });
      by = y + 10;
    }
    const bw = Math.max(X(peg) - x0, 3);
    g += `<rect x="${x0}" y="${by}" width="${bw}" height="22" rx="4" fill="${col}"><title>${esc(c.n)}: PEG ${nf(peg, 2)}</title></rect>`;
    g += svgText(x0 + bw + 6, by + 15, nf(peg, 2), { ff: 'var(--mono)', fs: 12, fw: 700 });
  });
  host.innerHTML = svgWrap(W, top + plotH + 22, 'Üç kahvecinin PEG oranları', g);
  el('t-peg').innerHTML = `<div class="tablebox"><table><thead><tr><th class="nosort">Kahveci</th><th class="nosort">F/K</th><th class="nosort">Büyüme</th><th class="nosort">PEG</th><th class="nosort">Net borç</th><th class="nosort">Firma değeri<small>EV</small></th></tr></thead><tbody>${PEG_C.map(
    (c) =>
      `<tr><td class="name"><b style="font-family:var(--ui)">${esc(c.n)}</b></td><td>${nf(pe, 1)}</td><td>%${c.g}</td><td>${nf(
        pegOf(c),
        2,
      )}</td><td>${nf(c.netDebt / 1e6, 1)} mn</td><td>${nf(evOf(c) / 1e6, 1)} mn</td></tr>`,
  ).join('')}</tbody></table></div>`;
}

/* ---------- Story 5: inflation ---------- */

function renderInflation(): void {
  const { inf, op, gain, real } = inflationState(num('s-inf'));
  el('o-inf').textContent = '%' + inf;
  el('tiles-inflation').innerHTML = `
    <div>${tileK('Parasal kazanç', 'Monetary gain')}<div class="v">${nf(gain / 1000, 0)} bin TL</div><div class="d">200.000 TL borç × %${inf}</div></div>
    <div>${tileK('Net kâr artışı gibi görünen', 'Apparent growth')}<div class="v">${pct((gain / op) * 100)}</div><div class="d">Satışlar aynı kaldığı hâlde</div></div>
    <div>${tileK('Borcun alım gücü', 'Real value of debt')}<div class="v">${nf(real / 1000, 0)} bin TL</div><div class="d">Yıl başı parasıyla</div></div>`;
  renderInflationChart();
}

function renderInflationChart(): void {
  const host = el('v-inflation');
  const W = cw(host);
  if (!W) return;
  const { op, gain } = inflationState(num('s-inf'));
  const narrow = W < 560;
  const labW = narrow ? 0 : Math.min(200, Math.round(W * 0.32));
  const x0 = labW;
  const x1 = W - 84;
  const mx = 380000;
  const X = (v: number): number => x0 + (v / mx) * (x1 - x0);
  const rows: Array<[string, string, Array<[number, string]>]> = [
    ['Faaliyetten gelen kâr', 'Operating result', [[op, 'var(--c1)']]],
    [
      'Raporlanan net kâr',
      'Reported net income',
      [
        [op, 'var(--c1)'],
        [gain, 'var(--c2)'],
      ],
    ],
  ];
  const rh = narrow ? 52 : 48;
  let g = '';
  rows.forEach((r, i) => {
    const y = i * rh;
    let by: number;
    if (narrow) {
      g +=
        svgText(0, y + 13, r[0], { fw: 700, fs: 12.5 }) +
        svgText(tw(r[0], 12.5, false, true) + 10, y + 13, r[1], { fs: 10.5, fill: 'var(--muted)' });
      by = y + 20;
    } else {
      g += svgText(0, y + 16, r[0], { fw: 700, fs: 13 }) + svgText(0, y + 31, r[1], { fs: 10.5, fill: 'var(--muted)' });
      by = y + 6;
    }
    let x = x0;
    let tot = 0;
    r[2].forEach(([v, c]) => {
      if (v <= 0) return;
      const w = X(v) - x0;
      g += `<rect x="${x}" y="${by}" width="${Math.max(w - 1, 1)}" height="26" rx="4" fill="${c}"/>`;
      x += w;
      tot += v;
    });
    g += svgText(x + 6, by + 17, nf(tot / 1000, 0) + ' bin', { ff: 'var(--mono)', fs: 12, fw: i ? 700 : 400 });
  });
  host.innerHTML = svgWrap(W, rows.length * rh, 'Faaliyet kârı ve parasal kazanç dahil raporlanan net kâr', g);
}

/* ---------- Story 6: ice cream shop ---------- */

function renderIceCream(): void {
  const { yr, summer, price, pe, peakYr, peakPe } = iceCreamState();
  el('tiles-icecream').innerHTML = `
   <div>${tileK('Gerçek yıllık kâr', 'Full-year net income')}<div class="v">${yr} bin TL</div><div class="d">12 ayın toplamı</div></div>
   <div>${tileK('Gerçek F/K', 'True P/E')}<div class="v">${nf(pe, 1)}</div><div class="d">${nf(price / 1000, 0)} mn TL ÷ ${yr} bin</div></div>
   <div>${tileK('Yazı yıla yayınca kâr', 'Annualized peak')}<div class="v">${nf(peakYr, 0)} bin TL</div><div class="d">Yaz çeyreği ${summer} bin × 4</div></div>
   <div>${tileK('Yanıltıcı F/K', 'Peak-earnings P/E')}<div class="v">${nf(peakPe, 1)}</div><div class="d">Üç kat ucuz görünüyor</div></div>`;
  const host = el('v-icecream');
  const W = cw(host);
  if (!W) return;
  const M = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const H = Math.round(Math.min(280, Math.max(200, W * 0.45)));
  const m = { l: 38, r: 4, t: 26, b: 24 };
  const y0 = -40;
  const y1 = 160;
  const bw = (W - m.l - m.r) / 12;
  const Y = (v: number): number => m.t + ((y1 - v) / (y1 - y0)) * (H - m.t - m.b);
  let g =
    `<rect x="${m.l + 5 * bw}" y="${m.t - 18}" width="${3 * bw}" height="${H - m.t - m.b + 18}" fill="var(--warn-soft)"/>` +
    svgText(m.l + 6.5 * bw, m.t - 5, 'Yaz çeyreği', { a: 'middle', fs: 11.5, fill: 'var(--warn)', fw: 700 });
  [-40, 0, 40, 80, 120, 160].forEach((v) => {
    g +=
      `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? 'var(--muted)' : 'var(--line)'}" stroke-width="1"/>` +
      svgText(m.l - 6, Y(v) + 4, String(v), { a: 'end', fs: 10.5, ff: 'var(--mono)', fill: 'var(--muted)' });
  });
  ICE_CREAM_MONTHLY.forEach((v, i) => {
    const x = m.l + i * bw + bw * 0.2;
    const w = bw * 0.6;
    const top = v >= 0 ? Y(v) : Y(0);
    const h = Math.max(Math.abs(Y(v) - Y(0)), 2);
    g += `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="3" fill="${v < 0 ? 'var(--bad)' : 'var(--c1)'}"><title>${M[i]}: ${v} bin TL</title></rect>`;
    g += svgText(x + w / 2, H - 6, M[i], { a: 'middle', fs: W < 420 ? 9.5 : 11, fill: 'var(--muted)' });
  });
  g += svgText(0, m.t - 5, 'bin TL', { fs: 10.5, fill: 'var(--muted)' });
  host.innerHTML = svgWrap(W, H, 'Dondurmacının aylık net kârı: yazın yüksek, kışın zarar', g);
}

/* ---------- Story 7: neighborhood fund ---------- */

function renderFund(): void {
  const st = fundState(num('s-npl'));
  el('o-npl').textContent = '%' + nf(st.npl, 1);
  const salePrice = 150000;
  el('tiles-fund').innerHTML = `
   <div>${tileK('ÖK kârlılığı', 'ROE')}<div class="v ${st.roe < 0 ? 'v-bad' : st.roe < 10 ? 'v-warn' : 'v-good'}">%${nf(st.roe, 1)}</div><div class="d">Net kâr ÷ 100.000 TL özkaynak</div></div>
   <div>${tileK('Kaldıraç', 'Leverage')}<div class="v">11 kat</div><div class="d">1,1 mn TL varlık ÷ 100 bin özkaynak</div></div>
   <div>${tileK('Sermaye yeterliliği (kaba)', 'Capital adequacy')}<div class="v">%${nf((st.E / st.L) * 100, 1)}</div><div class="d">Özkaynak ÷ krediler</div></div>
   <div>${tileK("150 bin TL'ye satılırsa", 'If sold for 150k TL')}<div class="v">PD/DD 1,50</div><div class="d">${
     st.net > 0
       ? 'F/K ' + nf(salePrice / st.net, 1) + ' · ÖK kârl. × F/K ≈ ' + nf(((st.roe / 100) * salePrice) / st.net, 2)
       : 'Zararda: F/K hesaplanamaz'
   }</div></div>`;
  renderFundChart();
}

function renderFundChart(): void {
  const st = fundState(num('s-npl'));
  flowChart(
    el('v-fund'),
    [
      { lbl: 'Kredi faiz geliri', en: 'Interest income', v: st.interestIncome, t: 'total' },
      { lbl: 'Mevduat faiz gideri', en: 'Interest expense', v: -st.interestExpense, t: 'minus' },
      { lbl: 'Net faiz geliri', en: 'Net interest income', v: st.nii, t: 'total' },
      { lbl: 'Personel, kira', en: 'Operating expenses', v: -st.opex, t: 'minus' },
      { lbl: 'Batık kredi karşılığı', en: 'Loan loss provisions', v: -st.prov, t: 'minus' },
      { lbl: 'Vergi', en: 'Tax', v: -st.tax, t: 'minus' },
      { lbl: 'Net kâr', en: 'Net income', v: st.net, t: 'key' },
    ],
    { lo: -60000, hi: 430000, fmt: fmtThousands1, aria: 'Mahalle sandığının gelir tablosu' },
  );
}

/* ---------- Setup ---------- */

export function mount(r: HTMLElement): void {
  root = r;
  r.innerHTML = markup();
  ['s-price', 's-growth'].forEach((id) => el(id).addEventListener('input', renderPrice));
  el('s-inf').addEventListener('input', renderInflation);
  el('s-npl').addEventListener('input', renderFund);
  renderPrice();
  renderInflation();
  renderIceCream();
  renderFund();
  smaStory.bind(r);
  marketsStory.bind(r);
}

export function refresh(): void {
  if (!root) return;
  renderBalanceSheet();
  renderIncome();
  renderGauge();
  renderPeg();
  renderInflationChart();
  renderIceCream();
  renderFundChart();
  smaStory.draw();
  marketsStory.draw();
}
