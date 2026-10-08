import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { toView } from '../src/data/store.ts';
import { DEF } from '../src/lib/evaluate.ts';
import { groupByIndustry, industryMedian } from '../src/lib/stats.ts';
import type { AiStatus, AiText } from '../src/ai/index.ts';
import type { MarketData, PriceSeries, StockView } from '../src/types.ts';

import {
  PEER_COLS,
  aboveSma200,
  buildRows,
  countVerdicts,
  defaultDir,
  distText,
  filterRows,
  listCols,
  nextSort,
  orderGroups,
  pickIndustry,
  sortRows,
  verdictLabel,
} from '../src/screener/logic.ts';
import { getThresholds, parseThreshold, sanitizeThresholds } from '../src/screener/thresholds.ts';
import {
  buildStripDefs,
  dotOffsets,
  layoutStrips,
  markerFor,
  niceStep,
  placeLabels,
  stripScale,
  stripSvg,
  thresholdInScale,
} from '../src/screener/strip.ts';
import { headHtml, listRowHtml, medianRowHtml, peerRowHtml, summaryHtml } from '../src/screener/table.ts';
import {
  crossSentence,
  detailHtml,
  distPhrase,
  extraInfo,
  noteHtml,
  smaBlockHtml,
  smaLegendHtml,
  smaView,
  trendSentence,
} from '../src/screener/detail.ts';
import { SMA_WINDOW, seriesUsable, smaChartModel, smaChartSvg } from '../src/screener/smachart.ts';
import { commentBlockHtml, compareBlockHtml } from '../src/screener/ai-ui.ts';
import { BIM_EXAMPLE, calcEvaluate, calcMultiples } from '../src/calculator/logic.ts';

const DATA = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url), 'utf8')) as MarketData;
const views: StockView[] = DATA.stocks.map((s) => toView(s, DATA.industries));
const view = (k: string): StockView => {
  const v = views.find((s) => s.symbol === k);
  assert.ok(v, `${k} is not in the data`);
  return v;
};
const bist = views.filter((s) => s.market === 'BIST' && !s.bank);
const us = views.filter((s) => s.market === 'US');

/** A stock for experiments: a copy of a real stock with the given fields changed */
const withFields = (k: string, patch: Partial<StockView>): StockView => ({ ...view(k), ...patch });

const near = (a: number | null, b: number, eps = 0.005): void => {
  assert.ok(a != null && Math.abs(a - b) <= eps, `${a} is not close to ${b}`);
};

/* ---------- Sorting ---------- */

test('sortRows: verdict order is clean, then warned, then rejected; fewer warnings first', () => {
  const rows = sortRows(buildRows(bist, DEF), 'verdict', 1);
  const ord = rows.map((r) => ({ good: 0, warn: 1, bad: 2, na: 3 })[r.ev.verdict] * 10 + r.ev.warns);
  assert.deepEqual(ord, [...ord].sort((a, b) => a - b));
  assert.equal(rows[0].ev.verdict, 'good');
  assert.equal(rows[rows.length - 1].ev.verdict, 'bad');
});

test('sortRows: empty values stay last in both directions, the input array is unchanged', () => {
  const rows = buildRows(bist, DEF);
  const before = rows.map((r) => r.s.symbol);
  for (const dir of [1, -1] as const) {
    const out = sortRows(rows, 'pe', dir);
    const firstNull = out.findIndex((r) => r.s.pe == null);
    assert.ok(firstNull > 0);
    assert.ok(out.slice(firstNull).every((r) => r.s.pe == null), 'loss-making stocks come last');
    const vals = out.slice(0, firstNull).map((r) => r.s.pe as number);
    assert.deepEqual(vals, [...vals].sort((a, b) => (a - b) * dir));
  }
  assert.deepEqual(rows.map((r) => r.s.symbol), before);
});

test('sortRows: Turkish ordering by symbol, and ordering by distance from the average', () => {
  const rows = buildRows(bist, DEF);
  const bySymbol = sortRows(rows, 'symbol', 1).map((r) => r.s.symbol);
  assert.deepEqual(bySymbol, [...bySymbol].sort((a, b) => a.localeCompare(b, 'tr')));
  const a = withFields('THYAO', { price: 110, sma200: 100 });
  const b = withFields('PGSUS', { price: 90, sma200: 100 });
  const c = withFields('TCELL', { sma200: null });
  const out = sortRows(buildRows([c, b, a], DEF), 'd200', -1).map((r) => r.s.symbol);
  assert.deepEqual(out, ['THYAO', 'PGSUS', 'TCELL']);
});

test('nextSort: the same column flips direction; a new column starts ascending for multiples, descending for growth', () => {
  assert.deepEqual(nextSort({ key: 'verdict', dir: 1 }, 'verdict'), { key: 'verdict', dir: -1 });
  assert.deepEqual(nextSort({ key: 'verdict', dir: -1 }, 'pe'), { key: 'pe', dir: 1 });
  assert.deepEqual(nextSort({ key: 'pe', dir: 1 }, 'ebitdaGrowth'), { key: 'ebitdaGrowth', dir: -1 });
  for (const k of ['symbol', 'verdict', 'pe', 'pb', 'evEbitda', 'peg', 'netDebtEbitda'] as const) assert.equal(defaultDir(k), 1);
  for (const k of ['ebitdaGrowth', 'netIncomeGrowth', 'roe', 'marketCap', 'd50', 'd200'] as const) assert.equal(defaultDir(k), -1);
});

