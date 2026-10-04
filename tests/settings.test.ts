import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { toView } from '../src/data/store.ts';
import { addTicker, fold, matchRank, notInList, removeTicker, searchUniverse } from '../src/settings/logic.ts';
import type { MarketData, StockView } from '../src/types.ts';

const DATA = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url), 'utf8')) as MarketData;
const views: StockView[] = DATA.stocks.map((s) => toView(s, DATA.industries));
const bist = views.filter((s) => s.market === 'BIST' && !s.bank);
const us = views.filter((s) => s.market === 'US');

test('fold: Türkçe harfler ve büyük/küçük harf', () => {
  assert.equal(fold('TÜRK HAVA YOLLARI'), 'turk hava yollari');
  assert.equal(fold('ISCTR'), 'isctr');
  assert.equal(fold('  Şişecam  '), 'sisecam');
  assert.equal(fold('İş Bankası'), 'is bankasi');
});

test('searchUniverse: sembol ve ad, en iyi eşleşme başta', () => {
  assert.equal(searchUniverse(bist, 'thy')[0].k, 'THYAO');
  assert.equal(searchUniverse(bist, 'turk hava')[0].k, 'THYAO');
  assert.equal(searchUniverse(bist, 'şişe')[0].k, 'SISE');
  assert.equal(searchUniverse(bist, 'sise')[0].k, 'SISE');
  assert.deepEqual(searchUniverse(bist, ''), []);
  assert.deepEqual(searchUniverse(bist, 'yokboylebirsey'), []);
  assert.equal(searchUniverse(us, 'apple')[0].k, 'AAPL');
  assert.equal(searchUniverse(us, 't')[0].k, 'T');
  assert.ok(searchUniverse(us, 'a', 5).length <= 5);
  // piyasalar karışmaz: BIST evreninde ABD hissesi çıkmaz
  assert.deepEqual(searchUniverse(bist, 'apple'), []);
});

test('matchRank sıralaması', () => {
  assert.equal(matchRank({ k: 'T', ad: 'AT&T' }, 't'), 0);
  assert.equal(matchRank({ k: 'TSLA', ad: 'Tesla' }, 't'), 1);
  assert.equal(matchRank({ k: 'KO', ad: 'Coca-Cola' }, 'coca'), 2);
  assert.equal(matchRank({ k: 'KO', ad: 'Coca-Cola' }, 'pepsi'), -1);
});

test('liste işlemleri', () => {
  assert.deepEqual(addTicker(['A'], 'B'), ['A', 'B']);
  assert.deepEqual(addTicker(['A', 'B'], 'B'), ['A', 'B']);
  assert.deepEqual(removeTicker(['A', 'B'], 'A'), ['B']);
  const out = notInList(bist, ['THYAO', 'PGSUS']);
  assert.equal(out.length, bist.length - 2);
  assert.ok(!out.some((s) => s.k === 'THYAO'));
});
