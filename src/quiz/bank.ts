/**
 * Kendini sına: hazır soru bankası. Sorular hikâyelerdeki kavramları ve
 * rakamları kullanır (Ayşe'nin Kahvesi, üç kahveci, Sahil dondurmacısı,
 * Mahalle sandığı, günlük hasılat, iki ülke). Gerçek şirketler hakkında
 * hiçbir rakam içermez; onlar için sorular datagen.ts içinde güncel veriden
 * üretilir.
 *
 * Her sorunun tek bir doğru yanıtı vardır ve doğru yanıt ilgili hikâyenin
 * "Ne öğrendik?" kutusundan çıkar. Seçenekler oyunda karıştırılır; bu yüzden
 * "hepsi" ya da "hiçbiri" gibi sıraya bağlı seçenek yazılmaz.
 */

import { termText as T } from '../terms.ts';
import type { QuizQuestion, QuizRef } from './types.ts';

export type TopicId = 'bilanco' | 'gelir' | 'carpan' | 'peg' | 'enflasyon' | 'dongu' | 'banka' | 'sma' | 'piyasa' | 'adim';

export const TOPICS: Record<TopicId, { label: string; ref: QuizRef }> = {
  bilanco: {
    label: 'Bilanço',
    ref: { tab: 'senaryo', anchor: 'case1', label: "Senaryolar · Hikâye 1: Ayşe'nin Kahvesi neye sahip?" },
  },
  gelir: {
    label: 'Gelir tablosu',
    ref: { tab: 'senaryo', anchor: 'case2', label: 'Senaryolar · Hikâye 2: Bir yılda ne kazandı?' },
  },
  carpan: {
    label: 'Piyasa değeri ve çarpanlar',
    ref: { tab: 'senaryo', anchor: 'case3', label: 'Senaryolar · Hikâye 3: Pay başına kaç TL verirdiniz?' },
  },
  peg: {
    label: 'Büyüme ve PEG',
    ref: { tab: 'senaryo', anchor: 'case4', label: 'Senaryolar · Hikâye 4: Aynı fiyat, üç farklı kahveci' },
  },
  enflasyon: {
    label: 'Enflasyon muhasebesi',
    ref: { tab: 'senaryo', anchor: 'case5', label: 'Senaryolar · Hikâye 5: Kahve satmadan gelen kâr' },
  },
  dongu: {
    label: 'Döngüsellik',
    ref: { tab: 'senaryo', anchor: 'case6', label: 'Senaryolar · Hikâye 6: Sahil dondurmacısı' },
  },
  banka: {
    label: 'Banka mantığı',
    ref: { tab: 'senaryo', anchor: 'case7', label: 'Senaryolar · Hikâye 7: Mahalle sandığı' },
  },
  sma: {
    label: 'Hareketli ortalama',
    ref: { tab: 'senaryo', anchor: 'case8', label: 'Senaryolar · Hikâye 8: Bugün iyi bir gün müydü?' },
  },
  piyasa: {
    label: 'İki ayrı piyasa',
    ref: { tab: 'senaryo', anchor: 'case9', label: 'Senaryolar · Hikâye 9: İki ülke, iki kahveci' },
  },
  adim: {
    label: 'Karar adımları',
    ref: { tab: 'adimlar', label: 'Karar adımları: bir hisseye hangi sırayla bakılır?' },
  },
};

interface Item {
  id: string;
  topic: TopicId;
  q: string;
  /** Doğru yanıt */
  a: string;
  /** Üç yanlış seçenek */
  x: [string, string, string];
  why: string;
}