/* ---------- Columns ---------- */

test('listCols: the first release\'s column order plus 200g ort. after Net borç/FAVÖK; market cap with its currency', () => {
  const keys = listCols('BIST').map((c) => c.key);
  assert.deepEqual(keys, ['symbol', 'verdict', 'why', 'pe', 'pb', 'evEbitda', 'peg', 'netDebtEbitda', 'd200', 'ebitdaGrowth', 'netIncomeGrowth', 'roe', 'marketCap']);
  assert.equal(listCols('BIST').at(-1)?.en, 'Market cap, bn TL');
  assert.equal(listCols('US').at(-1)?.en, 'Market cap, bn USD');
  assert.deepEqual(
    PEER_COLS.map((c) => c.key),
    ['symbol', 'verdict', 'pe', 'pb', 'evEbitda', 'peg', 'netDebtEbitda', 'ebitdaGrowth', 'roe', 'd50', 'd200'],
  );
});

/* ---------- Filter ---------- */

test('above-200-day-average filter: stocks with no average and those below it are hidden', () => {
  const above = withFields('THYAO', { price: 110, sma200: 100 });
  const below = withFields('PGSUS', { price: 90, sma200: 100 });
  const equal = withFields('TTKOM', { price: 100, sma200: 100 });
  const none = withFields('TCELL', { sma200: null });
  const rows = buildRows([above, below, equal, none], DEF);
  assert.equal(filterRows(rows, { aboveSma: false }).length, 4);
  assert.deepEqual(
    filterRows(rows, { aboveSma: true }).map((r) => r.s.symbol),
    ['THYAO'],
  );
  assert.equal(aboveSma200({ price: null, sma200: 100 }), false);
  near(rows[0].d200, 10, 1e-9);
  near(rows[1].d200, -10, 1e-9);
  assert.equal(rows[3].d200, null);
  assert.equal(distText(4.21), '+%4,2');
  assert.equal(distText(-3.14), '%-3,1');
  assert.equal(distText(null), '–');
});

test('countVerdicts: stocks with no data are counted separately; banks go into the bank count', () => {
  const c = countVerdicts(buildRows(bist, DEF));
  assert.equal(c.good + c.warn + c.bad, bist.length);
  assert.equal(c.waiting, 0);
  assert.equal(c.bank, 0);
  const cu = countVerdicts(buildRows(us, DEF));
  assert.deepEqual(cu, { good: 0, warn: 0, bad: 0, bank: 0, waiting: us.length });
  const cb = countVerdicts(buildRows(views.filter((s) => s.market === 'BIST'), DEF));
  assert.equal(cb.bank, 5);
  assert.equal(verdictLabel(buildRows([view('VZ')], DEF)[0]), 'Veri bekliyor');
  assert.match(verdictLabel(buildRows([view('KRDMD')], DEF)[0]), /^Uyarılı aday \(\d\)$/);
});

/* ---------- Industry selection ---------- */

test('orderGroups and pickIndustry: comparable industries first; if the remembered one disappears, the first industry', () => {
  const groups = orderGroups(groupByIndustry(bist));
  const multi = groups.filter((g) => g.stocks.length >= 2).length;
  assert.ok(multi >= 5);
  assert.ok(groups.slice(0, multi).every((g) => g.stocks.length >= 2));
  assert.ok(groups.slice(multi).every((g) => g.stocks.length < 2));
  const names = groups.slice(0, multi).map((g) => g.industryTr);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'tr')));

  assert.equal(pickIndustry(groups, 'airlines'), 'airlines');
  assert.equal(pickIndustry(groups, 'yok-boyle-sektor'), groups[0].industry);
  assert.equal(pickIndustry(groups, null), groups[0].industry);
  assert.equal(pickIndustry([], 'airlines'), null);
  // If only single-stock industries remain on the watchlist, the first industry is still chosen
  const singles = orderGroups(groupByIndustry([view('TUPRS'), view('ASELS')]));
  assert.equal(pickIndustry(singles, 'airlines'), singles[0].industry);
});

/* ---------- Thresholds ---------- */

test('sanitizeThresholds: a record with old keys (schema 1) and wrong types fall back to defaults field by field', () => {
  // The shape the old version stored: the new code does not read these keys and falls back to defaults
  assert.deepEqual(sanitizeThresholds({ fk: 50, peg: 2, nb: 4, fg: 10, cyc: false, bank: true }), DEF);
  // Valid new keys are kept, old keys are ignored
  assert.deepEqual(sanitizeThresholds({ fk: 50, maxPeg: 2, bank: true, showBanks: false }), { ...DEF, maxPeg: 2 });
  // Values that are not objects
  for (const raw of [undefined, 'abc', 42, true, [], [1, 2]]) assert.deepEqual(sanitizeThresholds(raw), DEF);
  // Wrong types fall away one by one, valid fields stay
  assert.deepEqual(
    sanitizeThresholds({ maxPe: '20', maxPeg: null, maxNetDebtEbitda: Infinity, minEbitdaGrowth: -5, warnCyclical: 'yes', showBanks: true }),
    { ...DEF, minEbitdaGrowth: -5, showBanks: true },
  );
});

