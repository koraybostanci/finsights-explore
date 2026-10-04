/**
 * İstemler (prompts): Hisse yorumu ve Sektör karşılaştırması.
 *
 * Saf işlevlerdir. Modele yalnızca uygulamadaki rakamlar ve kural sonuçları
 * verilir; model rakam üretmez, yalnızca açıklar. İstem metni değişirse
 * PROMPT_VERSION artırılır, böylece eski önbellek kayıtları kullanılmaz.
 */

import { VLABEL } from '../lib/evaluate.ts';
import { noteIsCurrent } from '../lib/note.ts';
import { distancePct, lastCross, lastSma, trend } from '../lib/sma.ts';
import { TERMS } from '../terms.ts';
import type { Evaluation, IndustryMedian, StockView } from '../types.ts';
import type { IndustryCompareInput, StockCommentInput } from './types.ts';

export const PROMPT_VERSION = 2;

export interface Prompt {
  system: string;
  user: string;
  maxTokens: number;
}

/** Hikâyeler: modelin bağ kurabileceği adlar ve her birinin öğrettiği şey. */
export const STORIES = {
  ayse: "Ayşe'nin Kahvesi: bilanço (balance sheet), gelir tablosu (income statement) ve fiyat. Çarpanlar şirketi değil fiyatı ölçer; kâr ve özkaynak aynı kalsa bile fiyat değişince bütün çarpanlar değişir.",
  kose: 'Köşe Kahvecisi: borçsuz ama yılda %5 büyüyen dükkân; F/K düşük görünse de PEG yüksek çıkar.',
  zincir: 'Zincir Kahve: büyümesi faaliyetten gelen ama şubeleri krediyle açan dükkân; PEG cazip, borç yüksek.',
  filmSeti:
    'Film Seti Kahvesi: kârı tek seferlik bir kira geliriyle sıçrayan dükkân; PEG çok düşük görünür ama büyüme kalıcı değildir (baz etkisi, tek seferlik kalem).',
  enflasyon:
    'Kahve satmadan gelen kâr: enflasyon muhasebesinde (IAS 29) borcun reel erimesi net parasal pozisyon kazancı olarak kâra yazılır. Net kâr sıçradıysa ilk soru: FAVÖK de büyüdü mü? Yalnızca BIST hisseleri için geçerlidir.',
  dondurmaci:
    'Sahil dondurmacısı: döngüsel işte kârın zirvede olduğu dönem F/K ve PEG yapay olarak düşük görünür; değer tuzağı (value trap).',
  sandik:
    'Mahalle sandığı: banka borçla çalışır; FAVÖK ve net borç anlamsızdır. Özkaynak kârlılığına, takipteki kredilere ve PD/DD ≈ ÖK kârlılığı × F/K ilişkisine bakılır.',
  hasilat:
    "Günlük hasılat ve hareketli ortalama: Ayşe'nin Kahvesi'nin günlük hasılatı inişli çıkışlıdır; ortalama gürültüyü süzer ama değişimi gecikmeyle gösterir. Ortalama, şirketin ucuz ya da pahalı olduğunu söylemez.",
  ikiUlke:
    'İki ülke, iki kahveci: aynı F/K, faizi ve enflasyonu farklı iki ülkede aynı şeyi söylemez; bu yüzden BIST ve ABD hisseleri ayrı okunur.',
} as const;

export type StoryId = keyof typeof STORIES;

