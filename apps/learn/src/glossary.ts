/**
 * Glossary tab: the term list of the first version with a search box, plus a group of new terms.
 * Search works on Turkish and English text, ignoring letter case and Turkish diacritics.
 *
 * mount: when the tab is first built; refresh: when the tab becomes visible and when the width changes (nothing to do here).
 */

import { esc } from '@fintools/shared/format';
import { TERMS } from '@fintools/shared/terms';

/** [Turkish term, English counterpart, explanation, optional formula] */
export type GlossItem = [string, string, string, string?];
export type GlossGroup = [string, GlossItem[]];

/** Writes an entry with the Turkish and English names from the term dictionary (terms.ts), so the names stay the same everywhere. */
const fromTerm = (id: string, def: string, fx?: string): GlossItem => [TERMS[id].tr, TERMS[id].en, def, fx];

export const GL: GlossGroup[] = [
  [
    'Temel büyüklükler',
    [
      ['Piyasa değeri', 'Market capitalization, market cap', 'Şirketin borsadaki toplam değeri. Bütün payları bugünkü fiyattan alsaydınız ödeyeceğiniz tutar.', 'Hisse fiyatı × Pay sayısı'],
      ['Pay / lot', 'Share', "Şirketin sahiplik birimi. Borsa İstanbul'da 1 lot = 1 pay. Ayşe'nin Kahvesi 100.000 paya bölünmüş."],
      ['Ödenmiş sermaye', 'Paid-in capital', 'Ortakların şirkete koyduğu nominal sermaye. 1 TL nominal değer 1 pay demektir, bu yüzden pay sayısını verir.'],
      ['Varlıklar (aktifler)', 'Assets', 'Şirketin sahip olduğu her şey: nakit, stok, alacaklar, makine, bina.'],
      ['Yükümlülükler (borçlar)', 'Liabilities', 'Şirketin başkalarına borçlu olduğu her şey: banka kredisi, tedarikçi borcu, kira yükümlülüğü.'],
      ['Özkaynak / özsermaye', "Shareholders' equity", 'Varlıklardan borçlar çıkınca ortaklara kalan kısım. Ortakların koyduğu sermaye ve yıllar içinde dağıtılmayıp biriken kârlardan oluşur.', 'Varlıklar − Yükümlülükler'],
      ['Defter değeri', 'Book value', 'Özkaynağın başka bir adı. Hisse başına defter değeri, özkaynağın pay sayısına bölümüdür.', 'Özkaynak ÷ Pay sayısı'],
      ['Net borç', 'Net debt', 'Şirketin finansal borcundan elindeki nakdi düşünce kalan. Eksiyse şirket net nakit (net cash) pozisyonundadır.', 'Finansal borç − Nakit ve benzerleri'],
      ['Firma değeri', 'Enterprise value, EV', 'Şirketi borcuyla birlikte satın almanın maliyeti. Borçlu bir şirketi alan, borcunu da üstlenir.', 'Piyasa değeri + Net borç'],
    ],
  ],
  [
    'Gelir tablosu',
    [
      ['Hasılat / satışlar', 'Revenue, sales', 'Şirketin bir dönemde sattığı mal ve hizmetlerin toplam tutarı. Gelir tablosunun en üst satırı (top line).'],
      ['Satışların maliyeti', 'Cost of goods sold, COGS', 'Satılan ürünün doğrudan maliyeti: kahvecide çekirdek, süt ve bardak.'],
      ['Brüt kâr', 'Gross profit', 'Satıştan satışların maliyeti çıkınca kalan. Brüt kâr marjı (gross margin), ürünün kendi kârlılığını gösterir.', 'Hasılat − Satışların maliyeti'],
      ['Faaliyet giderleri', 'Operating expenses, OPEX', 'İşi döndürmek için yapılan genel giderler: kira, maaşlar, pazarlama, faturalar.'],
      ['FAVÖK', 'EBITDA', 'Faiz, vergi ve amortisman öncesi kâr. İşin kendisinin nakit üretme gücünün kaba ölçüsü.', 'Brüt kâr − Faaliyet giderleri (amortisman hariç)'],
      ['Amortisman', 'Depreciation & amortization, D&A', 'Makine ve bina gibi uzun ömürlü varlıkların yıllar içinde yıpranma payının gidere yazılması. Nakit çıkışı değildir.'],
      ['Esas faaliyet kârı', 'Operating profit, EBIT', 'Asıl işten elde edilen kâr; amortisman düşülmüş, faiz ve vergi düşülmemiş hâli.', 'FAVÖK − Amortisman'],
      ['Finansman gideri', 'Interest expense', 'Borçlar için ödenen faiz. Yüksek faizli dönemde borçlu şirketlerin kârını eritir.'],
      ['Net kâr / net dönem kârı', 'Net income, net profit', 'Tüm giderler, faiz ve vergi düşüldükten sonra ortaklara kalan kâr. Gelir tablosunun en alt satırı (bottom line).'],
      ['Hisse başına kâr (HBK)', 'Earnings per share, EPS', 'Net kârın pay sayısına bölümü. Fiyatı HBK\'ya bölerseniz F/K\'yı bulursunuz.', 'Net kâr ÷ Pay sayısı'],
      ['Kâr marjı', 'Profit margin', 'Satışların ne kadarının kâra dönüştüğü. FAVÖK marjı (EBITDA margin) ve net kâr marjı (net margin) en sık kullanılanlardır.', 'Kâr ÷ Hasılat'],
      ['Son 12 ay', 'Trailing twelve months, TTM', 'Çarpanlarda kullanılan yıllık kâr. Son dört çeyreğin toplamıdır, böylece mevsimsellik ortadan kalkar.'],
    ],
  ],
  [
    'Nakit ve temettü',
    [
      ['Faaliyetlerden nakit akışı', 'Operating cash flow', 'İşten fiilen kasaya giren nakit. Kâr muhasebe rakamıdır; nakit gerçektir.'],
      ['Yatırım harcaması', 'Capital expenditure, CapEx', 'Yeni makine, şube, fabrika gibi uzun vadeli varlıklara yapılan harcama.'],
      ['Serbest nakit akımı', 'Free cash flow, FCF', 'Yatırımlar yapıldıktan sonra şirkette kalan nakit. Temettü ve borç ödemesi buradan yapılır.', 'Faaliyetlerden nakit − Yatırım harcaması'],
      ['Temettü', 'Dividend', 'Şirketin kârının bir kısmını nakit olarak ortaklarına dağıtması.'],
      ['Temettü verimi', 'Dividend yield', 'Hisse başına temettünün fiyata oranı. Mevduat faiziyle kıyaslanır.', 'Hisse başı temettü ÷ Fiyat'],
      ['Dağıtım oranı', 'Payout ratio', 'Net kârın ne kadarının temettü olarak dağıtıldığı.', 'Temettü ÷ Net kâr'],
    ],
  ],
  [
    'Oranlar',
    [
      ['Kazanç verimi', 'Earnings yield', 'F/K\'nın tersi. Hisseye yatırdığınız her 100 TL için şirketin yılda kaç TL kâr ettiği.', '1 ÷ F/K'],
      ['Aktif kârlılığı', 'Return on assets, ROA', 'Şirketin tüm varlıklarına göre kârlılığı. Bankalarda ROE ile birlikte izlenir.', 'Net kâr ÷ Toplam varlıklar'],
      ['Cari oran', 'Current ratio', 'Kısa vadeli borçları, bir yıl içinde nakde dönecek varlıklarla ödeyebilme gücü. 1\'in altı dikkat ister.', 'Dönen varlıklar ÷ Kısa vadeli yükümlülükler'],
      ['Kaldıraç', 'Leverage', 'Şirketin kendi parasına göre ne kadar borçla çalıştığı. Kârı da zararı da büyütür.', 'Toplam varlıklar ÷ Özkaynak'],
      ['Çarpan', 'Multiple', 'Fiyatın bir finansal büyüklüğe oranı: F/K, PD/DD, FD/FAVÖK gibi.'],
    ],
  ],
  [
    'Piyasa',
    [
      ['Endeks', 'Index', 'Bir hisse grubunun toplu performansını gösteren gösterge. BIST 30, piyasa değeri ve likiditesi en yüksek 30 hisseden oluşur ve üç ayda bir güncellenir.'],
      ['Fiili dolaşım oranı', 'Free float', 'Halka açık ve borsada işlem gören payların toplam paylara oranı.'],
      ['Halka arz', 'Initial public offering, IPO', 'Bir şirketin paylarını ilk kez borsada satışa sunması.'],
      ['Bedelsiz sermaye artırımı', 'Bonus issue, stock split', 'Kâr veya yedeklerden yeni pay dağıtılması. Pay sayısı artar, fiyat aynı oranda düşer; şirketin değeri değişmez.'],
      ['Bedelli sermaye artırımı', 'Rights issue', 'Ortakların şirkete yeni para koyarak yeni pay alması. Şirkete taze sermaye girer.'],
      ['Pay geri alımı', 'Share buyback', 'Şirketin kendi paylarını borsadan satın alması. Yönetimin hisseyi ucuz bulduğuna dair bir işaret olarak okunur.'],
      ['Konsensüs hedef fiyat', 'Consensus target price', 'Hisseyi takip eden analistlerin 12 aylık hedef fiyatlarının ortalaması.'],
      ['KAP', 'Public Disclosure Platform', 'Kamuyu Aydınlatma Platformu. Şirketlerin bilanço ve önemli açıklamalarını yayımladığı resmî kaynak.'],
    ],
  ],
  [
    'Türkiye\'ye ve yönteme özgü',
    [
      ['Enflasyon muhasebesi', 'Hyperinflation accounting, IAS 29 / TMS 29', 'Yüksek enflasyonlu ülkelerde finansal tabloların satın alma gücüne göre yeniden ifade edilmesi. Türkiye\'de 2024 yılından beri uygulanıyor.'],
      ['Net parasal pozisyon kazancı', 'Net monetary position gain', 'Parasal borçların enflasyon karşısında reel olarak erimesinden doğan muhasebe kârı. Satıştan gelmez.'],
      ['Fonksiyonel para birimi', 'Functional currency', 'Şirketin ana faaliyetlerini yürüttüğü ve kayıtlarını tuttuğu para birimi (THYAO için USD).'],
      ['Baz etkisi', 'Base effect', 'Kıyaslanan önceki dönemin olağandışı düşük ya da yüksek olması nedeniyle büyüme oranının abartılı görünmesi.'],
      ['Döngüsel hisse', 'Cyclical stock', 'Kârı ekonomik döngüye, emtia fiyatına veya mevsime göre güçlü biçimde dalgalanan şirket.'],
      ['Değer tuzağı', 'Value trap', 'Çarpanları ucuz göründüğü hâlde ucuzluğunun haklı bir nedeni olan, kârı geriye gidecek hisse.'],
    ],
  ],
  [
    'Bankacılık',
    [
      ['Mevduat', 'Deposits', 'Bankaya yatırılan para. Bankanın en büyük fonlama kaynağı ve borcudur.'],
      ['Net faiz marjı', 'Net interest margin, NIM', 'Kredilerden alınan faizle mevduata ödenen faiz arasındaki farkın varlıklara oranı.'],
      ['Takipteki krediler oranı', 'Non-performing loans ratio, NPL', 'Geri ödenmeyen kredilerin toplam kredilere oranı.'],
      ['Karşılık gideri', 'Loan loss provision', 'Geri dönmeyeceği tahmin edilen krediler için ayrılan gider. NPL arttıkça artar ve kârı düşürür.'],
      ['Sermaye yeterlilik oranı', 'Capital adequacy ratio, CAR', 'Bankanın riskli varlıklarına karşı tuttuğu sermaye tamponu. Yasal alt sınırın rahat üzerinde olması beklenir.'],
    ],
  ],
  [
    'Hareketli ortalama ve piyasa karşılaştırması',
    [
      fromTerm(
        'sma',
        'Son N günün kapanış fiyatlarının ortalaması. Her gün en eski kapanış çıkar, yenisi girer; günlük dalgalanma yumuşar, ama ortalama hep geriden gelir. Borsada en sık 20, 50 ve 200 günlük pencereler kullanılır.',
        'SMA(N) = son N kapanışın toplamı ÷ N',
      ),
      fromTerm(
        'ema',
        'Son günlere daha fazla ağırlık veren hareketli ortalama. Yeni fiyata aynı pencereli SMA\'dan daha hızlı tepki verir, ama o da geriden gelir.',
        'EMA(bugün) = α × kapanış + (1 − α) × EMA(dün),  α = 2 ÷ (N + 1)',
      ),
      fromTerm(
        'goldenCross',
        '50 günlük ortalamanın 200 günlük ortalamayı aşağıdan yukarı kesmesi. Yükselen eğilimin işareti sayılır; ama iki ortalama da geriden geldiği için dönüşten epey sonra oluşur.',
      ),
      fromTerm(
        'deathCross',
        '50 günlük ortalamanın 200 günlük ortalamayı yukarıdan aşağı kesmesi. Düşen eğilimin işareti sayılır; o da dönüşten sonra gelir ve tek başına satış nedeni değildir.',
      ),
      fromTerm(
        'trend',
        'Fiyatın bir süredir genel olarak gittiği yön: yukarı, aşağı ya da yatay. Hareketli ortalamalar eğilimi gösterir; hissenin ucuz ya da pahalı olduğunu göstermez.',
      ),
      fromTerm(
        'supportResistance',
        'Teknik analizde, fiyatın geçmişte birkaç kez durup geri döndüğü alt (destek) ve üst (direnç) seviyeler. Kesin bir kural değil, geçmişe bakan bir okumadır; seviyeler zamanla geçerliliğini yitirebilir.',
      ),
      fromTerm(
        'close',
        'Hissenin o günkü son işlem fiyatı. Hareketli ortalamalar günlük kapanışlardan hesaplanır.',
      ),
      fromTerm(
        'lag',
        'Hareketli ortalamanın fiyattaki dönüşü geç göstermesi. N günlük ortalama, yükselen ya da düşen bir fiyatın kabaca (N\u00a0−\u00a01)\u00a0÷\u00a02 gün gerisinden gelir.',
      ),
      fromTerm(
        'industryMedian',
        'Aynı piyasadaki ve aynı sektördeki hisselerin bir çarpanı küçükten büyüğe sıralandığında ortada kalan değer. Uçtaki tek bir hisse ortalamayı saptırır, ortancayı neredeyse hiç etkilemez. BIST ve ABD için ayrı hesaplanır.',
      ),
      [
        'Kazanç verimi ve faiz',
        'Earnings yield vs. risk-free rate',
        'Kazanç verimi, o para biriminin risksiz faiziyle kıyaslanır. Aynı verim faizin yüksek olduğu piyasada daha az, düşük olduğu piyasada daha çok çekici görünür; BIST ve ABD hisseleri bu yüzden ayrı okunur.',
        '1 ÷ F/K, yerel risksiz faizle kıyaslanır',
      ],
      fromTerm(
        'riskFree',
        'Bir para biriminde en güvenli kabul edilen yatırımın getirisi, örneğin devlet tahvili faizi. Yatırımcı hisseden bunun üstünde bir getiri bekler.',
      ),
      fromTerm(
        'nominalGrowth',
        'Enflasyon düşülmeden ölçülen büyüme. Yüksek enflasyonlu bir ülkede TL kâr büyümesinin içinde enflasyon da vardır.',
      ),
      fromTerm(
        'realGrowth',
        'Enflasyon düşüldükten sonra kalan büyüme.',
        'Reel büyüme = (1 + nominal büyüme) ÷ (1 + enflasyon) − 1',
      ),
      fromTerm(
        'countryRisk',
        'Bir ülkedeki belirsizliğin (kur, siyaset, makro dengeler) yatırımcı için taşıdığı risk. Yatırımcı bunun karşılığında ek getiri ister, yani aynı kâra daha düşük fiyat öder.',
      ),
    ],
  ],
];

