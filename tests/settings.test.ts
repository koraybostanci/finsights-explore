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
  assert.equal(searchUniverse(bist, 'thy')[0].symbol, 'THYAO');
  assert.equal(searchUniverse(bist, 'turk hava')[0].symbol, 'THYAO');
  assert.equal(searchUniverse(bist, 'şişe')[0].symbol, 'SISE');
  assert.equal(searchUniverse(bist, 'sise')[0].symbol, 'SISE');
  assert.deepEqual(searchUniverse(bist, ''), []);
  assert.deepEqual(searchUniverse(bist, 'yokboylebirsey'), []);
  assert.equal(searchUniverse(us, 'apple')[0].symbol, 'AAPL');
  assert.equal(searchUniverse(us, 't')[0].symbol, 'T');
  assert.ok(searchUniverse(us, 'a', 5).length <= 5);
  // piyasalar karışmaz: BIST evreninde ABD hissesi çıkmaz
  assert.deepEqual(searchUniverse(bist, 'apple'), []);
});

test('matchRank sıralaması', () => {
  assert.equal(matchRank({ symbol: 'T', name: 'AT&T' }, 't'), 0);
  assert.equal(matchRank({ symbol: 'TSLA', name: 'Tesla' }, 't'), 1);
  assert.equal(matchRank({ symbol: 'KO', name: 'Coca-Cola' }, 'coca'), 2);
  assert.equal(matchRank({ symbol: 'KO', name: 'Coca-Cola' }, 'pepsi'), -1);
});

test('liste işlemleri', () => {
  assert.deepEqual(addTicker(['A'], 'B'), ['A', 'B']);
  assert.deepEqual(addTicker(['A', 'B'], 'B'), ['A', 'B']);
  assert.deepEqual(removeTicker(['A', 'B'], 'A'), ['B']);
  const out = notInList(bist, ['THYAO', 'PGSUS']);
  assert.equal(out.length, bist.length - 2);
  assert.ok(!out.some((s) => s.symbol === 'THYAO'));
});