test('getThresholds: the old format in localStorage does not break the app, default thresholds apply', () => {
  const stored: Record<string, string> = { 'fintools.screener.thresholds': JSON.stringify({ fk: 50, peg: 2, nb: 4, fg: 10, cyc: false, bank: true }) };
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => stored[k] ?? null,
    setItem: (k: string, v: string) => void (stored[k] = v),
    removeItem: (k: string) => void delete stored[k],
  };
  assert.deepEqual(getThresholds(), DEF);
});

test('sanitizeThresholds and parseThreshold: a malformed or empty value falls back to the default', () => {
  assert.deepEqual(sanitizeThresholds(null), DEF);
  assert.deepEqual(sanitizeThresholds({ maxPe: 20, maxPeg: 'x', maxNetDebtEbitda: NaN, warnCyclical: false, showBanks: 1 }), {
    ...DEF,
    maxPe: 20,
    warnCyclical: false,
  });
  assert.equal(parseThreshold('', 30), 30);
  assert.equal(parseThreshold('abc', 2.5), 2.5);
  assert.equal(parseThreshold('12.5', 30), 12.5);
  assert.equal(parseThreshold('0', 30), 0);
});

/* ---------- Strip chart: scale ---------- */

test('niceStep and stripScale: include zero, cover the data, tidy step', () => {
  assert.equal(niceStep(0.13), 0.2);
  assert.equal(niceStep(2.2), 2.5);
  assert.equal(niceStep(7), 10);
  assert.equal(niceStep(0), 1);
  for (const vals of [[0.4, 0.63], [7.01, 8.68], [4.25, 6.28, 2.5], [-5.13, 2.39, 3.63], [-2.2], [64.61], [0]]) {
    const sc = stripScale(vals);
    assert.ok(sc.lo <= Math.min(0, ...vals) && sc.hi >= Math.max(0, ...vals), JSON.stringify({ vals, sc }));
    assert.ok(sc.hi > sc.lo);
    const steps = (sc.hi - sc.lo) / sc.step;
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6 && steps <= 8, JSON.stringify({ vals, sc }));
  }
  assert.deepEqual(stripScale([0.4, 0.63]), { lo: 0, hi: 0.8, step: 0.2 });
  assert.deepEqual(stripScale([-5.13, 3.63]), { lo: -7.5, hi: 5, step: 2.5 });
  assert.equal(thresholdInScale([4.25, 6.28], 2.5), true);
  assert.equal(thresholdInScale([0.03], 500), false);
});

/* ---------- Strip chart: label placement ---------- */

const overlaps = (a: { x: number; w: number }, b: { x: number; w: number }): boolean =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2;

test('placeLabels: distant labels share a row, close ones are shifted, those that do not fit are hidden', () => {
  const far = placeLabels([{ x: 100, w: 30 }, { x: 300, w: 30 }], 0, 400);
  assert.deepEqual(far.map((p) => [p.level, p.shown]), [[0, true], [0, true]]);

  const close = placeLabels([{ x: 200, w: 30 }, { x: 210, w: 30 }], 0, 400);
  assert.deepEqual(close.map((p) => p.shown), [true, true]);
  assert.notEqual(close[0].level, close[1].level);

  const three = placeLabels([{ x: 200, w: 30 }, { x: 204, w: 30 }, { x: 208, w: 30 }], 0, 400);
  assert.equal(three.filter((p) => p.shown).length, 2, 'there are two rows; the third label is dropped');

  // A label that overflows the edge is pulled inside
  const edge = placeLabels([{ x: 2, w: 40 }, { x: 399, w: 40 }], 0, 400);
  assert.equal(edge[0].x, 20);
  assert.equal(edge[1].x, 380);
});

test('placeLabels: shown labels never overlap on their own row (random inputs)', () => {
  let seed = 7;
  const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let round = 0; round < 200; round++) {
    const n = 1 + Math.floor(rnd() * 8);
    const items = Array.from({ length: n }, () => ({ x: rnd() * 500, w: 24 + rnd() * 30 }));
    const out = placeLabels(items, 0, 500);
    assert.equal(out.length, n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (!out[i].shown || !out[j].shown || out[i].level !== out[j].level) continue;
        assert.ok(!overlaps({ x: out[i].x, w: items[i].w }, { x: out[j].x, w: items[j].w }), `round ${round}`);
      }
    for (let i = 0; i < n; i++) {
      assert.ok(out[i].x - items[i].w / 2 >= -1e-9 && out[i].x + items[i].w / 2 <= 500 + 1e-9);
    }
  }
});

test('dotOffsets: overlapping markers are separated vertically', () => {
  assert.deepEqual(dotOffsets([10, 100, 200]), [0, 0, 0]);
  const two = dotOffsets([100, 103]);
  assert.equal(two[0], 0);
  assert.notEqual(two[1], 0);
  const three = dotOffsets([100, 101, 102]);
  assert.equal(new Set(three).size, 3);
  const five = dotOffsets([100, 100, 100, 100, 100]);
  assert.equal(new Set(five).size, 5, 'five markers at the same value stay individually visible');
  assert.deepEqual([...five].sort((a, b) => a - b), [-22, -11, 0, 11, 22]);
});

