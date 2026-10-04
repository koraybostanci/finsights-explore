/**
 * Çarpanlar: çarpan kartları, Türkiye'ye özgü dikkat noktaları ve ayrı bir
 * bölümde hareketli ortalama (teknik gösterge).
 * Kartlar ve liste ilk sürümden aynen taşındı; örnekler 2 Ekim 2026 verisiyle yazılmıştır.
 */

import { esc, nf, pct, tl } from '../lib/format.ts';
import { TERMS } from '../terms.ts';
import { ROADWORK_END, SMA_LONG, SMA_SHORT, smaStory } from './model.ts';

export interface MultipleCard {
  /** Kısa ad, ör. "F/K" */
  n: string;
  /** İngilizce karşılık */
  en: string;
  /** Üst başlık (açık ad) */
  tam: string;
  /** Kartın sorduğu soru */
  tag: string;
  /** Formül */
  fx: string;
  /** Kabaca okuma: [aralık, anlam] */
  band: Array<[string, string]>;
  /** Nasıl okunur */
  oku: string;
  tuzak: string;
  /** Örnek metni ve (varsayılandan farklıysa) başlığı */
  ex: string;
  exLbl?: string;
}

export const CARDS: MultipleCard[] = [
  {
    n: 'F/K',
    en: 'P/E, Price-to-Earnings',
    tam: 'Fiyat / Kazanç',
    tag: 'Bugünkü kârla, fiyatı kaç yılda geri öderim?',
    fx: 'Piyasa değeri ÷ Yıllık net kâr',
    band: [
      ['< 8', 'düşük'],
      ['8–15', 'orta'],
      ['> 15', 'yüksek'],
    ],
    oku: 'F/K 10 ise, kâr hiç değişmese şirket piyasa değerini 10 yılda kazanır. Tersini alırsanız kazanç verimi (earnings yield) elde edersiniz: F/K 10 = %10 kazanç verimi. Bunu faiz ve enflasyonla kıyaslamak işe yarar.',
    tuzak: 'Düşük F/K kâr geçici olarak şişmişse (döngüsel zirve, tek seferlik gelir) yanıltır. Zarar eden şirkette F/K hesaplanamaz.',
    ex: 'THYAO 3,60 ile en düşüklerden ama kârı gerilemiş; ASELS 40,66 ile en yüksek, çünkü piyasa güçlü büyüme bekliyor.',
  },
  {
    n: 'PD/DD',
    en: 'P/B, Price-to-Book',
    tam: 'Piyasa Değeri / Defter Değeri',
    tag: 'Şirketin özkaynağına kaç kat fiyat ödüyorum?',
    fx: 'Piyasa değeri ÷ Özkaynak',
    band: [
      ['< 1', 'özkaynağın altında'],
      ['1–2', 'orta'],
      ['> 2', 'primli'],
    ],
    oku: "1'in altı, piyasanın şirketi muhasebedeki özkaynağından düşük fiyatladığını gösterir. Bankalar ve varlık ağırlıklı şirketler için en önemli çarpandır.",
    tuzak: "Özkaynağına iyi getiri sağlamayan şirket haklı olarak 1'in altında işlem görür. PD/DD her zaman özkaynak kârlılığıyla birlikte okunmalı.",
    ex: 'SAHOL 0,43 ve SISE 0,42 defterin çok altında; BIMAS 2,46 primli ama özkaynağına istikrarlı getiri sağlıyor.',
  },
  {
    n: 'FD/FAVÖK',
    en: 'EV/EBITDA',
    tam: 'Firma Değeri / FAVÖK',
    tag: 'Borç dahil şirketi, faaliyet kârının kaç katına alıyorum?',
    fx: '(Piyasa değeri + Net borç) ÷ Yıllık FAVÖK',
    band: [
      ['< 6', 'düşük'],
      ['6–10', 'orta'],
      ['> 10', 'yüksek'],
    ],
    oku: "F/K'dan farkı borcu hesaba katmasıdır. İki şirketin F/K'sı aynıysa, borçlu olanın FD/FAVÖK'ü daha yüksek çıkar. Faaliyet kârına baktığı için faiz, kur ve parasal kazanç gibi kalemlerden etkilenmez.",
    tuzak: "Bankalarda kullanılmaz. Yatırım dönemindeki, FAVÖK'ü henüz oluşmamış şirketlerde çok yüksek görünür.",
    ex: "TCELL 2,11 ve TTKOM 2,51 en düşükler; PETKM 64,61 ile FAVÖK'ü çok zayıf.",
  },
  {
    n: 'PEG',
    en: 'PEG ratio, Price/Earnings-to-Growth',
    tam: 'F/K / Büyüme',
    tag: 'Ödediğim F/K, şirketin büyümesine göre makul mü?',
    fx: 'F/K ÷ Yıllık net kâr büyümesi (%)',
    band: [
      ['< 0', 'kâr düşüyor'],
      ['0–1', 'büyümeye göre ucuz'],
      ['> 1', 'pahalı'],
    ],
    oku: "F/K 20 olan ama kârını yılda %40 büyüten şirketin PEG'i 0,5'tir; F/K 10 olup %5 büyüyenin PEG'i 2'dir. PEG, yüksek F/K'lı büyüme şirketlerini adil kıyaslamaya yarar.",
    tuzak: "Büyüme oranı düşük bir bazdan geliyorsa (zarardan kâra, kötü bir yıldan toparlanma) PEG yapay olarak sıfıra yaklaşır. 0,1'in altındaki PEG çoğunlukla bir uyarıdır, fırsat değil.",
    ex: 'GUBRF 0,57 büyümesi faaliyetten geldiği için güvenilir; TOASO 0,02 ve TUPRS 0,07 baz etkisi yüzünden yanıltıcı.',
  },
  {
    n: 'ÖK kârlılığı',
    en: 'ROE, Return on Equity',
    tam: 'Özkaynak kârlılığı',
    tag: "Ortakların koyduğu her 100 TL'ye yılda kaç TL kâr?",
    fx: 'Net kâr ÷ Özkaynak  ≈  PD/DD ÷ F/K',
    band: [
      ['< %10', 'zayıf'],
      ['%10–20', 'iyi'],
      ['> %20', 'güçlü'],
    ],
    oku: "Şirketin sermayeyi ne kadar verimli kullandığını gösterir. Pratik bir kısayol: PD/DD'yi F/K'ya bölerseniz yaklaşık özkaynak kârlılığını bulursunuz. Yüksek ve istikrarlı kârlılık, yüksek PD/DD'yi haklı çıkarır.",
    tuzak: 'Yüksek borçla şişirilmiş kârlılık risklidir. Enflasyon döneminde nominal kârlılığı enflasyonla kıyaslamak gerekir.',
    ex: "GARAN ≈ %24,5 ile bankalar arasında en yüksek; ISCTR ≈ %13,3 ile en düşük ve PD/DD'si de en düşük.",
  },
  {
    n: 'Net borç / FAVÖK',
    en: 'Net debt/EBITDA',
    tam: 'Borçluluk',
    tag: 'Borcunu kaç yıllık faaliyet kârıyla kapatır?',
    fx: '(Finansal borç − Nakit) ÷ Yıllık FAVÖK',
    band: [
      ['< 0', 'net nakit'],
      ['0–2,5', 'rahat'],
      ['> 3', 'yüksek'],
    ],
    oku: 'Eksi değer, şirketin borcundan fazla nakdi olduğu anlamına gelir (net cash). Yüksek faiz ortamında yüksek borç, faaliyet kârının büyük kısmını faize gönderir.',
    tuzak: 'FAVÖK geçici olarak düşükse oran aşırı büyük görünür. Holdinglerde finans iştirakleri konsolide edildiği için oran yanıltıcı olabilir.',
    ex: 'ENKAI −5,13 ile çok güçlü nakit; SASA 10,36 ve PETKM 32,41 ile borç baskısı yüksek.',
  },
];

