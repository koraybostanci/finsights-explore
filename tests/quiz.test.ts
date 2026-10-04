import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { toView } from '../src/data/store.ts';
import { DEF, evaluate, VLABEL } from '../src/lib/evaluate.ts';
import { BANK, TOPICS, topicOf } from '../src/quiz/bank.ts';
import { dataCount, dataQuestions, templateOf } from '../src/quiz/datagen.ts';
import { ROUND_DATA, ROUND_SIZE, buildRound, fromAi, score, shuffleOptions } from '../src/quiz/logic.ts';
import type { QuizQuestion } from '../src/quiz/types.ts';
import type { MarketData, StockView } from '../src/types.ts';

const DATA = JSON.parse(readFileSync(new URL('../public/data/market.json', import.meta.url), 'utf8')) as MarketData;
const views: StockView[] = DATA.stocks.map((s) => toView(s, DATA.industries));
const bist = views.filter((s) => s.market === 'BIST' && !s.bank);
const us = views.filter((s) => s.market === 'US');

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

test('veri soruları: yalnız istenen piyasa, verisi olan hisseler, iyi biçim', () => {
  const qs = dataQuestions('BIST', views);
  assert.ok(qs.length > 50);
  assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
  qs.forEach(assertWellFormed);
  assert.ok(qs.every((q) => q.market === 'BIST' && q.kind === 'data'));
  const usTickers = new Set(us.map((s) => s.k));
  assert.ok(qs.every((q) => !q.ticker || !usTickers.has(q.ticker)));
  assert.equal(dataQuestions('US', views).length, 0);
  assert.equal(dataCount('US', views), 0);
  assert.equal(dataCount('BIST', views), 25);
});

test('veri soruları: sonuç sorusunun yanıtı tarama kurallarıyla aynı', () => {
  const qs = dataQuestions('BIST', bist).filter((q) => templateOf(q) === 'verdict');
  assert.equal(qs.length, 25);
  for (const q of qs) {
    const s = bist.find((x) => x.k === q.ticker);
    assert.ok(s);
    const label = VLABEL[evaluate(s, DEF).verdict];
    assert.ok(q.options[q.correct].startsWith(label), `${q.ticker}: ${q.options[q.correct]} ≠ ${label}`);
  }
});

test('buildRound: boyut, veri payı, tekrar yok, seçenek karışımı doğruyu korur', () => {
  const dq = dataQuestions('BIST', bist);
  for (const seed of [1, 7, 42, 2026]) {
    const round = buildRound(BANK, dq, { rnd: seeded(seed) });
    assert.equal(round.length, ROUND_SIZE);
    assert.equal(new Set(round.map((q) => q.id)).size, ROUND_SIZE);
    const data = round.filter((q) => q.kind === 'data');
    assert.equal(data.length, ROUND_DATA);
    assert.equal(new Set(data.map(templateOf)).size, data.length);
    for (const q of round) {
      const src = [...BANK, ...dq].find((x) => x.id === q.id);
      assert.ok(src);
      assert.equal(q.options[q.correct], src.options[src.correct]);
      assert.deepEqual([...q.options].sort(), [...src.options].sort());
      if (src.keepOrder) assert.deepEqual(q.options, src.options);
    }
  }
});

test('buildRound: veri yoksa yalnızca kavram soruları', () => {
  const round = buildRound(BANK, [], { rnd: seeded(3) });
  assert.equal(round.length, ROUND_SIZE);
  assert.ok(round.every((q) => q.kind === 'concept'));
  assert.ok(new Set(round.map((q) => topicOf(q.id))).size >= 6);
});

test('shuffleOptions, score, fromAi', () => {
  const q = BANK[0];
  const s = shuffleOptions(q, seeded(9));
  assert.equal(s.options[s.correct], q.options[q.correct]);
  const round = [BANK[0], BANK[1], BANK[2]];
  assert.deepEqual(score(round, [0, 1, null]), { correct: 1, total: 3 });
  const ai = fromAi(
    [{ question: 'Örnek soru metni?', options: ['a', 'b', 'c', 'd'], correct: 2, explanation: 'Çünkü öyle.', ticker: 'THYAO' }],
    'BIST',
    5,
  );
  assert.equal(ai[0].id, 'ai-5-0');
  assert.equal(ai[0].kind, 'ai');
  assert.equal(ai[0].correct, 2);
  assert.equal(ai[0].keepOrder, true);
  assert.equal(ai[0].market, 'BIST');
});
