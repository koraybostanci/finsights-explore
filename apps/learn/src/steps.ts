/**
 * Decision steps: the order in which to look at a stock, the headings that widen the view, and a closing note.
 * Steps 1-5 and the "Bakışı genişletmek" (widening the view) list were carried over from the first version; step 6 (trend) is new.
 * The BIST examples in the steps use data from 2 October 2026.
 *
 * mount: when the tab is first built; refresh: when the tab becomes visible and when the width changes (nothing to do here).
 */

import { esc } from '@fintools/shared/format';

export interface Step {
  /** The question of the step */
  title: string;
  /** Explanation */
  body: string;
  /** Concepts looked at in this step */
  chips: string[];
  /** Example text */
  ex: string;
  /** Heading of the example (default: the dated BIST 30 example) */
  exLbl?: string;
}

/** Heading of the BIST examples: the figures are dated and do not change when the data is updated. */
const BIST_EX = 'Örnek (BIST 30, 2 Ekim 2026):';

export const STEPS: Step[] = [
  {
    title: 'Şirket ne iş yapıyor?',
    body: 'Sektör, hangi çarpanın geçerli olduğunu belirler. Bankada PD/DD ile özkaynak kârlılığı, holdingde net aktif değer (NAV), sanayide FD/FAVÖK, büyüme şirketinde PEG öne çıkar. Döngüsel bir işte bugünkü kâr, ortalama kârın üstünde ya da altında olabilir.',
    chips: ['Sektör', 'Döngüsellik (cyclicality)'],
    ex: "TUPRS'ın kârı rafineri marjına, TRALT'ınki altın fiyatına bağlı.",
  },
  {
    title: 'Kâr gerçek mi?',
    body: 'Net kâr büyümesini FAVÖK ve esas faaliyet kârıyla karşılaştırın. Faaliyetler büyümeden net kâr sıçrıyorsa, kaynağı parasal kazanç, finansal gelir ya da baz etkisidir ve kalıcı olmayabilir.',
    chips: ['FAVÖK büyümesi (EBITDA growth)', 'Esas faaliyet kârı (EBIT)', 'Parasal kazanç'],
    ex: "GUBRF'ta satış, FAVÖK ve net kâr aynı yönde büyüyor; MGROS'ta esas faaliyet zararda.",
  },
  {
    title: 'Bilanço sağlam mı?',
    body: "Net borç/FAVÖK 2,5'in altında mı? Nakit fazlası var mı? Yüksek faizde borçlu şirketin kârını faiz gideri yer.",
    chips: ['Net borç/FAVÖK', 'Nakit (cash)'],
    ex: 'ENKAI ve TUPRS net nakitte; SASA ve PETKM borç baskısı altında.',
  },
  {
    title: 'Fiyat makul mü?',
    body: 'Ancak şimdi çarpanlara bakın: F/K, PD/DD, FD/FAVÖK. Hissenin kendi geçmiş ortalamasıyla ve aynı piyasadaki, aynı sektördeki benzerleriyle kıyaslayın; tarayıcı uygulaması (screener app) bunun için sektör ortancasını gösterir. BIST ile ABD hisselerini birbirine karşı koymayın: faiz, enflasyon ve para birimi farklı olduğu için aynı çarpan iki piyasada aynı şeyi söylemez (Hikâye 9). Büyüme varsa PEG ile düzeltin.',
    chips: ['F/K (P/E)', 'PD/DD (P/B)', 'FD/FAVÖK (EV/EBITDA)', 'PEG', 'Sektör ortancası (industry median)'],
    ex: 'ASELS pahalı görünür ama PEG 0,64; TCELL ucuz görünür ama büyümüyor.',
  },
  {
    title: 'Büyüme sürecek mi?',
    body: 'Geçmiş büyüme geleceği garanti etmez. Kapasite yatırımları, sipariş birikimi, sektör döngüsü ve analist beklentileri bu soruyu cevaplar. Tarayıcı uygulaması geçmişe bakar; bu adım geleceğe.',
    chips: ['Analist beklentisi', 'Yatırım planı (CapEx)', 'Sektör trendi'],
    ex: 'Kasım başındaki 3. çeyrek bilançoları bu tablonun güncellenmesi için ilk fırsat.',
  },
  {
    title: 'Fiyat hangi yönde gidiyor?',
    body: "Hareketli ortalama şirketin rakamlarına bakmaz, yalnızca fiyatın son aylarda hangi yöne gittiğini gösterir. Bu yüzden ancak ilk adımlar olumlu çıktıktan sonra, zamanlama için yardımcı bir bilgi olarak okunur: fiyat 200 günlük ortalamasının üstünde mi, 50 günlük ortalama 200 günlüğün üstünde mi? Eğilim yukarıysa fiyat bir süredir yükseliyor, aşağıysa düşüyor demektir; bu, hissenin ucuz ya da pahalı olduğunu söylemez. Ortalama geriden geldiği için dönüşü geç gösterir. Türkiye'de TL fiyatlar enflasyonla birlikte yükseldiği için BIST hissesinin 200 günlük ortalamanın üstünde olması tek başına zayıf bir kanıttır.",
    chips: ['SMA 20 / 50 / 200 (simple moving average)', 'Altın / ölüm kesişimi (golden / death cross)', 'Eğilim (trend)'],
    ex: "Hikâye 8'de pencereyi değiştirip ortalamanın dönüşü kaç gün geç gösterdiğine bakın. Tarayıcı uygulaması bu ortalamaları her hisse için gösterir.",
    exLbl: 'Deneyin:',
  },
];