/** Hareketli ortalama kartları. Örnekler Hikâye 8'in kurgusal serisinden hesaplanır. */
export function smaCards(): MultipleCard[] {
  const s20 = smaStory(20);
  const s200 = smaStory(SMA_LONG);
  const death = s200.crosses.find((c) => c.kind === 'death');
  const golden = s200.crosses.find((c) => c.kind === 'golden');
  const side = (d: number): string => `%${nf(Math.abs(d), 0)} ${d < 0 ? 'altında' : 'üstünde'}`;
  return [
    {
      n: TERMS.sma.tr,
      en: TERMS.sma.en,
      tam: 'Basit hareketli ortalama',
      tag: 'Fiyat, son N günün ortalamasına göre nerede?',
      fx: 'SMA(N) = son N kapanışın toplamı ÷ N',
      band: [
        ['SMA 20', 'kısa vade'],
        ['SMA 50', 'orta vade'],
        ['SMA 200', 'uzun vade'],
      ],
      oku: 'Her gün en eski kapanış hesaptan çıkar, yenisi girer; günlük dalgalanma yumuşar. Fiyat ortalamanın üstündeyse son N günün genelinden yüksektir. Fiyat 200 günlük ortalamasının üstündeyse eğilim (trend) bir süredir yukarı, altındaysa aşağı demektir.',
      tuzak:
        'Ortalama geçmişe bakar ve hep geriden gelir. Eğilimi gösterir, değeri değil: fiyatın ortalamanın üstünde olması hissenin ucuz olduğunu söylemez. Türkiye\'de fiyatlar enflasyonla birlikte yükseldiği için TL fiyatın 200 günlük ortalamanın üstünde olması tek başına zayıf bir kanıttır.',
      ex: `Hikâye 8'de Ayşe'nin bugünkü hasılatı ${tl(s20.today)}: 20 günlük ortalamanın (${tl(s20.avgToday)}) ${side(
        s20.dist,
      )}, 200 günlük ortalamanın (${tl(s200.avgToday)}) ${side(s200.dist)}. Aynı gün, pencereye göre hem zayıf hem iyi görünüyor.`,
      exLbl: 'Hikâyeden örnek',
    },
    {
      n: 'Altın kesişim ve ölüm kesişimi',
      en: 'Golden cross, death cross',
      tam: 'İki ortalamanın kesişmesi',
      tag: 'Yakın dönem, uzun dönemden güçlü mü?',
      fx: `Altın kesişim: SMA ${SMA_SHORT}, SMA ${SMA_LONG}'ü yukarı keser\nÖlüm kesişimi: SMA ${SMA_SHORT}, SMA ${SMA_LONG}'ü aşağı keser`,
      band: [
        [`SMA ${SMA_SHORT} > SMA ${SMA_LONG}`, 'eğilim yukarı'],
        [`SMA ${SMA_SHORT} < SMA ${SMA_LONG}`, 'eğilim aşağı'],
      ],
      oku: `${SMA_SHORT} günlük ortalama ${SMA_LONG} günlüğün üstüne çıkmışsa, son ${SMA_SHORT} gün son ${SMA_LONG} günün genelinden güçlü geçmiştir. Altın kesişim yükselen, ölüm kesişimi düşen eğilimin işareti sayılır.`,
      tuzak:
        'İki ortalama da geriden geldiği için kesişim, dönüşten epey sonra oluşur. Fiyat yatay giderken ortalamalar birbirine dolanır ve art arda yanlış sinyal verir. Kesişim tek başına al ya da sat nedeni değildir.',
      ex:
        death && golden
          ? `Hikâye 8'de ${SMA_SHORT} günlük ortalama ${SMA_LONG} günlüğü ${death.day}. günde aşağı, ${golden.day}. günde yukarı kesti. Hasılat ise ${ROADWORK_END}. günde dönmüştü: altın kesişim ${golden.day - ROADWORK_END} gün geriden geldi.`
          : "Hikâye 8'deki grafikte 50 günü seçip 200 günlük ortalamayı açın.",
      exLbl: 'Hikâyeden örnek',
    },
  ];
}

