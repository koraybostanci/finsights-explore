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
import { BIM_EXAMPLE, calcEvaluate, calcMultiples } from '../src/calc/logic.ts';

const DATA = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url), 'utf8')) as MarketData;
const views: StockView[] = DATA.stocks.map((s) => toView(s, DATA.industries));
const view = (k: string): StockView => {
  const v = views.find((s) => s.symbol === k);
  assert.ok(v, `${k} veride yok`);
  return v;
};
const bist = views.filter((s) => s.market === 'BIST' && !s.bank);
const us = views.filter((s) => s.market === 'US');

/** Deneme için hisse: gerçek bir hissenin kopyası, verilen alanlar değiştirilmiş */
const withFields = (k: string, patch: Partial<StockView>): StockView => ({ ...view(k), ...patch });

const near = (a: number | null, b: number, eps = 0.005): void => {
  assert.ok(a != null && Math.abs(a - b) <= eps, `${a} ≈ ${b} değil`);
};

/* ---------- Sıralama ---------- */

test('sortRows: sonuç sırası temiz → uyarılı → elendi, uyarı sayısı az olan önde', () => {
  const rows = sortRows(buildRows(bist, DEF), 'verdict', 1);
  const ord = rows.map((r) => ({ good: 0, warn: 1, bad: 2, na: 3 })[r.ev.verdict] * 10 + r.ev.warns);
  assert.deepEqual(ord, [...ord].sort((a, b) => a - b));
  assert.equal(rows[0].ev.verdict, 'good');
  assert.equal(rows[rows.length - 1].ev.verdict, 'bad');
});

test('sortRows: boş değerler iki yönde de sonda kalır, girdi dizisi değişmez', () => {
  const rows = buildRows(bist, DEF);
  const before = rows.map((r) => r.s.symbol);
  for (const dir of [1, -1] as const) {
    const out = sortRows(rows, 'pe', dir);
    const firstNull = out.findIndex((r) => r.s.pe == null);
    assert.ok(firstNull > 0);
    assert.ok(out.slice(firstNull).every((r) => r.s.pe == null), 'zarar edenler sonda');
    const vals = out.slice(0, firstNull).map((r) => r.s.pe as number);
    assert.deepEqual(vals, [...vals].sort((a, b) => (a - b) * dir));
  }
  assert.deepEqual(rows.map((r) => r.s.symbol), before);
});

test('sortRows: hisse koduna göre Türkçe sıralama ve ortalama uzaklığına göre sıralama', () => {
  const rows = buildRows(bist, DEF);
  const byK = sortRows(rows, 'symbol', 1).map((r) => r.s.symbol);
  assert.deepEqual(byK, [...byK].sort((a, b) => a.localeCompare(b, 'tr')));
  const a = withFields('THYAO', { price: 110, sma200: 100 });
  const b = withFields('PGSUS', { price: 90, sma200: 100 });
  const c = withFields('TCELL', { sma200: null });
  const out = sortRows(buildRows([c, b, a], DEF), 'd200', -1).map((r) => r.s.symbol);
  assert.deepEqual(out, ['THYAO', 'PGSUS', 'TCELL']);
});

test('nextSort: aynı sütunda yön döner; yeni sütunda çarpanlar artan, büyüme azalan başlar', () => {
  assert.deepEqual(nextSort({ key: 'verdict', dir: 1 }, 'verdict'), { key: 'verdict', dir: -1 });
  assert.deepEqual(nextSort({ key: 'verdict', dir: -1 }, 'pe'), { key: 'pe', dir: 1 });
  assert.deepEqual(nextSort({ key: 'pe', dir: 1 }, 'ebitdaGrowth'), { key: 'ebitdaGrowth', dir: -1 });
  for (const k of ['symbol', 'verdict', 'pe', 'pb', 'evEbitda', 'peg', 'netDebtEbitda'] as const) assert.equal(defaultDir(k), 1);
  for (const k of ['ebitdaGrowth', 'netIncomeGrowth', 'roe', 'marketCap', 'd50', 'd200'] as const) assert.equal(defaultDir(k), -1);
});

/* ---------- Sütunlar ---------- */