test('layoutStrips: the median tick sticks out past the markers stacked on it; value labels stay above the stack', () => {
  const same = ['A', 'B', 'C', 'D', 'E'].map((k) => ({ symbol: k, pe: null, pb: 2.5, evEbitda: null, netDebtEbitda: null }));
  const far = { symbol: 'Z', pe: null, pb: 9, evEbitda: null, netDebtEbitda: null };
  const defs = buildStripDefs([...same, far], { pe: null, pb: 2.5, evEbitda: null, netDebtEbitda: null }, DEF.maxNetDebtEbitda);
  const lay = layoutStrips(defs, 560, new Map());
  const pd = lay.strips[0];
  const offs = pd.dots.filter((d) => d.symbol !== 'Z').map((d) => d.y - pd.y);
  assert.equal(new Set(offs).size, 5);
  assert.ok(pd.medianTick.up > Math.max(...offs.map((o) => -o)) + 6, 'the tick sticks out above the markers');
  assert.ok(pd.medianTick.down > Math.max(...offs) + 6, 'the tick sticks out below the markers');
  for (const v of pd.values.filter((x) => x.shown)) assert.ok(v.y <= pd.y - pd.medianTick.up, 'the value label is above the tick');
  for (const b of pd.below.filter((x) => x.shown)) assert.ok(b.y - 11.5 >= pd.y + pd.medianTick.down, 'the median label is below the tick');

  // Without a stack the tick keeps its old size.
  const two = buildStripDefs([{ symbol: 'A', pe: null, pb: 1, evEbitda: null, netDebtEbitda: null }, far], { pe: null, pb: 5, evEbitda: null, netDebtEbitda: null }, DEF.maxNetDebtEbitda);
  assert.deepEqual(layoutStrips(two, 560, new Map()).strips[0].medianTick, { up: 12, down: 12 });
});

test('markerFor: four colours; beyond four stocks the colours are reused with other shapes', () => {
  const ms = Array.from({ length: 16 }, (_, i) => markerFor(i));
  assert.deepEqual(ms.slice(0, 4).map((m) => m.color), ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)']);
  assert.ok(ms.slice(0, 4).every((m) => m.shape === 'circle'));
  assert.equal(ms[4].color, 'var(--c1)');
  assert.notEqual(ms[4].shape, 'circle');
  assert.equal(new Set(ms.map((m) => m.color + m.shape)).size, 16);
});

/* ---------- Strip chart: definitions and layout ---------- */

test('buildStripDefs: the P/E strip only when at least two stocks have a P/E; the threshold only on the debt strip', () => {
  const air = [view('THYAO'), view('PGSUS')]; // PGSUS is at a loss: no P/E
  const defsAir = buildStripDefs(air, industryMedian(air), DEF.maxNetDebtEbitda);
  assert.deepEqual(defsAir.map((d) => d.key), ['pb', 'evEbitda', 'netDebtEbitda']);
  assert.equal(defsAir[2].threshold, 2.5);
  assert.equal(defsAir[0].threshold, undefined);
  near(defsAir[0].median, 0.515);

  const tel = [view('TTKOM'), view('TCELL')];
  assert.deepEqual(buildStripDefs(tel, industryMedian(tel), DEF.maxNetDebtEbitda).map((d) => d.key), ['pe', 'pb', 'evEbitda', 'netDebtEbitda']);

  const usTel = [view('VZ'), view('T')];
  assert.deepEqual(buildStripDefs(usTel, industryMedian(usTel), DEF.maxNetDebtEbitda), [], 'no strips for an industry with no data');
});

test('layoutStrips: points lie within the strip, labels do not overlap, threshold and median are marked', () => {
  for (const W of [300, 420, 587, 900]) {
    for (const g of groupByIndustry(bist)) {
      const defs = buildStripDefs(g.stocks, industryMedian(g.stocks), DEF.maxNetDebtEbitda);
      const markers = new Map(g.stocks.map((s, i) => [s.symbol, markerFor(i)]));
      const lay = layoutStrips(defs, W, markers);
      assert.ok(lay.H > 0);
      let prevBottom = -Infinity;
      for (const s of lay.strips) {
        assert.ok(s.y > prevBottom, 'strips stack vertically');
        prevBottom = s.bottom;
        assert.ok(s.bottom <= lay.H + 8);
        for (const d of s.dots) assert.ok(d.x >= s.x0 - 1e-6 && d.x <= s.x1 + 1e-6, `${g.industryTr} ${s.def.key} ${d.symbol}`);
        if (s.medianX != null) assert.ok(s.medianX >= s.x0 - 1e-6 && s.medianX <= s.x1 + 1e-6);
        if (s.thresholdX != null) assert.ok(s.thresholdX >= s.x0 - 1e-6 && s.thresholdX <= s.x1 + 1e-6);
        for (const set of [s.values, s.below]) {
          const vis = set.filter((v) => v.shown);
          for (let i = 0; i < vis.length; i++)
            for (let j = i + 1; j < vis.length; j++) {
              if (vis[i].y !== vis[j].y) continue;
              const wi = vis[i].text.length * 11.5 * 0.56;
              const wj = vis[j].text.length * 11.5 * 0.56;
              assert.ok(Math.abs(vis[i].x - vis[j].x) >= (wi + wj) / 2, `${g.industryTr} ${s.def.key}: ${vis[i].text} / ${vis[j].text}`);
            }
        }
      }
      const netDebtStrip = lay.strips.find((s) => s.def.key === 'netDebtEbitda');
      if (netDebtStrip) assert.ok(netDebtStrip.below.some((b) => b.kind === 'threshold'), 'threshold label on the debt strip');
    }
  }
});

