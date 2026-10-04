/**
 * Kendini sına için yapay zekâ soruları: istem, katı doğrulama ve çağrı.
 *
 * Modele tek bir piyasadan, kullanıcının listesindeki hisselerden bir örnek
 * verilir (rakamlar ve kural sonuçlarıyla). Yanıt katı bir JSON olmalıdır;
 * biçime uymayan, yinelenen seçenekli ya da örnekte olmayan bir hisseye
 * dayanan sorular atılır. Yeterli soru kalmazsa AiError('bad_response') atılır
 * ve ekran hazır soru bankasına döner.
 */

import { data } from '../data/store.ts';
import { DEF, evaluate } from '../lib/evaluate.ts';
import type { MarketId, StockView, Thresholds } from '../types.ts';
import { complete } from './client.ts';
import type { ClientDeps } from './client.ts';
import { evaluationSummary, STOCK_TERMS, STORIES, stockFigures, termLine } from './prompts.ts';
import type { Prompt } from './prompts.ts';
import { extractJson } from './providers.ts';
import { AiError } from './types.ts';

/** İstenen soru sayısı */
export const QUIZ_COUNT = 5;
/** Bu sayının altında geçerli soru kalırsa üretim başarısız sayılır */
export const QUIZ_MIN_VALID = 3;
/** Modele verilen en çok hisse sayısı */
export const QUIZ_SAMPLE_MAX = 8;

export interface AiQuizQuestion {
  question: string;
  /** Tam 4 seçenek */
  options: string[];
  /** Doğru seçeneğin sırası (0–3) */
  correct: number;
  explanation: string;
  /** Sorunun dayandığı hisse; verilen örnekte bulunur */
  ticker?: string;
}

export interface QuizValidation {
  questions: AiQuizQuestion[];
  /** Atılan soruların nedenleri (kullanıcıya özet olarak gösterilir) */
  rejected: string[];
}

export interface QuizContext {
  /** Modele verilen örnekteki semboller */
  sample: string[];
  /** Uygulamanın bildiği bütün semboller (her iki piyasa); örnek dışı hisse anılırsa soru atılır */
  known: string[];
}

/* ---------- İstem ---------- */

/** Örnek: verisi olan, banka olmayan hisseler; en çok QUIZ_SAMPLE_MAX tane. Başka piyasadan hisse alınmaz. */
export function quizSample(market: MarketId, stocks: StockView[], rnd: () => number = Math.random): StockView[] {
  const pool = stocks.filter((s) => s.market === market && s.hasData && !s.bank);
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, QUIZ_SAMPLE_MAX).sort((x, y) => x.k.localeCompare(y.k));
}

