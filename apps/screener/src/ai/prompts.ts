/**
 * Prompts for the stock comment and the industry comparison.
 *
 * Pure functions. The model is given only the app's figures and rule results; it
 * produces no numbers, it only explains. When the prompt text changes,
 * PROMPT_VERSION is bumped so old cache entries are not reused.
 */

import { VLABEL } from '../lib/evaluate.ts';
import { noteIsCurrent } from '../lib/note.ts';
import { distancePct, lastCross, lastSma, trend } from '@fintools/shared/sma';
import { TERMS } from '@fintools/shared/terms';
import type { Evaluation, IndustryMedian, StockView } from '../types.ts';
import type { IndustryCompareInput, StockCommentInput } from './types.ts';

export const PROMPT_VERSION = 3;

export interface Prompt {
  system: string;
  user: string;
  maxTokens: number;
}

/** The stories: the names the model may refer to and what each one teaches. The model sees only the text before the colon (the name). */
export const STORIES = {
  aysesCoffee: "Ayşe'nin Kahvesi: bilanço (balance sheet), gelir tablosu (income statement) ve fiyat. Çarpanlar şirketi değil fiyatı ölçer; kâr ve özkaynak aynı kalsa bile fiyat değişince bütün çarpanlar değişir.",
  cornerCafe: 'Köşe Kahvecisi: borçsuz ama yılda %5 büyüyen dükkân; F/K düşük görünse de PEG yüksek çıkar.',
  chainCafe: 'Zincir Kahve: büyümesi faaliyetten gelen ama şubeleri krediyle açan dükkân; PEG cazip, borç yüksek.',
  filmSetCafe:
    'Film Seti Kahvesi: kârı tek seferlik bir kira geliriyle sıçrayan dükkân; PEG çok düşük görünür ama büyüme kalıcı değildir (baz etkisi, tek seferlik kalem).',
  inflationProfit:
    'Kahve satmadan gelen kâr: enflasyon muhasebesinde (IAS 29) borcun reel erimesi net parasal pozisyon kazancı olarak kâra yazılır. Net kâr sıçradıysa ilk soru: FAVÖK de büyüdü mü? Yalnızca BIST hisseleri için geçerlidir.',
  beachIcecream:
    'Sahil dondurmacısı: döngüsel işte kârın zirvede olduğu dönem F/K ve PEG yapay olarak düşük görünür; değer tuzağı (value trap).',
  neighborhoodFund:
    'Mahalle sandığı: banka borçla çalışır; FAVÖK ve net borç anlamsızdır. Özkaynak kârlılığına, takipteki kredilere ve PD/DD ≈ ÖK kârlılığı × F/K ilişkisine bakılır.',
  dailyRevenue:
    "Günlük hasılat ve hareketli ortalama: Ayşe'nin Kahvesi'nin günlük hasılatı inişli çıkışlıdır; ortalama gürültüyü süzer ama değişimi gecikmeyle gösterir. Ortalama, şirketin ucuz ya da pahalı olduğunu söylemez.",
  twoCountries:
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
    '7. Bir hikâyeyle yalnızca gerçekten uyuyorsa ve adını anarak bağ kur; uymuyorsa hiç anma. Veride "matchingStories" doluysa oradakilerden seç.',
    '8. BIST ve ABD hisselerini birbiriyle kıyaslama. Kıyas yalnızca aynı piyasadaki aynı sektörle yapılır.',
    `9. Uzunluk: ${minWords}–${maxWords} kelime.`,
  ].join('\n');
}

/** The term dictionary as a single line for the model: "F/K = P/E; PD/DD = P/B; …" */
export function termLine(ids: string[]): string {
  return ids
    .map((id) => TERMS[id])
    .filter((t) => t && t.tr !== t.en)
    .map((t) => `${t.tr} = ${t.en}`)
    .join('; ');
}

export const STOCK_TERMS = ['pe', 'pb', 'evEbitda', 'netDebtEbitda', 'ebitdaGrowth', 'netIncomeGrowth', 'roe', 'marketCap', 'target', 'median', 'industry', 'cyclical', 'sma', 'goldenCross', 'deathCross', 'trend'];
const BANK_TERMS = ['npl', 'car', 'nim'];

/** Rounds a number for JSON; an empty or invalid value becomes null. */
const r = (v: number | null | undefined, d = 2): number | null =>
  v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d;

const VERDICT_TR = { good: 'geçti', warn: 'uyarı', bad: 'kaldı', na: 'ayrı değerlendirilir' } as const;

