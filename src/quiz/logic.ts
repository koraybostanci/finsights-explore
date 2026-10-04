/**
 * Kendini sına: tur kurma. Saf işlevler; rastgelelik dışarıdan verilir.
 */

import type { MarketId } from '../types.ts';
import type { AiQuizQuestion } from '../ai/quiz.ts';
import { topicOf } from './bank.ts';
import { templateOf } from './datagen.ts';
import type { QuizQuestion } from './types.ts';

export type Rnd = () => number;

/** Bir turdaki soru sayısı */
export const ROUND_SIZE = 8;
/** Bir turda güncel veriden gelen en çok soru */
export const ROUND_DATA = 3;

export function shuffle<T>(list: readonly T[], rnd: Rnd = Math.random): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Seçenekleri karıştırır (keepOrder değilse) ve doğru yanıtın sırasını günceller. */
export function shuffleOptions(q: QuizQuestion, rnd: Rnd = Math.random): QuizQuestion {
  if (q.keepOrder) return q;
  const order = shuffle(q.options.map((_, i) => i), rnd);
  return { ...q, options: order.map((i) => q.options[i]), correct: order.indexOf(q.correct) };
}

/** Her anahtardan en çok bir öğe alarak n öğe seçer; yetmezse kalanlardan tamamlar. */
function pickDistinct<T>(list: T[], n: number, key: (x: T) => string, rnd: Rnd): T[] {
  const pool = shuffle(list, rnd);
  const seen = new Set<string>();
  const first: T[] = [];
  const rest: T[] = [];
  for (const x of pool) {
    const k = key(x);
    if (seen.has(k)) rest.push(x);
    else {
      seen.add(k);
      first.push(x);
    }
  }
  return [...first, ...rest].slice(0, n);
}

export interface RoundOptions {
  size?: number;
  maxData?: number;
  rnd?: Rnd;
}

/**
 * Bir tur kurar: önce farklı kalıplardan ve farklı hisselerden veri soruları,
 * kalanı farklı konulardan hazır sorular. Veri sorusu yoksa tur yalnızca hazır sorulardan oluşur.
 */
export function buildRound(bank: QuizQuestion[], dataQs: QuizQuestion[], o: RoundOptions = {}): QuizQuestion[] {
  const rnd = o.rnd ?? Math.random;
  const size = o.size ?? ROUND_SIZE;
  const nData = Math.min(o.maxData ?? ROUND_DATA, dataQs.length, size);

  const byTemplate = pickDistinct(dataQs, dataQs.length, templateOf, rnd);
  const tickers = new Set<string>();
  const dataPick: QuizQuestion[] = [];
  for (const q of byTemplate) {
    if (dataPick.length >= nData) break;
    if (q.ticker && tickers.has(q.ticker)) continue;
    if (q.ticker) tickers.add(q.ticker);
    dataPick.push(q);
  }

  const concept = pickDistinct(bank, size - dataPick.length, (q) => topicOf(q.id) ?? q.id, rnd);
  return shuffle([...dataPick, ...concept], rnd).map((q) => shuffleOptions(q, rnd));
}

/** Yapay zekânın yazdığı (doğrulanmış) soruları tur biçimine çevirir. */
export function fromAi(list: AiQuizQuestion[], market: MarketId, stamp: number): QuizQuestion[] {
  return list.map((q, i) => ({
    id: `ai-${stamp}-${i}`,
    kind: 'ai',
    topic: 'Yapay zekânın sorusu',
    lead: q.ticker,
    q: q.question,
    options: q.options.slice(),
    correct: q.correct,
    why: q.explanation,
    ref: { tab: 'screener', label: 'Tarayıcı: hissenin satırını açıp gerekçeleri okuyun' },
    ticker: q.ticker,
    market,
    keepOrder: true,
  }));
}

export interface RoundResult {
  correct: number;
  total: number;
}

/** Yanıtlardan sonuç; answers[i] seçilen seçeneğin sırasıdır (yanıtlanmadıysa null). */
export function score(round: QuizQuestion[], answers: Array<number | null>): RoundResult {
  let correct = 0;
  round.forEach((q, i) => {
    if (answers[i] === q.correct) correct++;
  });
  return { correct, total: round.length };
}