const ITEMS: Item[] = [
  /* ---------- Hikâye 1: bilanço ---------- */
  {
    id: 'bilanco-esitlik',
    topic: 'bilanco',
    q: "Ayşe'nin Kahvesi'ne ortaklar 600.000 TL koydu, bankadan 200.000 TL kredi alındı. Bilançonun (balance sheet) iki tarafını birbirine bağlayan eşitlik hangisidir?",
    a: 'Varlıklar = borçlar + özkaynak',
    x: ['Varlıklar = özkaynak − borçlar', 'Özkaynak = varlıklar + borçlar', 'Borçlar = varlıklar + özkaynak'],
    why: 'Bilançonun iki tarafı hep eşittir: 800.000 TL\'lik varlık, 200.000 TL borç ve 600.000 TL özkaynakla karşılanır. Bir taraf paranın nereye gittiğini, öbürü nereden geldiğini gösterir.',
  },
  {
    id: 'bilanco-ozkaynak',
    topic: 'bilanco',
    q: `${T('equity')} ne demektir?`,
    a: 'Şirket bugün kapansa, borçlar ödendikten sonra ortaklara kalan para',
    x: [
      'Şirketin kasasındaki ve bankadaki nakdin toplamı',
      'Şirketin bir yılda yaptığı satışların toplamı',
      'Şirketin bütün paylarının borsadaki toplam fiyatı',
    ],
    why: "Özkaynak, varlıklardan borçlar düşülünce kalandır; defter değeri (book value) de denir. Ayşe'nin Kahvesi'nde 800.000 − 200.000 = 600.000 TL. Payların borsadaki toplam fiyatı ise piyasa değeridir.",
  },
  {
    id: 'bilanco-net-borc',
    topic: 'bilanco',
    q: `Ayşe'nin Kahvesi'nin bankaya 200.000 TL borcu, kasasında 150.000 TL nakdi var. ${T('netDebt')} kaç TL'dir?`,
    a: '50.000 TL',
    x: ['350.000 TL', '200.000 TL', '150.000 TL'],
    why: 'Net borç = finansal borç − nakit: 200.000 − 150.000 = 50.000 TL. Nakdi borcundan fazla olan şirket net nakit pozisyonundadır ve net borcu eksi çıkar.',
  },
  {
    id: 'bilanco-defter-degeri',
    topic: 'bilanco',
    q: "Ayşe'nin Kahvesi'nin özkaynağı 600.000 TL, sermayesi 100.000 paya bölünmüş. Pay başına defter değeri (book value per share) kaç TL'dir?",
    a: '6,00 TL',
    x: ['8,00 TL', '2,10 TL', '60,00 TL'],
    why: 'Pay başına defter değeri = özkaynak ÷ pay sayısı: 600.000 ÷ 100.000 = 6 TL. 8 TL, borçla alınan varlıkları da sayar; 2,10 TL ise hisse başına kârdır.',
  },

  /* ---------- Hikâye 2: gelir tablosu ---------- */
  {
    id: 'gelir-favok-net-kar',
    topic: 'gelir',
    q: `Gelir tablosunda (income statement) ${T('favok')} ile net kâr (net income) arasındaki fark nedir?`,
    a: 'FAVÖK faiz, vergi ve amortismandan önceki kârdır; net kâr bunlar düşüldükten sonra ortaklara kalandır',
    x: [
      'FAVÖK satışların toplamıdır; net kâr satışlardan yalnızca kahvenin maliyeti düşülünce kalandır',
      'FAVÖK ortaklara dağıtılan kârdır; net kâr şirketin kasasında bırakılandır',
      'FAVÖK vergiden sonraki kârdır; net kâr vergiden önceki kârdır',
    ],
    why: 'FAVÖK işin kendisinin ne kazandırdığını gösterir; finansman ve muhasebe kalemlerinden (faiz, vergi, amortisman) önce durur. Net kâr gelir tablosunun en altında, ortaklara kalan paradır.',
  },
  {
    id: 'gelir-eps',
    topic: 'gelir',
    q: "Ayşe'nin Kahvesi'nin yıllık net kârı 210.000 TL, pay sayısı 100.000. Hisse başına kâr (EPS) kaç TL'dir?",
    a: '2,10 TL',
    x: ['21,00 TL', '0,48 TL', '6,00 TL'],
    why: 'Hisse başına kâr = net kâr ÷ pay sayısı: 210.000 ÷ 100.000 = 2,10 TL. 6 TL pay başına defter değeridir, kârla ilgisi yoktur.',
  },
  {
    id: 'gelir-fk',
    topic: 'gelir',
    q: `Ayşe'nin Kahvesi'nin hisse başına kârı 2,10 TL. Pay 30 TL'den işlem görürse ${T('fk')} yaklaşık kaç olur?`,
    a: '14,3',
    x: ['0,07', '5,0', '63,0'],
    why: 'F/K = fiyat ÷ hisse başına kâr: 30 ÷ 2,10 ≈ 14,3. Kâr aynı kalırsa ödediğiniz fiyat yaklaşık 14 yılda geri döner. 5,0 aynı fiyattaki PD/DD\'dir.',
  },

  /* ---------- Hikâye 3: piyasa değeri ve çarpanlar ---------- */
  {
    id: 'carpan-fiyat-olcer',
    topic: 'carpan',
    q: "Ayşe'nin Kahvesi'nin kârı ve özkaynağı aynı kalırken pay fiyatı 30 TL'den 45 TL'ye çıkıyor. Çarpanlara ne olur?",
    a: 'F/K ve PD/DD yükselir; çünkü çarpanlar şirketi değil fiyatı ölçer',
    x: [
      'F/K ve PD/DD düşer; çünkü şirket daha değerli hâle gelmiştir',
      'Hiçbiri değişmez; çünkü kâr ve özkaynak aynıdır',
      'F/K yükselir ama PD/DD aynı kalır; çünkü defter değeri değişmemiştir',
    ],
    why: 'İki çarpanın da payında fiyat vardır. Kâr ve özkaynak değişmeden yalnızca fiyat artınca F/K 14,3\'ten 21,4\'e, PD/DD 5\'ten 7,5\'e çıkar.',
  },
  {
    id: 'carpan-pddd',
    topic: 'carpan',
    q: `Ayşe'nin Kahvesi'nin pay başına defter değeri 6 TL. Pay 30 TL'den işlem görürse ${T('pd')} kaç olur?`,
    a: '5,0',
    x: ['0,2', '14,3', '1,0'],
    why: 'PD/DD = fiyat ÷ pay başına defter değeri: 30 ÷ 6 = 5. PD/DD ancak pay 6 TL iken 1 olur; 14,3 aynı fiyattaki F/K\'dır.',
  },
  {
    id: 'carpan-firma-degeri',
    topic: 'carpan',
    q: `${T('fdf')} çarpanındaki firma değeri (EV) nasıl bulunur?`,
    a: 'Piyasa değerine net borç eklenir',
    x: ['Piyasa değerinden özkaynak çıkarılır', 'Özkaynağa net kâr eklenir', "FAVÖK, F/K ile çarpılır"],
    why: 'Şirketin tamamını alan, borcunu da üstlenir; firma değeri bu yüzden piyasa değeri + net borçtur. Zincir Kahve 3 milyon TL\'ye satılıyor ama 1,5 milyon TL borcuyla firma değeri 4,5 milyon TL.',
  },
  {
    id: 'carpan-prim',
    topic: 'carpan',
    q: "Ayşe'nin Kahvesi özkaynağına yılda %35 getiri sağlıyor. Hikâyeye göre böyle bir işin payı neden defter değerinden (PD/DD 1) satılmaz?",
    a: 'Özkaynağına bu kadar yüksek getiri sağlayan bir iş için alıcılar defter değerinin üstünde fiyat ödemeye razıdır',
    x: [
      'PD/DD hiçbir şirkette 1 olamadığı için',
      'Borcu olan şirketlerde PD/DD hesaplanamadığı için',
      'Defter değeri kahve makinesinin bugünkü satış fiyatını gösterdiği için',
    ],
    why: 'PD/DD, özkaynak kârlılığıyla birlikte okunur: kârlılığı yüksek ve istikrarlı işe piyasa prim öder. Bu kadar kârlı bir işi defter değerine satan olmaz.',
  },

  /* ---------- Hikâye 4: büyüme ve PEG ---------- */
  {
    id: 'peg-kose-zincir',
    topic: 'peg',
    q: "Köşe Kahvecisi'nin ve Zincir Kahve'nin F/K'sı aynı: 14,3. Köşe Kahvecisi'nin kârı yılda %5, Zincir Kahve'ninki %35 büyüyor. PEG'e göre hangisi büyümesine kıyasla daha pahalıdır?",
    a: 'Köşe Kahvecisi: PEG 14,3 ÷ 5 ≈ 2,9',
    x: [
      'Zincir Kahve: PEG 14,3 ÷ 35 ≈ 0,4',
      "İkisi aynı: F/K'ları eşit olduğu için PEG'leri de eşittir",
      'Zincir Kahve: PEG 35 ÷ 14,3 ≈ 2,4',
    ],
    why: 'PEG = F/K ÷ büyüme. Aynı F/K, yavaş büyüyen şirkette daha pahalıdır: Köşe Kahvecisi 2,9, Zincir Kahve 0,41. PEG 1\'in üstündeyse fiyat büyümeye göre yüksektir.',
  },
  {
    id: 'peg-film-seti',
    topic: 'peg',
    q: "Film Seti Kahvesi'nin PEG'i 0,07 ile üç kahvecinin en düşüğü. Bu neden yanıltıcıdır?",
    a: 'Kâr artışının tamamı tek seferlik kira gelirinden geliyor; gelecek yıl kâr eski düzeyine döner',
    x: [
      'Şubelerini krediyle açtığı için borcu çok yüksek',
      "F/K'sı öbür iki kahveciden yüksek olduğu için",
      'Kârı yalnızca yaz aylarında geldiği için',
    ],
    why: 'Dükkân üç ay dizi çekimine kiralandı ve kâr 70.000 TL\'den 210.000 TL\'ye fırladı; kahve satışları aynı. Büyüme kalıcı olmadığında çok düşük PEG ucuzluk değil, baz etkisi ya da tek seferlik kalem gösterir.',
  },
  {
    id: 'peg-zincir-borc',
    topic: 'peg',
    q: "Zincir Kahve'nin PEG'i 0,41 ile cazip görünüyor ve büyümesi faaliyetten geliyor. Hikâyeye göre karar vermeden önce neye bakılmalı?",
    a: 'Borcuna: şubelerini 1,5 milyon TL krediyle açtı',
    x: [
      'Dizi çekiminden gelen kira gelirine',
      'Kışın yaptığı zarara',
      'Geri ödenmeyen kredilerinin oranına',
    ],
    why: 'PEG borcu görmez. Zincir Kahve üç şubeyi krediyle açtı; borç eklenince firma değeri 4,5 milyon TL\'ye çıkıyor. Tarayıcı bu yüzden PEG\'in yanında Net borç/FAVÖK\'e de bakar.',
  },
  {
    id: 'peg-eksi',
    topic: 'peg',
    q: "Tarayıcı'da F/K'sı 10 olan bir hissenin PEG'i eksi çıkıyor. Bu ne anlama gelir?",
    a: 'Kârı düşüyor; eksi PEG ucuzluk göstergesi değildir',
    x: [
      'Hisse çok ucuz; PEG ne kadar düşükse o kadar iyidir',
      'Şirket net nakit pozisyonunda; borcundan çok nakdi var',
      "Şirket zarar ediyor; F/K'sı hesaplanamıyor",
    ],
    why: 'PEG = F/K ÷ kâr büyümesi. F/K artıyken PEG\'in eksi çıkması için büyümenin eksi olması, yani kârın gerilemesi gerekir. Tarayıcı eksi PEG\'i "kâr düşüyor" diye eler.',
  },

  /* ---------- Hikâye 5: enflasyon muhasebesi ---------- */
  {
    id: 'enflasyon-parasal-kazanc',
    topic: 'enflasyon',
    q: "Ayşe'nin bankaya 200.000 TL sabit borcu var ve fiyatlar yılda %35 artıyor. Enflasyon muhasebesi (TMS 29 / IAS 29) bunu kâra nasıl yansıtır?",
    a: 'Borcun reel olarak erimesi, net parasal pozisyon kazancı olarak kâra yazılır',
    x: [
      'Borç enflasyon kadar büyütülür ve aradaki fark zarar yazılır',
      'Borcun faizi enflasyon kadar artırılarak kârdan düşülür',
      'Borç özkaynağa aktarılır ve net kâr değişmez',
    ],
    why: 'Sabit bir TL borcun alım gücü enflasyonla azalır. Enflasyon muhasebesi bu erimeyi net parasal pozisyon kazancı (net monetary position gain) olarak kâra yazar; Ayşe tek fincan fazla kahve satmadan net kârı büyür.',
  },
  {
    id: 'enflasyon-ilk-soru',
    topic: 'enflasyon',
    q: 'Bir şirketin net kârı bir yılda sıçramış. Hikâyeye göre ilk sorulacak soru hangisidir?',
    a: 'FAVÖK de büyüdü mü?',
    x: [
      'Fiyat 200 günlük ortalamasının üstünde mi?',
      'Pay sayısı kaç?',
      'Şirketin hissesi hangi piyasada işlem görüyor?',
    ],
    why: 'FAVÖK büyümeden net kâr sıçrıyorsa artış büyük olasılıkla parasal kazançtan ya da tek seferlik bir kalemden geliyordur ve kalıcı olmayabilir. Tarayıcının "Büyüme kalitesi" ölçütü tam bunu sorar.',
  },
  {
    id: 'enflasyon-hesap',
    topic: 'enflasyon',
    q: "Ayşe'nin sabit borcu 200.000 TL, yıllık enflasyon %35. Hikâyedeki basitleştirilmiş hesapla parasal kazanç kaç TL olur?",
    a: '70.000 TL',
    x: ['35.000 TL', '270.000 TL', '7.000 TL'],
    why: '200.000 × %35 = 70.000 TL. Kahve satışından gelen 210.000 TL\'lik kâra eklenince raporlanan net kâr 280.000 TL olur; faaliyet ise aynıdır.',
  },

  /* ---------- Hikâye 6: döngüsellik ---------- */
  {
    id: 'dongu-yaz-ceyregi',
    topic: 'dongu',
    q: "Sahil dondurmacısı yılın tamamında 535.000 TL kazanıyor. Yalnızca yaz çeyreğine bakıp 'çeyrekte 430.000 TL, yılda 1,7 milyon TL eder' diyen biri hangi hatayı yapar?",
    a: 'Kârın zirve dönemini bütün yıla yayar; dükkân olduğundan çok daha ucuz görünür',
    x: [
      'Kış aylarındaki zararı iki kez sayar; dükkân olduğundan pahalı görünür',
      'Parasal kazancı faaliyet kârı sanar; kâr olduğundan düşük görünür',
      'Mevduata ödenen faizi hesaba katmaz; kaldıraç olduğundan düşük görünür',
    ],
    why: 'Yaz çeyreği yılın en iyi dönemidir; dörtle çarpılınca kâr 1,7 milyon TL sanılır ve F/K yapay olarak düşer. Gerçek yıllık kâr 535.000 TL\'dir, çünkü dükkân kışın zarar eder.',
  },
  {
    id: 'dongu-deger-tuzagi',
    topic: 'dongu',
    q: "Hikâyeye göre döngüsel (cyclical) bir işte kârın zirvede olduğu dönem F/K'yı nasıl gösterir?",
    a: 'Yapay olarak düşük; hisse olduğundan ucuz görünür',
    x: [
      'Yapay olarak yüksek; hisse olduğundan pahalı görünür',
      'Değiştirmez; F/K kârın döngüsünden etkilenmez',
      'Hesaplanamaz hâle getirir; döngüsel işlerde F/K eksi çıkar',
    ],
    why: 'F/K\'nın paydasında kâr vardır; kâr zirvedeyken F/K ve PEG düşük çıkar. Kâr normale dönünce çarpan yükselir. Bu, değer tuzağının (value trap) en bilinen hâlidir.',
  },
  {
    id: 'dongu-borsada',
    topic: 'dongu',
    q: 'Dondurmacıda döngü mevsimdir. Hikâyeye göre borsadaki döngüsel şirketlerde kârı aşağı yukarı sürükleyen şey nedir?',
    a: 'Emtia fiyatları, rafineri marjları ya da çelik talebi gibi yıllara yayılan döngüler',
    x: [
      'Şirketin pay sayısındaki değişiklikler',
      'Hissenin 50 günlük ortalamasının 200 günlük ortalamasını kesmesi',
      'Analistlerin hedef fiyatı değiştirmesi',
    ],
    why: 'Rafineri, çelik, madencilik ve havayolu gibi işlerde kâr, şirketin denetimi dışındaki fiyat ve talep döngülerine bağlıdır. Tarayıcı bu sektörlerdeki hisselere "Döngüsel sektör" uyarısı ekler.',
  },

  /* ---------- Hikâye 7: banka mantığı ---------- */
  {
    id: 'banka-favok',
    topic: 'banka',
    q: 'Bankalar neden FAVÖK ve Net borç/FAVÖK ile değerlendirilmez?',
    a: 'Banka borçla çalışır; topladığı mevduat onun hammaddesidir',
    x: [
      'Bankalar net kâr açıklamadığı için',
      'Bankaların özkaynağı olmadığı için',
      'Bankaların payları borsada işlem görmediği için',
    ],
    why: 'Mahalle sandığı 100.000 TL özkaynakla 1 milyon TL mevduat topluyor. Borç bankanın işinin kendisidir; bu yüzden FAVÖK ve net borç anlam taşımaz. Bankada özkaynak kârlılığına, takipteki kredilere ve PD/DD\'ye bakılır.',
  },
  {
    id: 'banka-kaldirac',
    topic: 'banka',
    q: 'Mahalle sandığı kendi parasının 11 katı büyüklüğünde bir bilanço yönetiyor. Geri ödenmeyen krediler biraz artarsa ne olur?',
    a: 'Kaldıraç yüksek olduğu için küçük bir artış bile kârı tamamen silebilir',
    x: [
      'Bir şey olmaz; zararı mevduat sahipleri karşılar',
      'Kâr artar; çünkü sandık kalan kredilerden daha yüksek faiz alır',
      'Yalnızca FAVÖK düşer; net kâr etkilenmez',
    ],
    why: 'Sandığın kârı, verdiği kredinin faizi ile mevduata ödediği faiz arasındaki dar farktan gelir; özkaynağı ise yalnızca 100.000 TL. Geri dönmeyen her kredi doğrudan bu kârdan düşer. Takipteki kredi oranı (NPL) bu yüzden izlenir.',
  },
  {
    id: 'banka-pddd-kurali',
    topic: 'banka',
    q: `Bir bankanın özkaynak kârlılığı (ROE) %24,5, F/K'sı 4,41. "PD/DD ≈ ÖK kârlılığı × F/K" kuralına göre ${T('pd')} yaklaşık kaçtır?`,
    a: '1,08',
    x: ['5,56', '0,18', '10,80'],
    why: '0,245 × 4,41 ≈ 1,08. Aynı F/K\'da özkaynak kârlılığı düşük olan bankanın PD/DD\'si de düşük çıkar; piyasa getirisi düşük bankayı daha ucuz fiyatlar.',
  },
  {
    id: 'banka-car',
    topic: 'banka',
    q: 'Bankalarda sermaye yeterlilik oranı (CAR) neden izlenir?',
    a: 'Bankanın, batan kredilerden doğacak zararı karşılayacak kadar özkaynağı olup olmadığını görmek için',
    x: [
      'Bankanın FAVÖK\'ünün borcunu kaç yılda ödeyeceğini ölçmek için',
      'Hisse fiyatının 200 günlük ortalamasına uzaklığını ölçmek için',
      'Bankanın kâr büyümesinin enflasyonun üstünde olup olmadığını görmek için',
    ],
    why: 'Banka kendi parasının katlarca büyüklüğünde bir bilanço taşır. Krediler batarsa zarar önce özkaynaktan karşılanır; sermaye yeterlilik oranı bu yastığın yeterli olup olmadığını gösterir.',
  },

  /* ---------- Hikâye 8: hareketli ortalama ---------- */
  {
    id: 'sma-hesap',
    topic: 'sma',
    q: 'Bir hissenin 20 günlük hareketli ortalaması (SMA 20) nasıl hesaplanır?',
    a: "Son 20 günün kapanış fiyatları toplanır ve 20'ye bölünür; her gün en eski gün çıkar, yeni gün girer",
    x: [
      'Son 20 günün en yüksek ve en düşük fiyatının ortası alınır',
      'Bugünkü fiyat 20 gün önceki fiyata bölünür',
      'Son 20 günde kaç gün yükseldiği sayılır',
    ],
    why: 'Ayşe her akşam son N günün hasılatını toplayıp N\'ye bölüyordu. Borsada günlük hasılatın yerini günlük kapanış fiyatı (closing price) alır; hesap aynıdır.',
  },
  {
    id: 'sma-pencere',
    topic: 'sma',
    q: 'Kısa pencereli (20 gün) ve uzun pencereli (200 gün) ortalamalar birbirinden nasıl ayrılır?',
    a: 'Kısa pencere hızlı tepki verir ama sık yanıltır; uzun pencere sakindir ama geç kalır',
    x: [
      'Kısa pencere geç kalır; uzun pencere dönüşü önceden haber verir',
      'Uzun pencere günlük sıçramaları daha yakından izler',
      'Pencere uzadıkça ortalama gecikmeden kurtulur',
    ],
    why: 'Ortalama her zaman geriden gelir ve pencere uzadıkça gecikme büyür. Yol çalışması bittikten sonra hasılat toparlanırken 20 günlük ortalama dönüşü 200 günlükten çok daha önce gösterir, ama günlük gürültüye de daha çok kapılır.',
  },
  {
    id: 'sma-altin-kesisim',
    topic: 'sma',
    q: `${T('goldenCross')} nedir?`,
    a: '50 günlük ortalamanın 200 günlük ortalamayı aşağıdan yukarı kesmesi',
    x: [
      '50 günlük ortalamanın 200 günlük ortalamayı yukarıdan aşağı kesmesi',
      "Fiyatın 20 günlük ortalamaya eşit olması",
      "F/K'nın sektör ortancasının altına inmesi",
    ],
    why: 'Kısa ortalama uzunu yukarı keserse altın kesişim (golden cross), aşağı keserse ölüm kesişimi (death cross) denir. İkisi de geriden gelir: dönüşü olduktan sonra gösterir.',
  },
  {
    id: 'sma-deger-degil',
    topic: 'sma',
    q: 'Bir hissenin fiyatı 200 günlük ortalamasının üstünde. Bu bilgi ne söyler?',
    a: 'Eğilimin (trend) bir süredir yukarı olduğunu; hissenin ucuz ya da pahalı olduğunu söylemez',
    x: [
      'Hissenin değerinin altında fiyatlandığını',
      'Şirketin kârının arttığını',
      'Net borcunun azaldığını',
    ],
    why: 'Hareketli ortalama şirketin rakamlarına bakmaz, yalnızca fiyatın yönünü gösterir: eğilimi gösterir, değeri değil. Bu yüzden kârın gerçekliğinden, bilançodan ve çarpanlardan sonra gelir.',
  },
  {
    id: 'sma-tl-enflasyon',
    topic: 'sma',
    q: 'Bir BIST hissesinin TL fiyatının 200 günlük ortalamasının üstünde olması neden göründüğünden zayıf bir kanıttır?',
    a: 'Fiyatlar enflasyonla birlikte yükseldiği için TL fiyat ortalamanın üstüne kolayca çıkar',
    x: [
      "BIST hisselerinde 200 günlük ortalama hesaplanamadığı için",
      'TL fiyatlar gün içinde değişmediği için',
      "BIST'te kapanış fiyatı açıklanmadığı için",
    ],
    why: 'Ayşe kahveye zam yapınca hasılat da ortalamanın üstüne çıkar, ama daha çok kahve satmış olmaz. Enflasyonun yüksek olduğu bir para biriminde fiyatın ortalamanın üstünde olması tek başına güçlü bir eğilim kanıtı değildir.',
  },

  /* ---------- Hikâye 9: iki ayrı piyasa ---------- */
  {
    id: 'piyasa-kazanc-verimi',
    topic: 'piyasa',
    q: "F/K'sı 14,3 olan bir kahvecinin kazanç verimi (earnings yield) yaklaşık yüzde kaçtır?",
    a: '%7',
    x: ['%14,3', '%0,7', '%70'],
    why: 'Kazanç verimi F/K\'nın tersidir: 1 ÷ 14,3 ≈ %7. Ödediğiniz her 100 liranın yılda yaklaşık 7 lira kâr ürettiğini söyler.',
  },
  {
    id: 'piyasa-ayni-fk',
    topic: 'piyasa',
    q: "Ayşe'nin ve Deniz'in kahvecilerinin F/K'sı aynı: 14,3. Aynı F/K neden Türkiye'de ve ABD'de aynı şeyi söylemez?",
    a: 'Kazanç verimi o para birimindeki faizle kıyaslanır; TL faizi ile dolar faizi çok farklıdır',
    x: [
      "ABD'de F/K hesaplanırken net kâr yerine FAVÖK kullanıldığı için",
      "Dolar kazanan şirketlerde pay sayısı F/K'ya katılmadığı için",
      "F/K yalnızca TL kazanan şirketlerde anlamlı olduğu için",
    ],
    why: '%7\'lik kazanç verimi, faizin %4 olduğu yerde yeterli, %35 olduğu yerde az görünür. Alıcı kârı, parasını aynı para biriminde faize yatırsa alacağı getiriyle (risksiz faiz, risk-free rate) kıyaslar.',
  },
  {
    id: 'piyasa-nominal-buyume',
    topic: 'piyasa',
    q: "Ayşe'nin kârı TL olarak %40, Deniz'in kârı dolar olarak %7 büyüyor; enflasyon düşülünce ikisi de yaklaşık %4 büyümüş oluyor. PEG neden Ayşe'yi çok daha ucuz gösterir?",
    a: 'PEG nominal büyümeyi kullanır; TL kâr büyümesinin içinde enflasyon vardır',
    x: [
      "Ayşe'nin F/K'sı Deniz'inkinden düşük olduğu için",
      "Deniz'in borcu daha yüksek olduğu için",
      "PEG dolar kazanan şirketlerde hesaplanamadığı için",
    ],
    why: 'İki dükkânın F/K\'sı aynı; fark paydadaki büyümeden geliyor. %40\'lık TL büyümenin büyük kısmı enflasyondur. Nominal büyümeden (nominal growth) hesaplanan PEG, dolar kazanan bir şirketinkiyle yan yana konamaz.',
  },
  {
    id: 'piyasa-ayri-tablo',
    topic: 'piyasa',
    q: 'Tarayıcı BIST ve ABD hisselerini neden hiçbir zaman aynı tabloya ve aynı sektör ortancasına koymaz?',
    a: 'Faiz, enflasyon, muhasebe kuralları ve para birimi farklı olduğu için aynı çarpan iki piyasada aynı şeyi söylemez',
    x: [
      'İki borsanın işlem saatleri farklı olduğu için',
      'ABD hisselerinin çarpanları hesaplanamadığı için',
      'BIST hisselerinin sayısı daha az olduğu için',
    ],
    why: 'Bir hisse kendi piyasasındaki ve kendi sektöründeki benzerleriyle kıyaslanır. Her piyasanın kendi tablosu ve kendi sektör ortancası (industry median) vardır.',
  },

  /* ---------- Karar adımları ---------- */
  {
    id: 'adim-sira',
    topic: 'adim',
    q: 'Karar adımlarına göre bir hisseye bakarken fiyat çarpanları (F/K, PD/DD, FD/FAVÖK) ne zaman okunur?',
    a: 'Kârın gerçek, bilançonun sağlam olduğu görüldükten sonra',
    x: [
      'En başta; çarpan düşükse başka bir şeye bakmaya gerek kalmaz',
      'Hareketli ortalamalardan sonra; önce fiyatın yönüne bakılır',
      'Yalnızca şirket zarar ediyorsa',
    ],
    why: 'Sıra önemlidir: önce şirketin işi, sonra kârın gerçekliği, sonra bilanço; fiyat sorusu ondan sonra gelir. Hareketli ortalama ise en sonda, zamanlama için yardımcı bir bilgidir.',
  },
];

/** Hazır soru bankası; doğru yanıt her soruda ilk sıradadır, oyunda karıştırılır. */
export const BANK: QuizQuestion[] = ITEMS.map((it) => ({
  id: it.id,
  kind: 'concept',
  topic: TOPICS[it.topic].label,
  q: it.q,
  options: [it.a, ...it.x],
  correct: 0,
  why: it.why,
  ref: TOPICS[it.topic].ref,
}));

/** Sorunun konu kimliği (tur kurulurken konuları dengelemek için) */
export const topicOf = (id: string): TopicId | null => ITEMS.find((it) => it.id === id)?.topic ?? null;