test('layoutStrips: with close values the value labels are shifted or dropped; with seven stocks the shapes differ', () => {
  const list = ['THYAO', 'PGSUS', 'TTKOM', 'TCELL', 'KCHOL', 'SAHOL', 'EKGYO'].map((k) => view(k)); // P/B 0.40–0.70
  const defs = buildStripDefs(list, industryMedian(list), DEF.maxNetDebtEbitda);
  const markers = new Map(list.map((s, i) => [s.symbol, markerFor(i)]));
  const lay = layoutStrips(defs, 560, markers);
  const pd = lay.strips.find((s) => s.def.key === 'pb');
  assert.ok(pd);
  assert.equal(pd.dots.length, 7);
  assert.ok(pd.values.some((v) => !v.shown), 'not all seven close values are written');
  assert.ok(new Set(pd.values.filter((v) => v.shown).map((v) => v.y)).size >= 2, 'labels spread over two rows');
  assert.equal(new Set(pd.dots.map((d) => d.marker.color + d.marker.shape)).size, 7);
  const svg = stripSvg(lay, 'deneme <etiket>');
  assert.match(svg, /^<svg /);
  assert.ok(svg.includes('aria-label="deneme &lt;etiket&gt;"'));
  assert.ok(svg.includes('stroke-dasharray="3 3"'), 'threshold drawn with a dashed line');
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
});

/* ---------- Table HTML ---------- */

test('table: header, row and median row match the column count; external text is escaped', () => {
  const cells = (html: string): number => (html.match(/<t[dh][\s>]/g) ?? []).length;
  assert.equal(cells(headHtml(PEER_COLS, { key: 'verdict', dir: 1 })), 11);
  assert.equal(cells(headHtml(listCols('US'), { key: 'pe', dir: -1 })), 13);
  assert.ok(headHtml(PEER_COLS, { key: 'pe', dir: -1 }).includes('F/K ↓'));

  const evil = withFields('THYAO', { name: '<img src=x onerror=1>', price: 110, sma50: 100, sma200: 125 });
  const [r] = buildRows([evil], DEF);
  const peer = peerRowHtml(r, DEF, false);
  assert.equal(cells(peer), 11);
  assert.ok(!peer.includes('<img'));
  assert.ok(peer.includes('&lt;img src=x onerror=1&gt;'));
  assert.ok(peer.includes('title="50 günlük ortalama: 100,00 TL"'));
  assert.ok(peer.includes('>+%10,0<'));
  assert.ok(peer.includes('>%-12,0<'));
  assert.ok(peer.includes('aria-expanded="false"') && peer.includes('tabindex="0"'));
  const list = listRowHtml(r, DEF, true);
  assert.equal(cells(list), 13);
  assert.ok(list.includes('aria-expanded="true"'));

  const med = medianRowHtml(industryMedian([view('THYAO'), view('PGSUS')]));
  assert.ok(med.startsWith('<tr class="med"><td colspan="2">'));
  assert.equal(cells(med), 10, '2 merged columns + 9 cells = 11 columns');

  const [w] = buildRows([view('VZ')], DEF);
  const waiting = peerRowHtml(w, DEF, false);
  assert.ok(waiting.includes('Veri bekliyor'));
  assert.ok(!/NaN|null|undefined/.test(waiting));
});

test('summaryHtml: the "waiting for data" pill only when such stocks exist; the "bank" pill only while banks are shown', () => {
  const base = { good: 1, warn: 2, bad: 3, bank: 5, waiting: 0 };
  const a = summaryHtml(base, false);
  assert.ok(a.includes('Temiz aday: 1') && a.includes('Uyarılı aday: 2') && a.includes('Elendi: 3'));
  assert.ok(!a.includes('Veri bekliyor') && !a.includes('Banka'));
  assert.ok(summaryHtml(base, true).includes('Banka: 5'));
  assert.ok(summaryHtml({ ...base, waiting: 4 }, false).includes('– Veri bekliyor: 4'));
});

/* ---------- Expanded row ---------- */

const flat = (n: number, v: number): number[] => new Array<number>(n).fill(v);
const dayList = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
const mkSeries = (c: number[]): PriceSeries => ({ symbol: 'THYAO', market: 'BIST', currency: 'TRY', dates: dayList(c.length), closes: c });

test('trendSentence: a single sentence based on the order of the price and the averages', () => {
  assert.equal(trendSentence(120, 110, 100), 'Fiyat 50 ve 200 günlük ortalamaların üstünde: eğilim yukarı.');
  assert.equal(trendSentence(90, 100, 110), 'Fiyat 50 ve 200 günlük ortalamaların altında: eğilim aşağı.');
  assert.match(trendSentence(105, 100, 110), /50 günlük ortalamanın üstünde, 200 günlük ortalamanın altında/);
  assert.match(trendSentence(120, 100, 110), /eğilim karışık/);
  assert.match(trendSentence(120, 110, null), /200 günlük ortalama için yeterli veri yok/);
  assert.match(trendSentence(null, 110, 100), /yeterli fiyat verisi yok/);
});