export function quizPrompt(market: MarketId, sample: StockView[], ctx: { asOf: string; th?: Thresholds }): Prompt {
  const th = ctx.th ?? DEF;
  const system = [
    'Sen "finsights.explore" adlı öğrenme uygulamasının öğretmenisin. Okur hisse değerlemeyi bir kahvecinin hikâyeleriyle öğrendi; şimdi öğrendiklerini kendi listesindeki gerçek hisselerle sınıyor. Görevin çoktan seçmeli sorular yazmak.',
    '',
    'Okurun bildiği hikâyeler:',
    ...Object.values(STORIES).map((s) => `- ${s}`),
    '',
    'Kurallar:',
    '1. Yalnızca sana verilen verideki sayıları ve kural sonuçlarını kullan. Veride olmayan hiçbir rakam, tarih, haber ya da şirket bilgisi ekleme.',
    '2. Al, sat ya da tut dedirten, hedef fiyat ya da fiyat tahmini soran soru yazma. Bu bir yatırım tavsiyesi değildir.',
    '3. Türkçe yaz, okura "siz" diye seslen. Markdown ve emoji kullanma.',
    '4. Her teknik terimin soruda ilk geçtiği yerde İngilizce karşılığını parantez içinde ver, ör. F/K (P/E).',
    '5. Sayıları Türkçe yazımla yaz: ondalık ayırıcı virgül (3,60), yüzde imi başta (%25).',
    '6. Yalnızca verilen piyasanın hisselerini kullan; başka piyasadan ya da listede olmayan bir hisseyi anma.',
  ].join('\n');

  const payload = {
    veriTarihi: ctx.asOf,
    piyasa: market,
    paraBirimi: sample[0]?.cur ?? null,
    esikler: { enYuksekFk: th.fk, enYuksekPeg: th.peg, enYuksekNetBorcFavok: th.nb, enDusukFavokBuyumeYuzde: th.fg },
    hisseler: sample.map((s) => ({
      ...stockFigures(s),
      sektor: s.sek,
      dongusel: s.cyclical,
      kuralSonucu: evaluationSummary(evaluate(s, th)),
    })),
  };

  const user = [
    `Görev: Kendini sına. Aşağıdaki ${market} hisselerinin verisine dayanan ${QUIZ_COUNT} çoktan seçmeli soru yazın.`,
    'Her soru, hikâyelerde öğretilen bir kavramı gerçek bir hisseye uygulatsın (ör. hisse hangi ölçütten kalıyor ve neden; çok düşük bir PEG neden yanıltıcı olabilir; döngüsel sektörde düşük F/K ne anlatır; net kâr büyümesi ile FAVÖK büyümesi arasındaki fark ne söyler).',
    '',
    'Soru kuralları:',
    '- Tam 4 seçenek olsun; yalnızca biri doğru olsun ve doğruluğu verilen rakamlardan ya da kural sonuçlarından kesin olarak çıksın. Yoruma açık soru sormayın.',
    '- Okur tabloyu görmüyor: soruyu çözmek için gereken rakamları soru metnine yazın.',
    '- Her soru verilen hisselerden birine dayansın; "ticker" alanına o hissenin sembolünü yazın. Soruları farklı hisselere dağıtın.',
    '- Seçenekler birbirinden farklı olsun. Doğru seçeneğin yeri sorudan soruya değişsin.',
    '- "explanation" 1–3 cümle olsun: doğru yanıtın neden doğru olduğunu rakamla söyleyin; uygunsa ilgili hikâyeyi adıyla anın.',
    '',
    'Yanıtınız yalnızca aşağıdaki biçimde geçerli bir JSON nesnesi olsun; öncesine ya da sonrasına hiçbir şey yazmayın:',
    '{"questions":[{"question":"…","options":["…","…","…","…"],"correct":0,"explanation":"…","ticker":"…"}]}',
    '"correct", doğru seçeneğin 0\'dan başlayan sırasıdır (0, 1, 2 ya da 3).',
    '',
    `Terimler (Türkçe = İngilizce): ${termLine(STOCK_TERMS)}`,
    '',
    'Veri (JSON):',
    JSON.stringify(payload),
  ].join('\n');

  return { system, user, maxTokens: 2600 };
}

/* ---------- Doğrulama ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Tek satırlık temiz metin: markdown imleri ve fazla boşluk atılır. Metin değilse null. */
function line(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return v
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Seçenek karşılaştırması için: küçük harf, boşluk ve sondaki nokta farkı yok sayılır. */
const optionKey = (s: string): string =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .replace(/^[a-dA-D][).:]\s+/, '')
    .replace(/[.!\s]+$/, '')
    .trim();

/** Metinde geçen, sembole benzeyen büyük harfli sözcükler (3–6 harf) */
const mentioned = (text: string): string[] => text.match(/(?<![\p{L}\p{N}])[A-Z]{3,6}(?![\p{L}\p{N}])/gu) ?? [];