/** Türkiye'ye özgü dikkat noktaları: [başlık, açıklama] */
export const TR: Array<[string, string]> = [
  [
    'Enflasyon muhasebesi (TMS 29 / IAS 29, hyperinflation accounting)',
    "2024'ten beri Türk şirketleri bilançolarını enflasyona göre düzeltiyor. Rakamlar reel hale geliyor ama yeni bir kalem doğuyor: net parasal pozisyon kazancı veya kaybı.",
  ],
  [
    'Parasal kazanç ≠ faaliyet kârı (monetary gain vs operating profit)',
    "Parasal kazanç, enflasyon karşısında borcun reel olarak erimesinden doğar; şirket bir ürün satmadan oluşur. Net kâr bu kalemle büyüyorsa FAVÖK'e ve esas faaliyet kârına bakın. MGROS ve SISE bunun örneği.",
  ],
  [
    'Baz etkisi (base effect)',
    'Geçen yıl kâr çok düşük ya da zarardaysa, bu yılki normal bir kâr bile %300 büyüme gibi görünür. PEG bu durumda sıfıra yaklaşır ve yanıltır.',
  ],
  [
    'Fonksiyonel para birimi (functional currency)',
    'THYAO, EREGL ve ENKAI USD; PGSUS ve TAVHL EUR ile raporlar. Bu şirketlerin kârı kur hareketinden TL bazında farklı etkilenir.',
  ],
  [
    'Analist hedef fiyatları (consensus target price)',
    "Hedefler 12 aylık ve nominal TL'dir, yani enflasyon payını da içerir. %50 potansiyel yüksek enflasyonda olağandır. Hedefler zaman zaman eski kalabilir.",
  ],
  [
    'Fiili dolaşım (free float)',
    "Halka açık ve işlem gören payların oranı. VAKBN'de yaklaşık %6, KRDMD'de %92. Düşük dolaşım, fiyatın daha sert hareket edebileceği anlamına gelir.",
  ],
];