test('crossSentence: reports a recent golden or death cross with its date', () => {
  const golden = mkSeries([...flat(200, 100), ...flat(30, 90), ...flat(30, 130)]);
  const g = crossSentence(golden);
  assert.ok(g && /altın kesişim \(golden cross\)/.test(g) && /2025\)\.$/.test(g), String(g));
  const death = mkSeries([...flat(200, 100), ...flat(30, 110), ...flat(30, 70)]);
  assert.match(String(crossSentence(death)), /ölüm kesişimi \(death cross\)/);
  assert.equal(crossSentence(mkSeries(flat(260, 100))), null);
  assert.equal(crossSentence(null), null);
});

test('smaView: averages come from the data first, otherwise from the price series; with neither there is no sentence', () => {
  const none = smaView(view('THYAO'), null);
  assert.deepEqual(none.avgs.map((a) => a.v), [null, null, null]);
  assert.deepEqual(none.sentences, []);

  const fromFields = smaView(withFields('THYAO', { price: 110, sma20: 105, sma50: 100, sma200: 90 }), null);
  assert.deepEqual(fromFields.avgs.map((a) => a.v), [105, 100, 90]);
  near(fromFields.avgs[1].dist, 10, 1e-9);
  assert.deepEqual(fromFields.sentences, ['Fiyat 50 ve 200 günlük ortalamaların üstünde: eğilim yukarı.']);

  const fromSeries = smaView(withFields('THYAO', { price: 120 }), mkSeries([...flat(200, 100), ...flat(60, 120)]));
  near(fromSeries.avgs[0].v, 120, 1e-9);
  near(fromSeries.avgs[2].v, (140 * 100 + 60 * 120) / 200, 1e-9);
  assert.ok(fromSeries.sentences.length >= 1);

  assert.equal(distPhrase(4.21), 'fiyat %4,2 üstünde');
  assert.equal(distPhrase(-3.14), 'fiyat %3,1 altında');
  assert.equal(distPhrase(null), '');
});

test('extraInfo and noteHtml: the target price in the stock\'s currency; the comment is labelled with its date', () => {
  const thy = extraInfo(view('THYAO')).join(' ');
  assert.ok(thy.includes('Yaklaşık özkaynak kârlılığı %11,1 (PD/DD 0,40 ÷ F/K 3,60).'));
  assert.ok(thy.includes('PD/DD 0,40: piyasa şirketi özkaynağının altında fiyatlıyor.'));
  assert.ok(thy.includes('Fonksiyonel para birimi USD'));
  assert.ok(thy.includes('hedefi 454,33 TL, fiyat 291,00 TL (nominal potansiyel +%56)'));
  const usd = extraInfo(withFields('VZ', { price: 40, targetPrice: 50, currency: 'USD' })).join(' ');
  assert.ok(usd.includes('hedefi 50,00 USD, fiyat 40,00 USD (nominal potansiyel +%25)'));
  assert.deepEqual(extraInfo(view('VZ')), []);

  assert.ok(noteHtml(view('THYAO')).includes('Yorum (2 Ekim 2026 verisine göre yazıldı):'));
  assert.equal(noteHtml(view('VZ')), '');
  // A comment is hidden when the data is newer; it is shown with the data of the same day
  assert.equal(noteHtml(view('THYAO'), '2026-10-05T18:45:00+03:00'), '');
  assert.ok(noteHtml(view('THYAO'), '2026-10-02T15:00:00+03:00').includes('Yorum (2 Ekim 2026'));
  assert.ok(!noteHtml(withFields('THYAO', { note: '<b>x</b>' })).includes('<b>x</b>'));
});

test('detailHtml: for a stock with no data it only says the data is awaited', () => {
  const [w] = buildRows([view('VZ')], DEF);
  const html = detailHtml(w.s, w.ev, { id: 'US-VZ', ai: '<i>AI</i>', sma: '<i>SMA</i>' });
  assert.ok(html.includes('verisi henüz gelmedi'));
  assert.ok(!html.includes('<i>AI</i>') && !html.includes('<i>SMA</i>') && !html.includes('Ölçüt ölçüt'));

  const [r] = buildRows([view('THYAO')], DEF);
  const full = detailHtml(r.s, r.ev, { id: 'BIST-THYAO', ai: '<i>AI</i>', sma: '<i>SMA</i>' });
  for (const part of ['Ölçüt ölçüt', 'Türk Hava Yolları · Havayolu <span lang="en">(Airlines)</span>', '<i>AI</i>', 'Ek bilgiler', '<i>SMA</i>'])
    assert.ok(full.includes(part), part);

  // The label is upper-cased; the language is set so the English name and industry name are not cased with Turkish rules ("İ").
  const [u] = buildRows([withFields('VZ', { price: 40, pe: 9, pb: 1.5, evEbitda: 7 })], DEF);
  const us = detailHtml(u.s, u.ev, { id: 'US-VZ', ai: '', sma: '' });
  assert.ok(us.includes(`<span lang="en">${u.s.name}</span> · `), 'the name of the US stock is marked as English');
  assert.ok(us.includes(`<span lang="en">(${u.s.industryEn})</span>`));
});