/**
 * Simplifies text for searching: lowercases with Turkish rules (İ→i, I→ı), then maps
 * ı→i and drops diacritics such as the circumflex and dots. So "EBITDA", "ebitda",
 * "özkaynak" and "ozkaynak" give the same result.
 */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
}

/** Searchable text of an entry: Turkish term, English counterpart, explanation and formula. */
const haystack = (i: GlossItem): string => fold(`${i[0]} ${i[1]} ${i[2]} ${i[3] ?? ''}`);

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Returns the entries that match the query, grouped; an empty query returns everything.
 * A match anywhere in the text counts ("kaynak" → "özkaynak").
 * The one exception is queries of up to 3 letters: abbreviations like "sma", "eps", "ema"
 * also occur inside words such as "amortisman" or "finansman", so only matches at the
 * start of a word are tried first; if there are none, matches inside the text are used.
 */
export function filterGlossary(query: string, groups: GlossGroup[] = GL): GlossGroup[] {
  const q = fold(query.trim());
  const pick = (test: (h: string) => boolean): GlossGroup[] =>
    groups
      .map(([grp, items]): GlossGroup => [grp, items.filter((i) => test(haystack(i)))])
      .filter(([, items]) => items.length > 0);
  if (!q) return pick(() => true);
  if (q.length <= 3) {
    const wordStart = new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(q)}`, 'u');
    const byWord = pick((h) => wordStart.test(h));
    if (byWord.length) return byWord;
  }
  return pick((h) => h.includes(q));
}

const item = (i: GlossItem): string =>
  `<div><dt>${esc(i[0])} <span class="en">(${esc(i[1])})</span></dt><dd>${esc(i[2])}${i[3] ? `<span class="fx">${esc(i[3])}</span>` : ''}</dd></div>`;

export function render(query: string): string {
  const groups = filterGlossary(query);
  if (!groups.length) return `<p class="muted">"${esc(query)}" için terim bulunamadı.</p>`;
  return groups
    .map(([grp, items]) => `<div class="ggroup"><h3>${esc(grp)}</h3><dl class="gloss">${items.map(item).join('')}</dl></div>`)
    .join('');
}

export function mount(root: HTMLElement): void {
  root.innerHTML = `
    <div class="stack read">
      <h2>Sözlük</h2>
      <p>Bilançoda, haberlerde ve analist raporlarında en sık karşılaşacağınız terimler. Parantez içinde İngilizce karşılıkları var; yabancı kaynak okurken işinize yarar. Son grup hareketli ortalamayı ve BIST ile ABD hisselerini karşılaştırırken gereken terimleri toplar.</p>
      <label class="small" for="gl-q">Terim ara</label>
      <input class="gsearch" id="gl-q" type="search" placeholder="ör. özkaynak, EBITDA, temettü, SMA" autocomplete="off">
    </div>
    <div class="stack-lg" id="gl-list">${render('')}</div>`;
  const input = root.querySelector<HTMLInputElement>('#gl-q');
  const list = root.querySelector<HTMLElement>('#gl-list');
  if (!input || !list) return;
  input.addEventListener('input', () => {
    list.innerHTML = render(input.value);
  });
}

export function refresh(): void {
  /* No chart in this tab. */
}