const card = (c: MultipleCard): string => `
<article class="card">
  <div><span class="eyebrow">${esc(c.tam)}</span><h3>${esc(c.n)} <span class="en">(${esc(c.en)})</span></h3><p class="tag">${esc(c.tag)}</p></div>
  <div class="formula">${esc(c.fx).replace(/\n/g, '<br>')}</div>
  <div><div class="lbl">Kabaca okuma</div><div class="band">${c.band
    .map((b) => `<span><b class="mono">${esc(b[0])}</b> ${esc(b[1])}</span>`)
    .join('')}</div></div>
  <div><div class="lbl">Nasıl okunur</div><p>${esc(c.oku)}</p></div>
  <p class="trap"><b>Tuzak:</b> ${esc(c.tuzak)}</p>
  <div class="ex"><div class="lbl">${esc(c.exLbl ?? "BIST 30'dan örnek (2 Ekim 2026)")}</div><p>${esc(c.ex)}</p></div>
</article>`;

export function mount(root: HTMLElement): void {
  root.innerHTML = `
    <div class="stack read">
      <h2>Çarpanlar ne anlatır?</h2>
      <p>Bir çarpan (multiple), şirketin fiyatını kârı, özkaynağı veya nakit üretimiyle karşılaştırır. Tek başına "ucuz" ya da "pahalı" demez; sadece bir soru sorar: <em>Bu fiyatı neye karşılık ödüyorum?</em> Doğru cevap için birkaç çarpanı birlikte, kârın kalitesiyle beraber okumak gerekir. Örnekler 2 Ekim 2026 verisiyle yazıldı.</p>
    </div>
    <div class="cards" id="lrn-cards">${CARDS.map(card).join('')}</div>
    <div class="stack">
      <h2>Türkiye'ye özgü dikkat noktaları</h2>
      <p class="muted small">Şirket örnekleri ve oranlar 2 Ekim 2026 verisiyle yazıldı.</p>
      <div class="tr-list" id="lrn-trlist">${TR.map((t) => `<div><b>${esc(t[0])}</b><span>${esc(t[1])}</span></div>`).join('')}</div>
    </div>
    <div class="stack" id="lrn-sma">
      <div class="stack read">
        <span class="eyebrow">Çarpan değil, eğilim ölçüsü</span>
        <h2>Teknik gösterge: hareketli ortalama <span class="en">(Simple moving average, SMA)</span></h2>
        <p>Çarpanlar fiyatı kârla, özkaynakla ya da nakit üretimiyle karşılaştırır. Hareketli ortalama şirketin rakamlarına hiç bakmaz; yalnızca fiyatın son günlerde hangi yöne gittiğini gösterir. Bu yüzden ayrı durur ve çarpanlardan sonra okunur. Tarayıcı, her hisse için 20, 50 ve 200 günlük ortalamaları gösterir; mantığı Hikâye 8'de anlatılıyor.</p>
      </div>
      <div class="cards" id="lrn-smacards">${smaCards().map(card).join('')}</div>
    </div>`;
}

export function refresh(): void {
  /* Bu sekmede grafik yok. */
}

/** Testler için: kartların düz metni (örneklerin tutarlılığını sınamak üzere). */
export const smaExampleNumbers = (): { today: number; dist20: string; dist200: string } => {
  const s20 = smaStory(20);
  const s200 = smaStory(SMA_LONG);
  return { today: s20.today, dist20: pct(s20.dist, 0), dist200: pct(s200.dist, 0) };
};