export function stockFigures(s: StockView): Record<string, unknown> {
  const out: Record<string, unknown> = {
    symbol: s.symbol,
    name: s.name,
    price: r(s.price),
    pe: r(s.pe),
    pb: r(s.pb),
    evEbitda: r(s.evEbitda),
    peg: r(s.peg),
    netDebtEbitda: r(s.netDebtEbitda),
    ebitdaGrowthPct: r(s.ebitdaGrowth, 1),
    netIncomeGrowthPct: r(s.netIncomeGrowth, 1),
    approxRoePct: r(s.roe, 1),
    marketCapBillions: r(s.marketCap, 1),
  };
  if (s.pe == null) out.peNote = s.loss ? 'son 12 ayda zarar' : 'veri yok (zarar mı, eksik veri mi bilinmiyor)';
  if (s.ebitdaGrowth == null && s.ebitdaGrowthNote) out.ebitdaGrowthNote = s.ebitdaGrowthNote;
  if (s.netIncomeGrowth == null && s.netIncomeGrowthNote) out.netIncomeGrowthNote = s.netIncomeGrowthNote;
  return out;
}

export function evaluationSummary(e: Evaluation): Record<string, unknown> {
  return {
    result: VLABEL[e.verdict],
    checks: e.checks.map((c) => ({ check: c.label, status: VERDICT_TR[c.status], reason: c.long })),
  };
}

function medianFigures(m: IndustryMedian): Record<string, unknown> {
  return {
    stocksInMedian: m.n,
    pe: r(m.pe),
    pb: r(m.pb),
    evEbitda: r(m.evEbitda),
    peg: r(m.peg),
    netDebtEbitda: r(m.netDebtEbitda),
    ebitdaGrowthPct: r(m.ebitdaGrowth, 1),
    netIncomeGrowthPct: r(m.netIncomeGrowth, 1),
    approxRoePct: r(m.roe, 1),
  };
}

const TREND_TR = { up: 'yukarı (fiyat > SMA 50 > SMA 200)', down: 'aşağı (fiyat < SMA 50 < SMA 200)', mixed: 'karışık' } as const;

/** Moving averages: stored values first, otherwise computed from the price series. Null when there are none. */
export function smaFigures(input: StockCommentInput): Record<string, unknown> | null {
  const s = input.stock;
  const closes = input.prices && input.prices.closes.length ? input.prices.closes : null;
  const pick = (stored: number | null, n: number): number | null => stored ?? (closes ? lastSma(closes, n) : null);
  const sma20 = pick(s.sma20, 20);
  const sma50 = pick(s.sma50, 50);
  const sma200 = pick(s.sma200, 200);
  if (sma20 == null && sma50 == null && sma200 == null) return null;
  const tr = trend(s.price, sma50, sma200);
  const cross = closes ? lastCross(closes) : null;
  const out: Record<string, unknown> = {
    sma20: r(sma20),
    sma50: r(sma50),
    sma200: r(sma200),
    priceDistanceFromSma50Pct: r(distancePct(s.price, sma50), 1),
    priceDistanceFromSma200Pct: r(distancePct(s.price, sma200), 1),
    trend: tr ? TREND_TR[tr] : null,
  };
  if (closes)
    out.crossLast60Days = cross ? (cross.kind === 'golden' ? 'altın kesişim (golden cross)' : 'ölüm kesişimi (death cross)') : 'yok';
  return out;
}

/** Which stories really fit the data; passed in so the model does not stray outside them. */
export function matchingStories(s: StockView, e: Evaluation): StoryId[] {
  const out: StoryId[] = [];
  if (!s.hasData) return out;
  if (s.bank) return ['neighborhoodFund'];
  if (s.cyclical) out.push('beachIcecream');
  const baseEffect = (s.peg != null && s.peg > 0 && s.peg <= 0.15) || (s.ebitdaGrowth != null && s.netIncomeGrowth == null && !!s.netIncomeGrowthNote);
  const gap = s.ebitdaGrowth != null && s.netIncomeGrowth != null && s.netIncomeGrowth > s.ebitdaGrowth + 50;
  if (baseEffect || gap) out.push('filmSetCafe');
  if (gap && s.market === 'BIST') out.push('inflationProfit');
  const debtHigh = e.checks.some((c) => c.id === 'debt' && c.status === 'bad');
  const growthOk = e.checks.some((c) => c.id === 'growthQuality' && c.status === 'good');
  if (debtHigh && growthOk && s.peg != null && s.peg > 0.15 && s.peg <= 1) out.push('chainCafe');
  if (s.pe != null && s.peg != null && s.peg > 1 && s.netDebtEbitda != null && s.netDebtEbitda <= 0) out.push('cornerCafe');
  return out;
}

const storyName = (id: StoryId): string => STORIES[id].split(':')[0];

export interface PromptContext {
  /** Date of the data in the stock's market (marketAsOf) */
  asOf: string;
}