test('listCols: ilk sürümün sütun sırası + Net borç/FAVÖK ten sonra 200g ort.; piyasa değeri para birimiyle', () => {
  const keys = listCols('BIST').map((c) => c.key);
  assert.deepEqual(keys, ['symbol', 'verdict', 'why', 'pe', 'pb', 'evEbitda', 'peg', 'netDebtEbitda', 'd200', 'ebitdaGrowth', 'netIncomeGrowth', 'roe', 'marketCap']);
  assert.equal(listCols('BIST').at(-1)?.en, 'Market cap, bn TL');
  assert.equal(listCols('US').at(-1)?.en, 'Market cap, bn USD');
  assert.deepEqual(
    PEER_COLS.map((c) => c.key),
    ['symbol', 'verdict', 'pe', 'pb', 'evEbitda', 'peg', 'netDebtEbitda', 'ebitdaGrowth', 'roe', 'd50', 'd200'],
  );
});

/* ---------- Süzgeç ---------- */

test('200 günlük ortalamanın üstünde süzgeci: ortalaması olmayan ve altında kalan gizlenir', () => {
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

test('countVerdicts: verisi olmayanlar ayrı sayılır; bankalar "Banka" sayısına girer', () => {
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

/* ---------- Sektör seçimi ---------- */

test('orderGroups ve pickIndustry: kıyaslanabilir sektörler önde; hatırlanan kaybolursa ilk sektör', () => {
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
  // Hisselerim'de yalnız tek hisseli sektörler kaldıysa yine ilk sektör seçilir
  const singles = orderGroups(groupByIndustry([view('TUPRS'), view('ASELS')]));
  assert.equal(pickIndustry(singles, 'airlines'), singles[0].industry);
});

/* ---------- Eşikler ---------- */

test('sanitizeThresholds: eski anahtarlı (şema 1) kayıt ve yanlış türler alan alan varsayılana döner', () => {
  // Eski sürümün sakladığı biçim: yeni kod bu anahtarları okumaz, varsayılana düşer
  assert.deepEqual(sanitizeThresholds({ fk: 50, peg: 2, nb: 4, fg: 10, cyc: false, bank: true }), DEF);
  // Yeni anahtarlar geçerliyse korunur, eski anahtarlar yok sayılır
  assert.deepEqual(sanitizeThresholds({ fk: 50, maxPeg: 2, bank: true, showBanks: false }), { ...DEF, maxPeg: 2 });
  // Nesne olmayan değerler
  for (const raw of [undefined, 'abc', 42, true, [], [1, 2]]) assert.deepEqual(sanitizeThresholds(raw), DEF);
  // Yanlış türler tek tek düşer, geçerli alanlar kalır
  assert.deepEqual(
    sanitizeThresholds({ maxPe: '20', maxPeg: null, maxNetDebtEbitda: Infinity, minEbitdaGrowth: -5, warnCyclical: 'yes', showBanks: true }),
    { ...DEF, minEbitdaGrowth: -5, showBanks: true },
  );
});

test('getThresholds: localStorage\'daki eski biçim uygulamayı bozmaz, varsayılan eşikler gelir', () => {
  const stored: Record<string, string> = { 'finsights.thresholds': JSON.stringify({ fk: 50, peg: 2, nb: 4, fg: 10, cyc: false, bank: true }) };
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => stored[k] ?? null,
    setItem: (k: string, v: string) => void (stored[k] = v),
    removeItem: (k: string) => void delete stored[k],
  };
  assert.deepEqual(getThresholds(), DEF);
});

test('sanitizeThresholds ve parseThreshold: bozuk ya da boş değer varsayılana döner', () => {
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

/* ---------- Şerit grafik: ölçek ---------- */

test('niceStep ve stripScale: sıfırı içerir, veriyi kapsar, adım düzgün', () => {
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

/* ---------- Şerit grafik: etiket yerleşimi ---------- */

const overlaps = (a: { x: number; w: number }, b: { x: number; w: number }): boolean =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2;

test('placeLabels: uzak etiketler aynı satırda, yakınlar kaydırılır, sığmayan gösterilmez', () => {
  const far = placeLabels([{ x: 100, w: 30 }, { x: 300, w: 30 }], 0, 400);
  assert.deepEqual(far.map((p) => [p.level, p.shown]), [[0, true], [0, true]]);

  const close = placeLabels([{ x: 200, w: 30 }, { x: 210, w: 30 }], 0, 400);
  assert.deepEqual(close.map((p) => p.shown), [true, true]);
  assert.notEqual(close[0].level, close[1].level);

  const three = placeLabels([{ x: 200, w: 30 }, { x: 204, w: 30 }, { x: 208, w: 30 }], 0, 400);
  assert.equal(three.filter((p) => p.shown).length, 2, 'iki satır var; üçüncü etiket düşer');

  // Kenara taşan etiket içeri çekilir
  const edge = placeLabels([{ x: 2, w: 40 }, { x: 399, w: 40 }], 0, 400);
  assert.equal(edge[0].x, 20);
  assert.equal(edge[1].x, 380);
});

test('placeLabels: gösterilen etiketler kendi satırında hiç çakışmaz (rastgele girdiler)', () => {
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
        assert.ok(!overlaps({ x: out[i].x, w: items[i].w }, { x: out[j].x, w: items[j].w }), `tur ${round}`);
      }
    for (let i = 0; i < n; i++) {
      assert.ok(out[i].x - items[i].w / 2 >= -1e-9 && out[i].x + items[i].w / 2 <= 500 + 1e-9);
    }
  }
});

test('dotOffsets: üst üste gelen işaretler dikeyde ayrılır', () => {
  assert.deepEqual(dotOffsets([10, 100, 200]), [0, 0, 0]);
  const two = dotOffsets([100, 103]);
  assert.equal(two[0], 0);
  assert.notEqual(two[1], 0);
  const three = dotOffsets([100, 101, 102]);
  assert.equal(new Set(three).size, 3);
  const five = dotOffsets([100, 100, 100, 100, 100]);
  assert.equal(new Set(five).size, 5, 'aynı değerde beş işaret ayrı ayrı görünür');
  assert.deepEqual([...five].sort((a, b) => a - b), [-22, -11, 0, 11, 22]);
});

test('layoutStrips: ortanca çentiği üstüne yığılan işaretlerden taşar; değer etiketleri yığının üstünde kalır', () => {
  const same = ['A', 'B', 'C', 'D', 'E'].map((k) => ({ symbol: k, pe: null, pb: 2.5, evEbitda: null, netDebtEbitda: null }));
  const far = { symbol: 'Z', pe: null, pb: 9, evEbitda: null, netDebtEbitda: null };
  const defs = buildStripDefs([...same, far], { pe: null, pb: 2.5, evEbitda: null, netDebtEbitda: null }, DEF.maxNetDebtEbitda);
  const lay = layoutStrips(defs, 560, new Map());
  const pd = lay.strips[0];
  const offs = pd.dots.filter((d) => d.symbol !== 'Z').map((d) => d.y - pd.y);
  assert.equal(new Set(offs).size, 5);
  assert.ok(pd.medianTick.up > Math.max(...offs.map((o) => -o)) + 6, 'çentik yukarıda işaretlerden taşar');
  assert.ok(pd.medianTick.down > Math.max(...offs) + 6, 'çentik aşağıda işaretlerden taşar');
  for (const v of pd.values.filter((x) => x.shown)) assert.ok(v.y <= pd.y - pd.medianTick.up, 'değer etiketi çentiğin üstünde');
  for (const b of pd.below.filter((x) => x.shown)) assert.ok(b.y - 11.5 >= pd.y + pd.medianTick.down, 'ortanca etiketi çentiğin altında');

  // Yığın yokken çentik eski boyunda kalır.
  const two = buildStripDefs([{ symbol: 'A', pe: null, pb: 1, evEbitda: null, netDebtEbitda: null }, far], { pe: null, pb: 5, evEbitda: null, netDebtEbitda: null }, DEF.maxNetDebtEbitda);
  assert.deepEqual(layoutStrips(two, 560, new Map()).strips[0].medianTick, { up: 12, down: 12 });
});

test('markerFor: dört renk; dörtten fazla hissede renkler başka biçimlerle yeniden kullanılır', () => {
  const ms = Array.from({ length: 16 }, (_, i) => markerFor(i));
  assert.deepEqual(ms.slice(0, 4).map((m) => m.color), ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)']);
  assert.ok(ms.slice(0, 4).every((m) => m.shape === 'circle'));
  assert.equal(ms[4].color, 'var(--c1)');
  assert.notEqual(ms[4].shape, 'circle');
  assert.equal(new Set(ms.map((m) => m.color + m.shape)).size, 16);
});

/* ---------- Şerit grafik: tanımlar ve yerleşim ---------- */

test('buildStripDefs: F/K şeridi en az iki hissede F/K varsa; eşik yalnız borç şeridinde', () => {
  const air = [view('THYAO'), view('PGSUS')]; // PGSUS zararda: F/K yok
  const defsAir = buildStripDefs(air, industryMedian(air), DEF.maxNetDebtEbitda);
  assert.deepEqual(defsAir.map((d) => d.key), ['pb', 'evEbitda', 'netDebtEbitda']);
  assert.equal(defsAir[2].threshold, 2.5);
  assert.equal(defsAir[0].threshold, undefined);
  near(defsAir[0].median, 0.515);

  const tel = [view('TTKOM'), view('TCELL')];
  assert.deepEqual(buildStripDefs(tel, industryMedian(tel), DEF.maxNetDebtEbitda).map((d) => d.key), ['pe', 'pb', 'evEbitda', 'netDebtEbitda']);

  const usTel = [view('VZ'), view('T')];
  assert.deepEqual(buildStripDefs(usTel, industryMedian(usTel), DEF.maxNetDebtEbitda), [], 'verisi olmayan sektörde şerit yok');
});

test('layoutStrips: noktalar şeridin içinde, etiketler çakışmaz, eşik ve ortanca işaretli', () => {
  for (const W of [300, 420, 587, 900]) {
    for (const g of groupByIndustry(bist)) {
      const defs = buildStripDefs(g.stocks, industryMedian(g.stocks), DEF.maxNetDebtEbitda);
      const markers = new Map(g.stocks.map((s, i) => [s.symbol, markerFor(i)]));
      const lay = layoutStrips(defs, W, markers);
      assert.ok(lay.H > 0);
      let prevBottom = -Infinity;
      for (const s of lay.strips) {
        assert.ok(s.y > prevBottom, 'şeritler alt alta');
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
      const nb = lay.strips.find((s) => s.def.key === 'netDebtEbitda');
      if (nb) assert.ok(nb.below.some((b) => b.kind === 'threshold'), 'borç şeridinde eşik etiketi');
    }
  }
});

test('layoutStrips: yakın değerlerde değer etiketleri kaydırılır ya da düşer; yedi hissede biçimler ayrışır', () => {
  const list = ['THYAO', 'PGSUS', 'TTKOM', 'TCELL', 'KCHOL', 'SAHOL', 'EKGYO'].map((k) => view(k)); // PD/DD 0,40–0,70
  const defs = buildStripDefs(list, industryMedian(list), DEF.maxNetDebtEbitda);
  const markers = new Map(list.map((s, i) => [s.symbol, markerFor(i)]));
  const lay = layoutStrips(defs, 560, markers);
  const pd = lay.strips.find((s) => s.def.key === 'pb');
  assert.ok(pd);
  assert.equal(pd.dots.length, 7);
  assert.ok(pd.values.some((v) => !v.shown), 'yedi yakın değerin hepsi yazılmaz');
  assert.ok(new Set(pd.values.filter((v) => v.shown).map((v) => v.y)).size >= 2, 'etiketler iki satıra yayılır');
  assert.equal(new Set(pd.dots.map((d) => d.marker.color + d.marker.shape)).size, 7);
  const svg = stripSvg(lay, 'deneme <etiket>');
  assert.match(svg, /^<svg /);
  assert.ok(svg.includes('aria-label="deneme &lt;etiket&gt;"'));
  assert.ok(svg.includes('stroke-dasharray="3 3"'), 'eşik kesikli çizgiyle');
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
});

/* ---------- Tablo HTML'i ---------- */

test('tablo: başlık, satır ve ortanca satırı sütun sayısıyla uyumlu; dış metin kaçırılır', () => {
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
  assert.equal(cells(med), 10, '2 sütun birleşik + 9 hücre = 11 sütun');

  const [w] = buildRows([view('VZ')], DEF);
  const waiting = peerRowHtml(w, DEF, false);
  assert.ok(waiting.includes('Veri bekliyor'));
  assert.ok(!/NaN|null|undefined/.test(waiting));
});

test('summaryHtml: "Veri bekliyor" yalnızca böyle hisse varsa; "Banka" yalnızca bankalar gösterilirken', () => {
  const base = { good: 1, warn: 2, bad: 3, bank: 5, waiting: 0 };
  const a = summaryHtml(base, false);
  assert.ok(a.includes('Temiz aday: 1') && a.includes('Uyarılı aday: 2') && a.includes('Elendi: 3'));
  assert.ok(!a.includes('Veri bekliyor') && !a.includes('Banka'));
  assert.ok(summaryHtml(base, true).includes('Banka: 5'));
  assert.ok(summaryHtml({ ...base, waiting: 4 }, false).includes('– Veri bekliyor: 4'));
});

/* ---------- Açılan satır ---------- */

const flat = (n: number, v: number): number[] => new Array<number>(n).fill(v);
const dayList = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
const mkSeries = (c: number[]): PriceSeries => ({ symbol: 'THYAO', market: 'BIST', currency: 'TRY', dates: dayList(c.length), closes: c });

test('trendSentence: fiyatın ve ortalamaların sırasına göre tek cümle', () => {
  assert.equal(trendSentence(120, 110, 100), 'Fiyat 50 ve 200 günlük ortalamaların üstünde: eğilim yukarı.');
  assert.equal(trendSentence(90, 100, 110), 'Fiyat 50 ve 200 günlük ortalamaların altında: eğilim aşağı.');
  assert.match(trendSentence(105, 100, 110), /50 günlük ortalamanın üstünde, 200 günlük ortalamanın altında/);
  assert.match(trendSentence(120, 100, 110), /eğilim karışık/);
  assert.match(trendSentence(120, 110, null), /200 günlük ortalama için yeterli veri yok/);
  assert.match(trendSentence(null, 110, 100), /yeterli fiyat verisi yok/);
});

test('crossSentence: yakın zamandaki altın ya da ölüm kesişimini tarihiyle söyler', () => {
  const golden = mkSeries([...flat(200, 100), ...flat(30, 90), ...flat(30, 130)]);
  const g = crossSentence(golden);
  assert.ok(g && /altın kesişim \(golden cross\)/.test(g) && /2025\)\.$/.test(g), String(g));
  const death = mkSeries([...flat(200, 100), ...flat(30, 110), ...flat(30, 70)]);
  assert.match(String(crossSentence(death)), /ölüm kesişimi \(death cross\)/);
  assert.equal(crossSentence(mkSeries(flat(260, 100))), null);
  assert.equal(crossSentence(null), null);
});

test('smaView: ortalamalar önce veriden, yoksa fiyat serisinden; hiçbiri yoksa cümle de yok', () => {
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

test('extraInfo ve noteHtml: hedef fiyat hissenin para birimiyle; yorum tarihiyle etiketlenir', () => {
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
  // Veri yorumdan yeniyse yorum gösterilmez; aynı günün verisiyle gösterilir
  assert.equal(noteHtml(view('THYAO'), '2026-10-05T18:45:00+03:00'), '');
  assert.ok(noteHtml(view('THYAO'), '2026-10-02T15:00:00+03:00').includes('Yorum (2 Ekim 2026'));
  assert.ok(!noteHtml(withFields('THYAO', { note: '<b>x</b>' })).includes('<b>x</b>'));
});

test('detailHtml: verisi olmayan hissede yalnızca verinin beklendiği yazar', () => {
  const [w] = buildRows([view('VZ')], DEF);
  const html = detailHtml(w.s, w.ev, { id: 'US-VZ', ai: '<i>AI</i>', sma: '<i>SMA</i>' });
  assert.ok(html.includes('verisi henüz gelmedi'));
  assert.ok(!html.includes('<i>AI</i>') && !html.includes('<i>SMA</i>') && !html.includes('Ölçüt ölçüt'));

  const [r] = buildRows([view('THYAO')], DEF);
  const full = detailHtml(r.s, r.ev, { id: 'BIST-THYAO', ai: '<i>AI</i>', sma: '<i>SMA</i>' });
  for (const part of ['Ölçüt ölçüt', 'Türk Hava Yolları · Havayolu <span lang="en">(Airlines)</span>', '<i>AI</i>', 'Ek bilgiler', '<i>SMA</i>'])
    assert.ok(full.includes(part), part);

  // Etiket büyük harfe çevrilir; İngilizce ad ve sektör adı Türkçe kuralla ("İ") yazılmasın diye dili belirtilir.
  const [u] = buildRows([withFields('VZ', { price: 40, pe: 9, pb: 1.5, evEbitda: 7 })], DEF);
  const us = detailHtml(u.s, u.ev, { id: 'US-VZ', ai: '', sma: '' });
  assert.ok(us.includes(`<span lang="en">${u.s.name}</span> · `), 'ABD hissesinin adı İngilizce işaretli');
  assert.ok(us.includes(`<span lang="en">(${u.s.industryEn})</span>`));
});

test('smaBlockHtml: fiyat dosyası yoksa grafik yerine not; uydurma değer yok', () => {
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

  // Kısa seride çizilmeyen ortalama açıklama satırında da yazmaz.
  const short = smaBlockHtml(withFields('THYAO', { price: 100 }), mkSeries(flat(120, 100)), '', 'sc-sma-x');
  assert.ok(short.includes('20 günlük ortalama</span>') && short.includes('50 günlük ortalama</span>'));
  assert.ok(!short.includes('(kesikli)'), '120 günlük seride 200 günlük ortalama yok');
  assert.ok(short.includes('Son 120 işlem günü'));
  assert.equal(smaLegendHtml(20).includes('20 günlük ortalama'), false, '20 günde tek nokta olur, çizgi olmaz');
  assert.equal(smaLegendHtml(21).includes('20 günlük ortalama'), true);
  assert.equal(smaLegendHtml(201).includes('200 günlük ortalama (kesikli)'), true);
});

test('smaChartModel: son 250 gün, dört çizgi, eksen aralığı veriyi kapsar', () => {
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
  assert.equal(m.lines[0].n, 320 - 199, '200 günlük ortalama serinin 200. gününden başlar');
  const shownVals = c.slice(m.start);
  assert.ok(m.yLo < Math.min(...shownVals) && m.yHi > Math.max(...shownVals));
  assert.ok(m.yTicks.length >= 3 && m.yTicks.every((t) => t.y >= m.m.t - 1 && t.y <= m.H - m.m.b + 1));
  assert.ok(m.xTicks.length >= 2 && m.xTicks.every((t) => t.x >= m.m.l && t.x <= 900 - m.m.r));
  const svg = smaChartSvg(s, 900, 'deneme');
  assert.ok(svg && (svg.match(/<polyline /g) ?? []).length === 4);
  assert.ok(svg.includes('stroke-dasharray="6 5"'));
  assert.ok(!/NaN|undefined|Infinity/.test(svg));

  // Kısa seri: 200 günlük ortalama çizilmez
  const short = smaChartModel(mkSeries(c.slice(0, 120)), 600);
  assert.ok(short);
  assert.equal(short.lines[0].n, 0);
  assert.equal(short.lines[3].n, 120);
  assert.equal(smaChartModel(s, 0), null);
});

/* ---------- Yapay zekâ kutuları ---------- */

const OFF: AiStatus = { configured: false, provider: 'anthropic', providerLabel: 'Claude', model: '' };
const ON: AiStatus = { configured: true, provider: 'anthropic', providerLabel: 'Claude', model: 'claude-x' };
const TEXT: AiText = {
  text: 'Birinci paragraf <script>x</script>\n\nİkinci paragraf',
  providerLabel: 'Claude',
  model: 'claude-x',
  cached: false,
  createdAt: '2026-10-04T00:00:00Z',
};

test('yapay zekâ kutuları: kapalıyken Ayarlar a yönlendirir, açıkken yalnızca düğme sunar', () => {
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

test('hisse yorumu kutusu: kapalıyken tek satır ve Ayarlar bağlantısı; açıkken Yorumla / Yeniden yorumla', () => {
  const off = commentBlockHtml('BIST-THYAO', undefined, OFF);
  assert.ok(off.includes('<a href="#settings">') && !off.includes('<button'));
  const on = commentBlockHtml('BIST-THYAO', undefined, ON);
  assert.ok(on.includes('>Yorumla</button>') && on.includes('data-key="BIST-THYAO"'));
  const done = commentBlockHtml('BIST-THYAO', { status: 'done', result: TEXT, token: 1 }, ON);
  assert.ok(done.includes('>Yeniden yorumla</button>') && done.includes('&lt;script&gt;'));
  assert.ok(!done.includes('<script>'));
});

/* ---------- Kendi hesabın ---------- */

test('hesaplayıcı: BİM örneği ilk sürümdeki sonuçları verir', () => {
  const m = calcMultiples(BIM_EXAMPLE);
  near(m.fk, 16.78);
  near(m.pddd, 2.46);
  near(m.fdf, 9.47);
  near(m.peg, 0.38);
  near(m.roe, 14.67);
  near(m.nbf, 0.58);
  // Tablodaki BIMAS çarpanlarıyla aynı (kaynak aynı rakamlardan hesaplıyor)
  const bim = view('BIMAS');
  near(m.fk, bim.pe as number);
  near(m.pddd, bim.pb as number);
  near(m.fdf, bim.evEbitda as number);
  near(m.peg, bim.peg as number);
  near(m.nbf, bim.netDebtEbitda as number);

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

test('hesaplayıcı: eşikler, zarar, döngüsellik ve hesaplanamayan borç', () => {
  assert.equal(calcEvaluate(BIM_EXAMPLE, { ...DEF, maxPe: 15 }).ev.verdict, 'bad');
  const cyc = calcEvaluate({ ...BIM_EXAMPLE, cyc: true }, DEF).ev;
  assert.equal(cyc.verdict, 'warn');
  assert.equal(cyc.checks.at(-1)?.long, 'Bu sektör döngüsel bir sektör; bugünkü kâr ortalamanın üstünde veya altında olabilir.');
  assert.equal(calcEvaluate({ ...BIM_EXAMPLE, cyc: true }, { ...DEF, warnCyclical: false }).ev.verdict, 'good');

  const loss = calcEvaluate({ ...BIM_EXAMPLE, nk: -5 }, DEF);
  assert.equal(loss.m.fk, null);
  assert.equal(loss.m.peg, null);
  assert.equal(loss.ev.checks[0].status, 'bad');

  const cash = calcMultiples({ ...BIM_EXAMPLE, nb: -40 });
  near(cash.nbf, -0.717);
  near(cash.fdf, (495.6 - 40) / 55.75);

  // Net borç girilmemiş: FD/FAVÖK borçsuz hesaplanır, borç ölçütü uydurma oran yazmadan kalır
  const noDebt = calcEvaluate({ ...BIM_EXAMPLE, nb: NaN }, DEF);
  assert.equal(noDebt.m.nbf, null);
  near(noDebt.m.fdf, 495.6 / 55.75);
  const debt = noDebt.ev.checks.find((c) => c.id === 'debt');
  assert.equal(debt?.status, 'bad');
  assert.ok(debt && !/\d/.test(debt.long), 'metinde rakam yok');
  assert.equal(noDebt.ev.verdict, 'bad');

  // Boş kutular: her şey "–", sonuç yine hesaplanır
  const empty = calcMultiples({ pd: NaN, nk: NaN, ok: NaN, fv: NaN, nb: NaN, ng: NaN, fg: NaN, cyc: false });
  assert.deepEqual(empty, { fk: null, pddd: null, fdf: null, peg: null, roe: null, nbf: null });
  // Büyüme sıfırsa PEG hesaplanmaz
  assert.equal(calcMultiples({ ...BIM_EXAMPLE, ng: 0 }).peg, null);
});