function systemPrompt(minWords: number, maxWords: number): string {
  return [
    'Sen "finsights.explore" adlı öğrenme uygulamasının öğretmenisin. Okur hisse değerlemeyi bir kahvecinin hikâyeleriyle öğrendi; şimdi aynı mantığı gerçek hisselere uyguluyor. Görevin rakamları açıklamak: ne söylüyorlar, neyi söylemiyorlar ve sıradaki soru ne olmalı.',
    '',
    'Okurun bildiği hikâyeler:',
    ...Object.values(STORIES).map((s) => `- ${s}`),
    '',
    'Kurallar:',
    '1. Yalnızca sana verilen verideki sayıları kullan. Veride olmayan hiçbir rakam, tarih, haber, beklenti ya da şirket bilgisi ekleme. Eksik veri için "veri yok" de; tahmin yürütme.',
    '2. Al, sat, tut, ekle ya da azalt deme; hedef fiyat verme; fiyatın nereye gideceğini söyleme. Bu bir yatırım tavsiyesi değildir.',
    '3. Düz metin yaz: kısa paragraflar, aralarında bir boş satır. Başlık, liste, madde imi, kalın yazı, markdown ve emoji kullanma.',
    '4. Türkçe yaz, okura "siz" diye seslen. Sakin ve sade bir öğretmen sesi kullan; abartılı sıfatlardan kaçın.',
    '5. Her teknik terimin ilk geçtiği yerde İngilizce karşılığını parantez içinde ver, ör. F/K (P/E). Sonraki geçişlerde yalnızca Türkçesini yaz.',
    '6. Sayıları Türkçe yazımla yaz: ondalık ayırıcı virgül (3,60), yüzde imi başta (%25).',
    '7. Bir hikâyeyle yalnızca gerçekten uyuyorsa ve adını anarak bağ kur; uymuyorsa hiç anma. Veride "uyanHikayeler" doluysa oradakilerden seç.',
    '8. BIST ve ABD hisselerini birbiriyle kıyaslama. Kıyas yalnızca aynı piyasadaki aynı sektörle yapılır.',
    `9. Uzunluk: ${minWords}–${maxWords} kelime.`,
  ].join('\n');
}

/** Terim sözlüğü, modele tek satır hâlinde: "F/K = P/E; PD/DD = P/B; …" */
export function termLine(ids: string[]): string {
  return ids
    .map((id) => TERMS[id])
    .filter((t) => t && t.tr !== t.en)
    .map((t) => `${t.tr} = ${t.en}`)
    .join('; ');
}

export const STOCK_TERMS = ['fk', 'pd', 'fdf', 'nb', 'fg', 'ng', 'roe', 'mv', 'target', 'median', 'industry', 'cyclical', 'sma', 'goldenCross', 'deathCross', 'trend'];
const BANK_TERMS = ['npl', 'car', 'nim'];

/** Sayıyı JSON için yuvarlar; boş ya da geçersiz değer null olur. */
const r = (v: number | null | undefined, d = 2): number | null =>
  v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d;

const VERDICT_TR = { good: 'geçti', warn: 'uyarı', bad: 'kaldı', na: 'ayrı değerlendirilir' } as const;

export function stockFigures(s: StockView): Record<string, unknown> {
  const out: Record<string, unknown> = {
    sembol: s.k,
    ad: s.ad,
    fiyat: r(s.f),
    fk: r(s.fk),
    pddd: r(s.pd),
    fdFavok: r(s.fdf),
    peg: r(s.peg),
    netBorcFavok: r(s.nb),
    favokBuyumeYuzde: r(s.fg, 1),
    netKarBuyumeYuzde: r(s.ng, 1),
    yaklasikOzkaynakKarliligiYuzde: r(s.roe, 1),
    piyasaDegeriMilyar: r(s.mv, 1),
  };
  if (s.fk == null) out.fkNotu = s.loss ? 'son 12 ayda zarar' : 'veri yok (zarar mı, eksik veri mi bilinmiyor)';
  if (s.fg == null && s.fgT) out.favokBuyumeNotu = s.fgT;
  if (s.ng == null && s.ngT) out.netKarBuyumeNotu = s.ngT;
  return out;
}

export function evaluationSummary(e: Evaluation): Record<string, unknown> {
  return {
    sonuc: VLABEL[e.verdict],
    olcutler: e.checks.map((c) => ({ olcut: c.n, durum: VERDICT_TR[c.st], gerekce: c.t })),
  };
}

function medianFigures(m: IndustryMedian): Record<string, unknown> {
  return {
    ortancayaGirenHisseSayisi: m.n,
    fk: r(m.fk),
    pddd: r(m.pd),
    fdFavok: r(m.fdf),
    peg: r(m.peg),
    netBorcFavok: r(m.nb),
    favokBuyumeYuzde: r(m.fg, 1),
    netKarBuyumeYuzde: r(m.ng, 1),
    yaklasikOzkaynakKarliligiYuzde: r(m.roe, 1),
  };
}

