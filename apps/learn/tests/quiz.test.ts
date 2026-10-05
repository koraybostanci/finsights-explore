import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BANK, TOPICS, topicOf } from '../src/quiz/bank.ts';
import { ROUND_SIZE, buildRound, score, shuffleOptions } from '../src/quiz/logic.ts';
import type { QuizQuestion } from '../src/quiz/types.ts';

/** Tekrarlanabilir rastgele sayı üreteci */
function seeded(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function assertWellFormed(q: QuizQuestion): void {
  assert.equal(q.options.length, 4, `${q.id}: 4 seçenek`);
  assert.equal(new Set(q.options.map((o) => o.trim().toLocaleLowerCase('tr'))).size, 4, `${q.id}: seçenekler farklı`);
  assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, `${q.id}: doğru yanıt sırası`);
  assert.ok(q.q.trim().length > 10, `${q.id}: soru metni`);
  assert.ok(q.why.trim().length > 10, `${q.id}: açıklama`);
  assert.ok(q.ref.tab && q.ref.label, `${q.id}: dönüş yeri`);
}

test('hazır soru bankası: biçim, tekil kimlikler, her konu', () => {
  assert.ok(BANK.length >= 20);
  assert.equal(new Set(BANK.map((q) => q.id)).size, BANK.length);
  BANK.forEach(assertWellFormed);
  const topics = new Set(BANK.map((q) => topicOf(q.id)));
  for (const t of Object.keys(TOPICS)) assert.ok(topics.has(t as keyof typeof TOPICS), `${t} konusunda soru var`);
});

test('dönüş yerleri: her sorunun sekme kimliği Learn uygulamasındaki bir sekmedir', () => {
  // main.ts TABS ile aynı kimlikler
  const tabs = new Set(['stories', 'multiples', 'glossary', 'steps', 'quiz']);
  const refs = [...BANK.map((q) => q.ref), ...Object.values(TOPICS).map((t) => t.ref)];
  for (const ref of refs) assert.ok(tabs.has(ref.tab), `bilinmeyen sekme: ${ref.tab}`);
});

test('buildRound: boyut, tekrar yok, seçenek karışımı doğruyu korur', () => {
  for (const seed of [1, 7, 42, 2026]) {
    const round = buildRound(BANK, { rnd: seeded(seed) });
    assert.equal(round.length, ROUND_SIZE);
    assert.equal(new Set(round.map((q) => q.id)).size, ROUND_SIZE);
    for (const q of round) {
      const src = BANK.find((x) => x.id === q.id);
      assert.ok(src);
      assert.equal(q.options[q.correct], src.options[src.correct]);
      assert.deepEqual([...q.options].sort(), [...src.options].sort());
    }
  }
});

test('buildRound: farklı konulardan soru seçer', () => {
  const round = buildRound(BANK, { rnd: seeded(3) });
  assert.ok(new Set(round.map((q) => topicOf(q.id))).size >= 6);
});

test('shuffleOptions ve score', () => {
  const q = BANK[0];
  const s = shuffleOptions(q, seeded(9));
  assert.equal(s.options[s.correct], q.options[q.correct]);
  const round = [BANK[0], BANK[1], BANK[2]];
  assert.deepEqual(score(round, [0, 1, null]), { correct: 1, total: 3 });
});
