/**
 * Quiz: building a round. Pure functions; the randomness is passed in.
 */

import { topicOf } from './bank.ts';
import type { QuizQuestion } from './types.ts';

export type Rnd = () => number;

/** Number of questions in a round */
export const ROUND_SIZE = 8;

export function shuffle<T>(list: readonly T[], rnd: Rnd = Math.random): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffles the options and updates the index of the correct answer. */
export function shuffleOptions(q: QuizQuestion, rnd: Rnd = Math.random): QuizQuestion {
  const order = shuffle(q.options.map((_, i) => i), rnd);
  return { ...q, options: order.map((i) => q.options[i]), correct: order.indexOf(q.correct) };
}

/** Picks n items taking at most one per key; fills up from the remaining ones if there are too few. */
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
  rnd?: Rnd;
}

/** Builds a round: questions from different topics, no repeats, options shuffled. */
export function buildRound(bank: QuizQuestion[], o: RoundOptions = {}): QuizQuestion[] {
  const rnd = o.rnd ?? Math.random;
  const size = o.size ?? ROUND_SIZE;
  const concept = pickDistinct(bank, size, (q) => topicOf(q.id) ?? q.id, rnd);
  return shuffle(concept, rnd).map((q) => shuffleOptions(q, rnd));
}

export interface RoundResult {
  correct: number;
  total: number;
}

/** Result from the answers; answers[i] is the chosen option index (null if unanswered). */
export function score(round: QuizQuestion[], answers: Array<number | null>): RoundResult {
  let correct = 0;
  round.forEach((q, i) => {
    if (answers[i] === q.correct) correct++;
  });
  return { correct, total: round.length };
}