const TREND_TR = { up: 'yukarı (fiyat > SMA 50 > SMA 200)', down: 'aşağı (fiyat < SMA 50 < SMA 200)', mixed: 'karışık' } as const;

/** Hareketli ortalamalar: önce verideki değerler, yoksa fiyat serisinden hesap. Hiçbiri yoksa null. */
export function smaFigures(input: StockCommentInput): Record<string, unknown> | null {
  const s = input.stock;
  const closes = input.prices && input.prices.c.length ? input.prices.c : null;
  const pick = (stored: number | null, n: number): number | null => stored ?? (closes ? lastSma(closes, n) : null);
  const sma20 = pick(s.sma20, 20);
  const sma50 = pick(s.sma50, 50);
  const sma200 = pick(s.sma200, 200);
  if (sma20 == null && sma50 == null && sma200 == null) return null;
  const tr = trend(s.f, sma50, sma200);
  const cross = closes ? lastCross(closes) : null;
  const out: Record<string, unknown> = {
    sma20: r(sma20),
    sma50: r(sma50),
    sma200: r(sma200),
    fiyatinSma50yeUzakligiYuzde: r(distancePct(s.f, sma50), 1),
    fiyatinSma200eUzakligiYuzde: r(distancePct(s.f, sma200), 1),
    egilim: tr ? TREND_TR[tr] : null,
  };
  if (closes)
    out.son60GundeKesisim = cross ? (cross.kind === 'golden' ? 'altın kesişim (golden cross)' : 'ölüm kesişimi (death cross)') : 'yok';
  return out;
}

/** Veriye göre hangi hikâyelerin gerçekten uyduğu; model bunların dışına çıkmasın diye verilir. */
export function matchingStories(s: StockView, e: Evaluation): StoryId[] {
  const out: StoryId[] = [];
  if (!s.hasData) return out;
  if (s.bank) return ['sandik'];
  if (s.cyclical) out.push('dondurmaci');
  const baseEffect = (s.peg != null && s.peg > 0 && s.peg <= 0.15) || (s.fg != null && s.ng == null && !!s.ngT);
  const gap = s.fg != null && s.ng != null && s.ng > s.fg + 50;
  if (baseEffect || gap) out.push('filmSeti');
  if (gap && s.market === 'BIST') out.push('enflasyon');
  const debtHigh = e.checks.some((c) => c.n === 'Borç' && c.st === 'bad');
  const growthOk = e.checks.some((c) => c.n === 'Büyüme kalitesi' && c.st === 'good');
  if (debtHigh && growthOk && s.peg != null && s.peg > 0.15 && s.peg <= 1) out.push('zincir');
  if (s.fk != null && s.peg != null && s.peg > 1 && s.nb != null && s.nb <= 0) out.push('kose');
  return out;
}

const storyName = (id: StoryId): string => STORIES[id].split(':')[0];

export interface PromptContext {
  /** Hissenin piyasasındaki verinin tarihi (marketAsOf) */
  asOf: string;
}

