import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { nf, pct, esc, money } from '../src/lib/format.ts';
import { median, industryMedian, groupByIndustry } from '../src/lib/stats.ts';
import { smaSeries, lastSma, distancePct, lastCross, trend } from '../src/lib/sma.ts';
import { DEF, evaluate, cellColor } from '../src/lib/evaluate.ts';
import { toView } from '../src/data/store.ts';
import type { MarketData, StockView } from '../src/types.ts';

const DATA = JSON.parse(readFileSync(new URL('../public/data/market.json', import.meta.url), 'utf8')) as MarketData;
const views: StockView[] = DATA.stocks.map((s) => toView(s, DATA.industries));
const view = (k: string): StockView => {
  const v = views.find((s) => s.k === k);
  assert.ok(v, `${k} veride yok`);
  return v;
};

test('nf ve pct Türkçe yazımla biçimlendirir', () => {
  assert.equal(nf(1234.5), '1.234,50');
  assert.equal(nf(null), '–');
  assert.equal(nf(3.6, 1), '3,6');
  assert.equal(pct(9), '+%9');
  assert.equal(pct(-22), '%-22');
  assert.equal(pct(null), '–');
  assert.equal(money(291, 'TRY'), '291,00 TL');
  assert.equal(money(12.5, 'USD'), '12,50 USD');
});

test('esc HTML özel karakterlerini kaçırır', () => {
  assert.equal(esc(`<a href="x">T&'s</a>`), '&lt;a href=&quot;x&quot;&gt;T&amp;&#39;s&lt;/a&gt;');
});

test('median boş değerleri atar', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, null, 3, 2]), 2.5);
  assert.equal(median([null, undefined]), null);
});

test('smaSeries ve lastSma', () => {
  const c = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(smaSeries(c, 3), [null, null, 2, 3, 4, 5]);
  assert.equal(lastSma(c, 3), 5);
  assert.equal(lastSma(c, 10), null);
  assert.equal(distancePct(110, 100), 10.000000000000009);
  assert.equal(distancePct(null, 100), null);
});

test('lastCross altın ve ölüm kesişimini bulur', () => {
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  const up = Array.from({ length: 30 }, (_, i) => 71 + i * 3);
  assert.equal(lastCross([...down, ...up], 5, 20, 40)?.kind, 'golden');
  assert.equal(lastCross([...up, ...down.map((v) => v + 60)], 5, 20, 40)?.kind, 'death');
  assert.equal(lastCross(down, 5, 20, 40), null);
});

test('trend', () => {
  assert.equal(trend(120, 110, 100), 'up');
  assert.equal(trend(90, 100, 110), 'down');
  assert.equal(trend(105, 110, 100), 'mixed');
  assert.equal(trend(null, 110, 100), null);
});

test('toView türetilmiş alanları hesaplar', () => {
  const t = view('THYAO');
  assert.equal(t.sek, 'Havayolu');
  assert.equal(t.sekEn, 'Airlines');
  assert.equal(t.cyclical, true);
  assert.equal(t.hasData, true);
  assert.ok(t.roe != null && Math.abs(t.roe - 11.11) < 0.01);
  assert.equal(view('PGSUS').roe, null);
  assert.equal(view('VZ').hasData, false);
});

test('evaluate ilk sürümle aynı sonuçları verir (2 Ekim 2026 verisi)', () => {
  const bist = views.filter((s) => s.market === 'BIST' && !s.bank);
  assert.equal(bist.length, 25);
  const cnt = { good: 0, warn: 0, bad: 0, na: 0 };
  for (const s of bist) cnt[evaluate(s, DEF).verdict]++;
  assert.deepEqual(cnt, { good: 1, warn: 8, bad: 16, na: 0 });

  const thy = evaluate(view('THYAO'), DEF);
  assert.equal(thy.verdict, 'bad');
  assert.deepEqual(
    thy.checks.map((c) => `${c.st}: ${c.s}`),
    [
      'good: Kârlı',
      'good: F/K 3,6 ≤ 30',
      'good: PEG 0,33 ≤ 1,0',
      'bad: FAVÖK %-22: faaliyet büyümüyor',
      'bad: Borç yüksek (4,3x > 2,5)',
      'warn: Döngüsel sektör',
    ],
  );
  const ttk = evaluate(view('TTKOM'), DEF);
  assert.equal(ttk.verdict, 'warn');
  assert.equal(ttk.warns, 1);
});

test('evaluate: verisi olmayan hisse ve banka', () => {
  const vz = evaluate(view('VZ'), DEF);
  assert.equal(vz.verdict, 'na');
  assert.equal(vz.checks[0].s, 'Veri bekliyor');
  const gar = evaluate(view('GARAN'), DEF);
  assert.equal(gar.verdict, 'na');
  assert.equal(gar.checks[0].n, 'Banka');
});

test('cellColor', () => {
  assert.equal(cellColor('fk', 10, DEF), 'v-good');
  assert.equal(cellColor('fk', 40, DEF), 'v-bad');
  assert.equal(cellColor('peg', 0.07, DEF), 'v-warn');
  assert.equal(cellColor('peg', -0.2, DEF), 'v-bad');
  assert.equal(cellColor('pd', 0.4, DEF), 'v-good');
  assert.equal(cellColor('pd', 2, DEF), '');
  assert.equal(cellColor('nb', null, DEF), '');
});

test('industryMedian ve groupByIndustry', () => {
  const air = views.filter((s) => s.market === 'BIST' && s.ind === 'airlines');
  const m = industryMedian(air);
  assert.equal(m.n, 2);
  assert.equal(m.fk, 3.6);
  assert.ok(m.pd != null && Math.abs(m.pd - 0.515) < 1e-9);
  const groups = groupByIndustry(views.filter((s) => s.market === 'BIST' && !s.bank));
  assert.ok(groups.length >= 15);
  assert.ok(groups.every((g) => g.stocks.every((s) => s.ind === g.ind)));
});