/** Widening the view: [title, explanation] */
export const WIDEN: Array<[string, string]> = [
  [
    'Serbest nakit akımı (free cash flow)',
    'Kâr muhasebe rakamıdır; nakit ise gerçektir. Faaliyetten gelen nakit, yatırım harcamasını karşılıyor mu? Kâr eden ama nakit yakan şirketler dikkat ister.',
  ],
  [
    'Temettü politikası (dividend policy)',
    'Düzenli temettü, kârın gerçek olduğunun işaretlerinden biridir. Temettü verimini mevduat faiziyle kıyaslayın.',
  ],
  [
    'Tarihsel çarpan bandı (historical multiple range)',
    "Bir hissenin F/K'sı bugün 10 ise, son 5 yılda genelde kaç olduğuna bakın. Kendi ortalamasının altında işlem görmesi, sektör ortalamasından daha anlamlıdır.",
  ],
  [
    'Faiz ortamı (interest rates)',
    "Kazanç verimi (1 ÷ F/K) risksiz faizin çok altındaysa, piyasa güçlü büyüme bekliyor demektir. Faiz düştükçe çarpanlar genelde yükselir.",
  ],
  [
    'Kur duyarlılığı (FX sensitivity)',
    'İhracatçı ve döviz geliri olan şirketler TL değer kaybından fayda görebilir; döviz borçlu olanlar zarar görür.',
  ],
  [
    'Sahiplik ve likidite (ownership, liquidity)',
    'Yabancı payı, fiili dolaşım oranı ve günlük işlem hacmi, hissenin ne kadar kolay alınıp satılacağını belirler.',
  ],
];

const step = (s: Step): string =>
  `<li><div><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p><div class="chips">${s.chips
    .map((c) => `<span class="chip">${esc(c)}</span>`)
    .join('')}</div><p class="muted ex"><b>${esc(s.exLbl ?? BIST_EX)}</b> ${esc(s.ex)}</p></div></li>`;

export function mount(root: HTMLElement): void {
  root.innerHTML = `
    <div class="stack read">
      <h2>Bir hisseye hangi sırayla bakılır?</h2>
      <p>Çarpanlar en sona bakılırsa daha doğru okunur. Önce kârın gerçek olduğundan ve bilançonun sağlam olduğundan emin olun; fiyat sorusu ondan sonra gelir. Sıra önemlidir, çünkü her adım bir sonrakini anlamlı kılar.</p>
    </div>
    <ol class="steps" id="st-steps">${STEPS.map(step).join('')}</ol>
    <div class="stack read">
      <h2>Bakışı genişletmek: tablonun göstermedikleri</h2>
      <p>Tarayıcı uygulamasındaki çarpanlar başlangıçtır. Gerçek bir karar için şunlara da bakılır:</p>
    </div>
    <div class="tr-list" id="st-widen">${WIDEN.map((t) => `<div><b>${esc(t[0])}</b><span>${esc(t[1])}</span></div>`).join('')}</div>
    <p class="note read">Tarama bir aday listesi üretir, alım kararı üretmez. Tek bir hisseye tüm birikimi yatırmamak, pozisyonları küçük tutmak ve neden aldığınızı yazıya dökmek, hangi çarpanı kullandığınızdan daha çok fark yaratır.</p>`;
}

export function refresh(): void {
  /* No chart in this tab. */
}
