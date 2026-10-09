import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { median, industryMedian, groupByIndustry } from '../src/lib/stats.ts';
import { DEF, evaluate, cellColor } from '../src/lib/evaluate.ts';
import { data, dataError, loadData, marketAsOf, marketHasData, setData, toView } from '../src/data/store.ts';
import { noteIsCurrent } from '../src/lib/note.ts';
import type { MarketData, StockView } from '../src/types.ts';

const DATA = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url), 'utf8')) as MarketData;
const views: StockView[] = DATA.stocks.map((s) => toView(s, DATA.industries));
const view = (k: string): StockView => {
  const v = views.find((s) => s.symbol === k);
  assert.ok(v, `${k} is not in the data`);
  return v;
};

test('toView: the stock override wins over the industry cyclical flag, otherwise the industry flag applies', () => {
  const industries = { air: { nameTr: 'Havayolu', nameEn: 'Airlines', cyclical: true }, food: { nameTr: 'Gıda', nameEn: 'Food', cyclical: false } };
  const { cyclical: _resolved, ...base } = { ...view('THYAO'), industry: 'air' };
  assert.equal(toView(base, industries).cyclical, true);
  assert.equal(toView({ ...base, cyclical: false }, industries).cyclical, false);
  assert.equal(toView({ ...base, industry: 'food' }, industries).cyclical, false);
  assert.equal(toView({ ...base, industry: 'food', cyclical: true }, industries).cyclical, true);
});

test('loadData: a schema-2 document is rejected, a schema-3 one is accepted', async () => {
  const realFetch = globalThis.fetch;
  const serve = (doc: unknown): void => {
    globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => doc })) as unknown as typeof fetch;
  };
  try {
    serve({ ...DATA, schema: 2 });
    await loadData();
    assert.equal(dataError(), 'Beklenmeyen veri biçimi');
    assert.equal(data().stocks.length, 0);
    serve(DATA);
    await loadData();
    assert.equal(dataError(), null);
    assert.equal(data().stocks.length, DATA.stocks.length);
  } finally {
    globalThis.fetch = realFetch;
    setData(DATA);
  }
});

test('median skips empty values', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, null, 3, 2]), 2.5);
  assert.equal(median([null, undefined]), null);
});

test('toView computes the derived fields', () => {
  const t = view('THYAO');
  assert.equal(t.industryTr, 'Havayolu');
  assert.equal(t.industryEn, 'Airlines');
  assert.equal(t.cyclical, true);
  assert.equal(t.hasData, true);
  assert.ok(t.roe != null && Math.abs(t.roe - 11.11) < 0.01);
  assert.equal(view('PGSUS').roe, null);
  assert.equal(view('VZ').hasData, false);
});

test('evaluate gives the same results as the first release (data of 2 October 2026)', () => {
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

test('evaluate: a stock with no data, and a bank', () => {
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

test('industryMedian and groupByIndustry', () => {
  const air = views.filter((s) => s.market === 'BIST' && s.industry === 'airlines');
  const m = industryMedian(air);
  assert.equal(m.n, 2);
  assert.equal(m.pe, 3.6);
  assert.ok(m.pb != null && Math.abs(m.pb - 0.515) < 1e-9);
  const groups = groupByIndustry(views.filter((s) => s.market === 'BIST' && !s.bank));
  assert.ok(groups.length >= 15);
  assert.ok(groups.every((g) => g.stocks.every((s) => s.industry === g.industry)));
});

test('evaluate: an empty P/E is told apart as loss or missing data', () => {
  const pg = view('PGSUS');
  assert.equal(pg.loss, true);
  assert.equal(evaluate(pg, DEF).checks[0].short, 'Zarar ediyor (son 12 ay)');
  assert.equal(evaluate(pg, DEF).checks[0].status, 'bad');
  // The same stock without the loss flag: the source may simply have given no P/E, so it is not called a loss
  const unknown = evaluate({ ...pg, loss: undefined }, DEF);
  assert.equal(unknown.checks[0].short, 'F/K verisi yok');
  assert.equal(unknown.checks[0].status, 'warn');
  // In the seed data every non-bank BIST stock with an empty P/E is flagged as a loss
  const blank = views.filter((s) => s.market === 'BIST' && !s.bank && s.hasData && s.pe == null);
  assert.deepEqual(blank.map((s) => s.symbol).sort(), ['EKGYO', 'PETKM', 'PGSUS', 'SASA']);
  assert.ok(blank.every((s) => s.loss === true));
});

test('noteIsCurrent: a comment is stale when the data is newer than it', () => {
  assert.equal(noteIsCurrent('2026-10-02', '2026-10-02T15:00:00+03:00'), true);
  assert.equal(noteIsCurrent('2026-10-02', '2026-10-05T18:45:00+03:00'), false);
  assert.equal(noteIsCurrent('2026-10-02', '2026-09-30T18:45:00+03:00'), true);
  assert.equal(noteIsCurrent(undefined, '2026-10-05T18:45:00+03:00'), true);
  assert.equal(noteIsCurrent('2026-10-02', undefined), true);
});

test('marketAsOf: per-market date, falling back to the overall date', () => {
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
