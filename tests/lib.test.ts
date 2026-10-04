import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { nf, pct, esc, money } from '../src/lib/format.ts';
import { median, industryMedian, groupByIndustry } from '../src/lib/stats.ts';
import { smaSeries, lastSma, distancePct, lastCross, trend } from '../src/lib/sma.ts';
import { DEF, evaluate, cellColor } from '../src/lib/evaluate.ts';
import { marketAsOf, marketHasData, setData, toView } from '../src/data/store.ts';
import { noteIsCurrent } from '../src/lib/note.ts';
import type { MarketData, StockView } from '../src/types.ts';

const DATA = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url), 'utf8')) as MarketData;
const views: StockView[] = DATA.stocks.map((s) => toView(s, DATA.industries));
const view = (k: string): StockView => {
  const v = views.find((s) => s.symbol === k);
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
  assert.equal(t.industryTr, 'Havayolu');
  assert.equal(t.industryEn, 'Airlines');
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
    thy.checks.map((c) => `${c.status}: ${c.short}`),
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
  assert.equal(vz.checks[0].short, 'Veri bekliyor');
  const gar = evaluate(view('GARAN'), DEF);
  assert.equal(gar.verdict, 'na');
  assert.equal(gar.checks[0].id, 'bank');
  assert.equal(gar.checks[0].label, 'Banka');
});

test('cellColor', () => {
  assert.equal(cellColor('pe', 10, DEF), 'v-good');
  assert.equal(cellColor('pe', 40, DEF), 'v-bad');
  assert.equal(cellColor('peg', 0.07, DEF), 'v-warn');
  assert.equal(cellColor('peg', -0.2, DEF), 'v-bad');
  assert.equal(cellColor('pb', 0.4, DEF), 'v-good');
  assert.equal(cellColor('pb', 2, DEF), '');
  assert.equal(cellColor('netDebtEbitda', null, DEF), '');
});

test('industryMedian ve groupByIndustry', () => {
  const air = views.filter((s) => s.market === 'BIST' && s.industry === 'airlines');
  const m = industryMedian(air);
  assert.equal(m.n, 2);
  assert.equal(m.pe, 3.6);
  assert.ok(m.pb != null && Math.abs(m.pb - 0.515) < 1e-9);
  const groups = groupByIndustry(views.filter((s) => s.market === 'BIST' && !s.bank));
  assert.ok(groups.length >= 15);
  assert.ok(groups.every((g) => g.stocks.every((s) => s.industry === g.industry)));
});

test('evaluate: boş F/K zarar mı, eksik veri mi ayrılır', () => {
  const pg = view('PGSUS');
  assert.equal(pg.loss, true);
  assert.equal(evaluate(pg, DEF).checks[0].short, 'Zarar ediyor (son 12 ay)');
  assert.equal(evaluate(pg, DEF).checks[0].status, 'bad');
  // Aynı hisse, zarar bilgisi olmadan: kaynak F/K vermemiş olabilir, zarar denmez
  const unknown = evaluate({ ...pg, loss: undefined }, DEF);
  assert.equal(unknown.checks[0].short, 'F/K verisi yok');
  assert.equal(unknown.checks[0].status, 'warn');
  // Seed verisinde F/K'sı boş olan her banka dışı BIST hissesi zarar olarak işaretlidir
  const blank = views.filter((s) => s.market === 'BIST' && !s.bank && s.hasData && s.pe == null);
  assert.deepEqual(blank.map((s) => s.symbol).sort(), ['EKGYO', 'PETKM', 'PGSUS', 'SASA']);
  assert.ok(blank.every((s) => s.loss === true));
});

test('noteIsCurrent: veri yorumdan yeniyse yorum geçersizdir', () => {
  assert.equal(noteIsCurrent('2026-10-02', '2026-10-02T15:00:00+03:00'), true);
  assert.equal(noteIsCurrent('2026-10-02', '2026-10-05T18:45:00+03:00'), false);
  assert.equal(noteIsCurrent('2026-10-02', '2026-09-30T18:45:00+03:00'), true);
  assert.equal(noteIsCurrent(undefined, '2026-10-05T18:45:00+03:00'), true);
  assert.equal(noteIsCurrent('2026-10-02', undefined), true);
});

test('marketAsOf: piyasa başına tarih, yoksa genel tarih', () => {
  setData(DATA);
  assert.equal(marketAsOf('BIST'), '2026-10-02T15:00:00+03:00');
  assert.equal(marketAsOf('US'), DATA.asOf);
  assert.equal(marketHasData('BIST'), true);
  assert.equal(marketHasData('US'), false);
  setData({ ...DATA, asOf: '2026-10-05T23:45:00+03:00', asOfBy: { BIST: '2026-10-05T18:45:00+03:00', US: '2026-10-05T23:45:00+03:00' } });
  assert.equal(marketAsOf('BIST'), '2026-10-05T18:45:00+03:00');
  assert.equal(marketAsOf('US'), '2026-10-05T23:45:00+03:00');
  setData(DATA);
});