test('smaBlockHtml: a note instead of the chart when there is no price file; no made-up values', () => {
  const noFile = smaBlockHtml(view('THYAO'), null, '2 Ekim 2026', 'sc-sma-x');
  assert.ok(noFile.includes('Fiyat serisi henüz yok; ilk veri güncellemesinde gelir.'));
  assert.ok(!noFile.includes('chartbox'));
  assert.ok(noFile.includes('291,00 TL'));
  assert.equal((noFile.match(/<div class="v">–<\/div>/g) ?? []).length, 3, 'üç ortalama da "–"');
  assert.ok(noFile.includes('Ortalama eğilimi gösterir, değeri değil'));

  const loading = smaBlockHtml(view('THYAO'), undefined, '2 Ekim 2026', 'sc-sma-x');
  assert.ok(loading.includes('yükleniyor'));

  const withFile = smaBlockHtml(withFields('THYAO', { price: 120 }), mkSeries([...flat(200, 100), ...flat(60, 120)]), '', 'sc-sma-x');
  assert.ok(withFile.includes('<div class="chartbox" id="sc-sma-x"></div>'));
  assert.ok(withFile.includes('200 günlük ortalama (kesikli)'));
  assert.ok(withFile.includes('Son 250 işlem günü'));
  assert.ok(withFile.includes('<span lang="en">Simple moving averages (SMA)</span>'));

  // An average not drawn on a short series is not listed in the legend either.
  const short = smaBlockHtml(withFields('THYAO', { price: 100 }), mkSeries(flat(120, 100)), '', 'sc-sma-x');
  assert.ok(short.includes('20 günlük ortalama</span>') && short.includes('50 günlük ortalama</span>'));
  assert.ok(!short.includes('(kesikli)'), 'a 120-day series has no 200-day average');
  assert.ok(short.includes('Son 120 işlem günü'));
  assert.equal(smaLegendHtml(20).includes('20 günlük ortalama'), false, '20 days give a single point, so there is no line');
  assert.equal(smaLegendHtml(21).includes('20 günlük ortalama'), true);
  assert.equal(smaLegendHtml(201).includes('200 günlük ortalama (kesikli)'), true);
});

test('smaChartModel: last 250 days, four lines, axis range covers the data', () => {
  const c = Array.from({ length: 320 }, (_, i) => 100 + 20 * Math.sin(i / 25) + i * 0.1);
  const s = mkSeries(c);
  assert.equal(seriesUsable(s), true);
  assert.equal(seriesUsable(mkSeries([1])), false);
  assert.equal(seriesUsable({ ...s, dates: s.dates.slice(1) }), false);
  const m = smaChartModel(s, 900);
  assert.ok(m);
  assert.equal(m.end - m.start + 1, SMA_WINDOW);
  assert.deepEqual(m.lines.map((l) => l.id), ['sma200', 'sma50', 'sma20', 'price']);
  assert.equal(m.lines[3].n, 250);
  assert.equal(m.start, 70);
  assert.equal(m.lines[0].n, 320 - 199, 'the 200-day average starts on the 200th day of the series');
  const shownVals = c.slice(m.start);
  assert.ok(m.yLo < Math.min(...shownVals) && m.yHi > Math.max(...shownVals));
  assert.ok(m.yTicks.length >= 3 && m.yTicks.every((t) => t.y >= m.m.t - 1 && t.y <= m.H - m.m.b + 1));
  assert.ok(m.xTicks.length >= 2 && m.xTicks.every((t) => t.x >= m.m.l && t.x <= 900 - m.m.r));
  const svg = smaChartSvg(s, 900, 'deneme');
  assert.ok(svg && (svg.match(/<polyline /g) ?? []).length === 4);
  assert.ok(svg.includes('stroke-dasharray="6 5"'));
  assert.ok(!/NaN|undefined|Infinity/.test(svg));

  // Short series: the 200-day average is not drawn
  const short = smaChartModel(mkSeries(c.slice(0, 120)), 600);
  assert.ok(short);
  assert.equal(short.lines[0].n, 0);
  assert.equal(short.lines[3].n, 120);
  assert.equal(smaChartModel(s, 0), null);
});

/* ---------- AI boxes ---------- */

const OFF: AiStatus = { configured: false, provider: 'anthropic', providerLabel: 'Claude', model: '' };
const ON: AiStatus = { configured: true, provider: 'anthropic', providerLabel: 'Claude', model: 'claude-x' };
const TEXT: AiText = {
  text: 'Birinci paragraf <script>x</script>\n\nİkinci paragraf',
  providerLabel: 'Claude',
  model: 'claude-x',
  cached: false,
  createdAt: '2026-10-04T00:00:00Z',
};

test('AI boxes: when off they point to Settings, when on they offer only the button', () => {
  const off = compareBlockHtml('BIST:airlines', undefined, OFF, { industryTr: 'Havayolu', withData: 2 });
  assert.ok(off.includes("Ayarlar'da yapay zekâyı aç") && off.includes('data-act="goto-settings"'));
  assert.ok(!off.includes('ai-compare'));

  const on = compareBlockHtml('BIST:airlines', undefined, ON, { industryTr: 'Havayolu', withData: 2 });
  assert.ok(on.includes('>Karşılaştır</button>') && on.includes('data-force="0"'));
  const one = compareBlockHtml('BIST:airlines', undefined, ON, { industryTr: 'Havayolu', withData: 1 });
  assert.ok(!one.includes('<button') && one.includes('en az iki hisse'));

  const busy = compareBlockHtml('BIST:airlines', { status: 'loading', token: 1 }, ON, { industryTr: 'Havayolu', withData: 2 });
  assert.ok(busy.includes('class="spin"') && busy.includes(' disabled'));

  const done = compareBlockHtml('BIST:airlines', { status: 'done', result: TEXT, token: 1 }, ON, { industryTr: 'Havayolu', withData: 2 });
  assert.ok(done.includes('class="learn ai-text"'));
  assert.ok(done.includes('<p>Birinci paragraf &lt;script&gt;x&lt;/script&gt;</p><p>İkinci paragraf</p>'));
  assert.ok(done.includes('Claude (claude-x) ile yazıldı. Yatırım tavsiyesi değildir.'));
  assert.ok(done.includes('>Yeniden karşılaştır</button>') && done.includes('data-force="1"'));

  const err = compareBlockHtml('BIST:airlines', { status: 'error', error: 'Hata <b>', token: 2 }, ON, { industryTr: 'Havayolu', withData: 2 });
  assert.ok(err.includes('<p class="note" role="alert">Hata &lt;b&gt;</p>'));
});