function validateOne(raw: unknown, ctx: { sample: Map<string, string>; known: Set<string> }): AiQuizQuestion | string {
  if (!isObj(raw)) return 'soru bir nesne değil';
  const question = line(raw.question);
  if (!question || question.length < 12) return 'soru metni yok ya da çok kısa';
  if (question.length > 700) return 'soru metni çok uzun';

  if (!Array.isArray(raw.options)) return '"options" bir dizi değil';
  if (raw.options.length !== 4) return `4 seçenek olmalı (${raw.options.length} geldi)`;
  const options: string[] = [];
  for (const o of raw.options) {
    const t = line(o);
    if (!t) return 'boş ya da metin olmayan seçenek';
    if (t.length > 320) return 'seçenek çok uzun';
    options.push(t);
  }
  if (new Set(options.map(optionKey)).size !== 4) return 'yinelenen seçenek';

  const correct = raw.correct;
  if (typeof correct !== 'number' || !Number.isInteger(correct) || correct < 0 || correct > 3)
    return '"correct" 0 ile 3 arasında bir tam sayı değil';

  const explanation = line(raw.explanation);
  if (!explanation || explanation.length < 12) return 'açıklama yok ya da çok kısa';
  if (explanation.length > 900) return 'açıklama çok uzun';

  let ticker: string | undefined;
  if (raw.ticker != null && raw.ticker !== '') {
    if (typeof raw.ticker !== 'string') return '"ticker" metin değil';
    const hit = ctx.sample.get(raw.ticker.trim().toUpperCase());
    if (!hit) return `örnekte olmayan hisse: ${raw.ticker.trim().slice(0, 12)}`;
    ticker = hit;
  }

  for (const word of mentioned([question, ...options, explanation].join(' '))) {
    if (ctx.known.has(word) && !ctx.sample.has(word)) return `örnekte olmayan hisse: ${word}`;
  }

  return ticker ? { question, options, correct, explanation, ticker } : { question, options, correct, explanation };
}

/**
 * Modelin JSON yanıtını katı biçimde doğrular. Geçerli sorular (en çok QUIZ_COUNT)
 * ve atılanların nedenleri döner; biçim baştan yanlışsa AiError('bad_response') atar.
 */
export function validateQuiz(raw: unknown, context: QuizContext): QuizValidation {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.questions) ? raw.questions : null;
  if (!list) throw new AiError('bad_response', 'Yanıtta "questions" dizisi yok.');
  const ctx = {
    sample: new Map(context.sample.map((k) => [k.toUpperCase(), k])),
    known: new Set(context.known.map((k) => k.toUpperCase())),
  };
  const questions: AiQuizQuestion[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  list.forEach((item, i) => {
    const r = validateOne(item, ctx);
    if (typeof r === 'string') {
      rejected.push(`${i + 1}. soru: ${r}`);
      return;
    }
    const key = optionKey(r.question);
    if (seen.has(key)) {
      rejected.push(`${i + 1}. soru: aynı soru yinelenmiş`);
      return;
    }
    seen.add(key);
    if (questions.length < QUIZ_COUNT) questions.push(r);
  });
  return { questions, rejected };
}

/* ---------- Çağrı ---------- */

export interface GenerateQuizInput {
  market: MarketId;
  /** Kullanıcının bu piyasadaki hisseleri (Hisselerim); örnek buradan seçilir */
  stocks: StockView[];
  /** Uygulamanın bildiği bütün semboller; verilmezse data() kullanılır */
  known?: string[];
  rnd?: () => number;
}

export interface GeneratedQuiz extends QuizValidation {
  providerSample: string[];
}

/**
 * Sağlayıcıdan QUIZ_COUNT soru ister ve doğrular. Örnek boşsa, sağlayıcı hata
 * verirse ya da yeterli geçerli soru çıkmazsa AiError atar.
 */
export async function generateQuiz(input: GenerateQuizInput, deps: ClientDeps = {}): Promise<GeneratedQuiz> {
  const sample = quizSample(input.market, input.stocks, input.rnd);
  if (sample.length < 2)
    throw new AiError('bad_response', 'Bu piyasada soru üretmeye yetecek kadar verisi olan hisse yok.');
  const prompt = quizPrompt(input.market, sample, { asOf: data().asOf });
  const text = await complete({ system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens, json: true }, deps);
  const tickers = sample.map((s) => s.k);
  const out = validateQuiz(extractJson(text), { sample: tickers, known: input.known ?? data().stocks.map((s) => s.k) });
  if (out.questions.length < QUIZ_MIN_VALID)
    throw new AiError(
      'bad_response',
      `Üretilen sorular doğrulamadan geçmedi (${out.questions.length} geçerli soru). ${out.rejected.slice(0, 2).join('; ')}`.trim(),
    );
  return { ...out, providerSample: tickers };
}