/** Stock comment prompt */
export function stockPrompt(input: StockCommentInput, ctx: PromptContext): Prompt {
  const s = input.stock;
  const sma = smaFigures(input);
  const stock: Record<string, unknown> = {
    ...stockFigures(s),
    industry: s.industryTr,
    industryEn: s.industryEn,
    cyclical: s.cyclical,
    bank: !!s.bank,
    hasData: s.hasData,
    analystTargetPrice: r(s.targetPrice),
  };
  if (s.usd) stock.functionalCurrency = s.usd;
  if (s.bank) {
    stock.nplPct = r(s.npl);
    stock.carPct = r(s.car);
    stock.nimPct = r(s.nim);
  }
  // The hand-written comment is passed only together with the data of the day it was written; once the data is refreshed it may contradict it.
  if (s.note && noteIsCurrent(s.noteAsOf, ctx.asOf)) {
    stock.handwrittenNote = s.note;
    if (s.noteAsOf) stock.noteDate = s.noteAsOf;
  }
  const payload = {
    dataDate: ctx.asOf,
    market: s.market,
    currency: s.currency,
    stock,
    ruleResult: evaluationSummary(input.evaluation),
    industryMedian: input.median && input.median.n > 0 ? medianFigures(input.median) : null,
    movingAverages: sma,
    matchingStories: matchingStories(s, input.evaluation).map(storyName),
  };
  const terms = termLine(s.bank ? [...STOCK_TERMS, ...BANK_TERMS] : STOCK_TERMS);
  const user = [
    `Görev: Hisse yorumu. ${s.symbol} (${s.name}) için 110–170 kelimelik bir yorum yazın.`,
    'Sırasıyla şunlara değinin: çarpanları ne söylüyor; kural sonuçları, özellikle uyarı ve kalma nedenleri ne anlama geliyor; hisse kendi sektör ortancasına (median) göre nerede duruyor; hareketli ortalamalar ne gösteriyor. Son cümle, okurun bundan sonra sorması gereken tek bir soru olsun.',
    'industryMedian ya da movingAverages null ise o konuyu tek cümleyle "veri yok" diye geçin. Ortancaya giren hisse sayısı 1 ya da 2 ise kıyasın zayıf olduğunu söyleyin.',
    '',
    `Terimler (Türkçe = İngilizce): ${terms}`,
    '',
    'Veri (JSON):',
    JSON.stringify(payload),
  ].join('\n');
  return { system: systemPrompt(110, 170), user, maxTokens: 1000 };
}

/** Industry comparison prompt. Rows from another market are left out. */
export function industryPrompt(input: IndustryCompareInput, ctx: PromptContext): Prompt {
  const rows = input.rows.filter((row) => row.stock.market === input.market);
  const withData = rows.filter((row) => row.stock.hasData);
  const noData = rows.filter((row) => !row.stock.hasData).map((row) => row.stock.symbol);
  const payload = {
    dataDate: ctx.asOf,
    market: input.market,
    currency: rows[0]?.stock.currency ?? null,
    industry: { name: input.industry.nameTr, nameEn: input.industry.nameEn, cyclical: input.industry.cyclical },
    industryMedian: input.median.n > 0 ? medianFigures(input.median) : null,
    stocks: withData.map((row) => ({
      ...stockFigures(row.stock),
      result: VLABEL[row.evaluation.verdict],
      warnings: row.evaluation.checks.filter((c) => c.status === 'warn' || c.status === 'bad').map((c) => c.short),
      ...(row.stock.usd ? { functionalCurrency: row.stock.usd } : {}),
    })),
    stocksWithoutData: noData,
  };
  const banks = rows.some((row) => row.stock.bank);
  const terms = termLine(banks ? [...STOCK_TERMS, ...BANK_TERMS] : STOCK_TERMS);
  const user = [
    `Görev: Sektör karşılaştırması. ${input.market} piyasasındaki ${input.industry.nameTr} (${input.industry.nameEn}) sektörünün hisselerini 130–200 kelimeyle karşılaştırın.`,
    'Hisseleri tek tek anlatmayın; aralarındaki farklardan hangilerinin önemli olduğunu ve nedenini söyleyin (ör. F/K düşük ama kârı gerileyen; borcu yüksek olan; büyümesi faaliyetten gelmeyen). Sektör döngüselse bunun çarpanları nasıl etkilediğini belirtin.',
    'stocksWithoutData doluysa bu hisselerin adını anıp verilerinin henüz gelmediğini söyleyin; onlar hakkında başka bir şey yazmayın. Verisi olan tek hisse varsa kıyas yapılamadığını söyleyin.',
    'Son cümle, okurun bu sektörde bundan sonra bakması gereken tek bir şey olsun.',
    '',
    `Terimler (Türkçe = İngilizce): ${terms}`,
    '',
    'Veri (JSON):',
    JSON.stringify(payload),
  ].join('\n');
  return { system: systemPrompt(130, 200), user, maxTokens: 1200 };
}