/** Hisse yorumu istemi */
export function stockPrompt(input: StockCommentInput, ctx: PromptContext): Prompt {
  const s = input.stock;
  const sma = smaFigures(input);
  const hisse: Record<string, unknown> = {
    ...stockFigures(s),
    sektor: s.sek,
    sektorIngilizce: s.sekEn,
    dongusel: s.cyclical,
    banka: !!s.bank,
    veriVar: s.hasData,
    analistHedefFiyati: r(s.h),
  };
  if (s.usd) hisse.fonksiyonelParaBirimi = s.usd;
  if (s.bank) {
    hisse.takiptekiKrediOraniYuzde = r(s.npl);
    hisse.sermayeYeterlilikOraniYuzde = r(s.car);
    hisse.netFaizMarjiYuzde = r(s.nim);
  }
  // Elle yazılmış yorum yalnızca yazıldığı günün verisiyle birlikte verilir; veri yenilendiyse çelişebilir.
  if (s.not && noteIsCurrent(s.notAsOf, ctx.asOf)) {
    hisse.elleYazilmisNot = s.not;
    if (s.notAsOf) hisse.notTarihi = s.notAsOf;
  }
  const payload = {
    veriTarihi: ctx.asOf,
    piyasa: s.market,
    paraBirimi: s.cur,
    hisse,
    kuralSonucu: evaluationSummary(input.evaluation),
    sektorOrtancasi: input.median && input.median.n > 0 ? medianFigures(input.median) : null,
    hareketliOrtalamalar: sma,
    uyanHikayeler: matchingStories(s, input.evaluation).map(storyName),
  };
  const terms = termLine(s.bank ? [...STOCK_TERMS, ...BANK_TERMS] : STOCK_TERMS);
  const user = [
    `Görev: Hisse yorumu. ${s.k} (${s.ad}) için 110–170 kelimelik bir yorum yazın.`,
    'Sırasıyla şunlara değinin: çarpanları ne söylüyor; kural sonuçları, özellikle uyarı ve kalma nedenleri ne anlama geliyor; hisse kendi sektör ortancasına (median) göre nerede duruyor; hareketli ortalamalar ne gösteriyor. Son cümle, okurun bundan sonra sorması gereken tek bir soru olsun.',
    'sektorOrtancasi ya da hareketliOrtalamalar null ise o konuyu tek cümleyle "veri yok" diye geçin. Ortancaya giren hisse sayısı 1 ya da 2 ise kıyasın zayıf olduğunu söyleyin.',
    '',
    `Terimler (Türkçe = İngilizce): ${terms}`,
    '',
    'Veri (JSON):',
    JSON.stringify(payload),
  ].join('\n');
  return { system: systemPrompt(110, 170), user, maxTokens: 1000 };
}

/** Sektör karşılaştırması istemi. Başka piyasadan satır gelirse dışarıda bırakılır. */
export function industryPrompt(input: IndustryCompareInput, ctx: PromptContext): Prompt {
  const rows = input.rows.filter((row) => row.stock.market === input.market);
  const withData = rows.filter((row) => row.stock.hasData);
  const noData = rows.filter((row) => !row.stock.hasData).map((row) => row.stock.k);
  const payload = {
    veriTarihi: ctx.asOf,
    piyasa: input.market,
    paraBirimi: rows[0]?.stock.cur ?? null,
    sektor: { ad: input.industry.tr, ingilizce: input.industry.en, dongusel: input.industry.cyclical },
    sektorOrtancasi: input.median.n > 0 ? medianFigures(input.median) : null,
    hisseler: withData.map((row) => ({
      ...stockFigures(row.stock),
      sonuc: VLABEL[row.evaluation.verdict],
      dikkat: row.evaluation.checks.filter((c) => c.st === 'warn' || c.st === 'bad').map((c) => c.s),
      ...(row.stock.usd ? { fonksiyonelParaBirimi: row.stock.usd } : {}),
    })),
    verisiOlmayanHisseler: noData,
  };
  const banks = rows.some((row) => row.stock.bank);
  const terms = termLine(banks ? [...STOCK_TERMS, ...BANK_TERMS] : STOCK_TERMS);
  const user = [
    `Görev: Sektör karşılaştırması. ${input.market} piyasasındaki ${input.industry.tr} (${input.industry.en}) sektörünün hisselerini 130–200 kelimeyle karşılaştırın.`,
    'Hisseleri tek tek anlatmayın; aralarındaki farklardan hangilerinin önemli olduğunu ve nedenini söyleyin (ör. F/K düşük ama kârı gerileyen; borcu yüksek olan; büyümesi faaliyetten gelmeyen). Sektör döngüselse bunun çarpanları nasıl etkilediğini belirtin.',
    'verisiOlmayanHisseler doluysa bu hisselerin adını anıp verilerinin henüz gelmediğini söyleyin; onlar hakkında başka bir şey yazmayın. Verisi olan tek hisse varsa kıyas yapılamadığını söyleyin.',
    'Son cümle, okurun bu sektörde bundan sonra bakması gereken tek bir şey olsun.',
    '',
    `Terimler (Türkçe = İngilizce): ${terms}`,
    '',
    'Veri (JSON):',
    JSON.stringify(payload),
  ].join('\n');
  return { system: systemPrompt(130, 200), user, maxTokens: 1200 };
}
