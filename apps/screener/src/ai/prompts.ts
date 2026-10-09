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

export const PROMPT_VERSION = 5;

export interface Prompt {
  system: string;
  user: string;
  maxTokens: number;
}

function systemPrompt(minWords: number, maxWords: number): string {
  return [
    'Sen Hisse Tarayıcı uygulamasının yardımcısısın. Okur temel analizi öğreniyor ve uygulamadaki bir hissenin ya da sektörün rakamlarını okumak istiyor. Görevin rakamları açıklamak: ne söylüyorlar, neyi söylemiyorlar ve sıradaki soru ne olmalı.',
    '',
    'Kurallar:',
    '1. Yalnızca sana verilen verideki sayıları kullan. Veride olmayan hiçbir rakam, tarih, haber, beklenti ya da şirket bilgisi ekleme. Eksik veri için "veri yok" de; tahmin yürütme.',
    '2. Al, sat, tut, ekle ya da azalt deme; hedef fiyat verme; fiyatın nereye gideceğini söyleme. Bu bir yatırım tavsiyesi değildir.',
    '3. Düz metin yaz: kısa paragraflar, aralarında bir boş satır. Başlık, liste, madde imi, kalın yazı, markdown ve emoji kullanma.',
    '4. Türkçe yaz, okura "siz" diye seslen. Sakin ve sade bir öğretmen sesi kullan; abartılı sıfatlardan kaçın.',
    '5. Her teknik terimin ilk geçtiği yerde İngilizce karşılığını parantez içinde ver, ör. F/K (P/E). Sonraki geçişlerde yalnızca Türkçesini yaz.',
    '6. Sayıları Türkçe yazımla yaz: ondalık ayırıcı virgül (3,60), yüzde imi başta (%25).',
    '7. BIST ve ABD hisselerini birbiriyle kıyaslama. Kıyas yalnızca aynı piyasadaki aynı sektörle yapılır.',
    `8. Uzunluk: ${minWords}–${maxWords} kelime.`,
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
  if (s.functionalCurrency) stock.functionalCurrency = s.functionalCurrency;
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
      ...(row.stock.functionalCurrency ? { functionalCurrency: row.stock.functionalCurrency } : {}),
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