test('stock comment box: when off a single line and the Settings link; when on Yorumla / Yeniden yorumla', () => {
  const off = commentBlockHtml('BIST-THYAO', undefined, OFF);
  assert.ok(off.includes('<a href="#settings">') && !off.includes('<button'));
  const on = commentBlockHtml('BIST-THYAO', undefined, ON);
  assert.ok(on.includes('>Yorumla</button>') && on.includes('data-key="BIST-THYAO"'));
  const done = commentBlockHtml('BIST-THYAO', { status: 'done', result: TEXT, token: 1 }, ON);
  assert.ok(done.includes('>Yeniden yorumla</button>') && done.includes('&lt;script&gt;'));
  assert.ok(!done.includes('<script>'));
});

/* ---------- Calculator ---------- */

test('calculator: the BIM example gives the first release\'s results', () => {
  const m = calcMultiples(BIM_EXAMPLE);
  near(m.pe, 16.78);
  near(m.pb, 2.46);
  near(m.evEbitda, 9.47);
  near(m.peg, 0.38);
  near(m.roe, 14.67);
  near(m.netDebtEbitda, 0.58);
  // Same as the BIMAS multiples in the table (the source computes from the same figures)
  const bim = view('BIMAS');
  near(m.pe, bim.pe as number);
  near(m.pb, bim.pb as number);
  near(m.evEbitda, bim.evEbitda as number);
  near(m.peg, bim.peg as number);
  near(m.netDebtEbitda, bim.netDebtEbitda as number);

  const { ev } = calcEvaluate(BIM_EXAMPLE, DEF);
  assert.equal(ev.verdict, 'good');
  assert.deepEqual(ev.checks.map((c) => [c.id, c.status]), [
    ['profit', 'good'],
    ['pe', 'good'],
    ['peg', 'good'],
    ['growthQuality', 'good'],
    ['debt', 'good'],
  ]);
  assert.equal(ev.checks[1].long, 'F/K 16,78, eşiğin (30) altında. Kâr sabit kalsa fiyatı yaklaşık 17 yılda geri öder.');
});

test('calculator: thresholds, loss, cyclicality and uncomputable debt', () => {
  assert.equal(calcEvaluate(BIM_EXAMPLE, { ...DEF, maxPe: 15 }).ev.verdict, 'bad');
  const cyc = calcEvaluate({ ...BIM_EXAMPLE, cyc: true }, DEF).ev;
  assert.equal(cyc.verdict, 'warn');
  assert.equal(cyc.checks.at(-1)?.long, 'Bu sektör döngüsel bir sektör; bugünkü kâr ortalamanın üstünde veya altında olabilir.');
  assert.equal(calcEvaluate({ ...BIM_EXAMPLE, cyc: true }, { ...DEF, warnCyclical: false }).ev.verdict, 'good');

  const loss = calcEvaluate({ ...BIM_EXAMPLE, netIncome: -5 }, DEF);
  assert.equal(loss.m.pe, null);
  assert.equal(loss.m.peg, null);
  assert.equal(loss.ev.checks[0].status, 'bad');

  const cash = calcMultiples({ ...BIM_EXAMPLE, netDebt: -40 });
  near(cash.netDebtEbitda, -0.717);
  near(cash.evEbitda, (495.6 - 40) / 55.75);

  // No net debt entered: EV/EBITDA is computed without debt, and the debt check fails without writing a made-up ratio
  const noDebt = calcEvaluate({ ...BIM_EXAMPLE, netDebt: NaN }, DEF);
  assert.equal(noDebt.m.netDebtEbitda, null);
  near(noDebt.m.evEbitda, 495.6 / 55.75);
  const debt = noDebt.ev.checks.find((c) => c.id === 'debt');
  assert.equal(debt?.status, 'bad');
  assert.ok(debt && !/\d/.test(debt.long), 'the text contains no digits');
  assert.equal(noDebt.ev.verdict, 'bad');

  // Empty inputs: everything shows "–", the verdict is still computed
  const empty = calcMultiples({
    marketCap: NaN,
    netIncome: NaN,
    equity: NaN,
    ebitda: NaN,
    netDebt: NaN,
    netIncomeGrowth: NaN,
    ebitdaGrowth: NaN,
    cyc: false,
  });
  assert.deepEqual(empty, { pe: null, pb: null, evEbitda: null, peg: null, roe: null, netDebtEbitda: null });
  // With zero growth PEG is not computed
  assert.equal(calcMultiples({ ...BIM_EXAMPLE, netIncomeGrowth: 0 }).peg, null);
});
