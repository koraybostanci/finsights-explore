import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { nf, pct } from '@fintools/shared/format';
import { lastSma, smaSeries } from '@fintools/shared/sma';
import {
  HOLIDAY_DAYS,
  PEG_C,
  PEG_PE,
  ROADWORK_END,
  ROADWORK_START,
  SMA_WINDOWS,
  TAKINGS_SHOWN,
  TAKINGS_TOTAL,
  COUNTRY,
  crossings,
  iceCreamState,
  inflationState,
  evOf,
  priceState,
  pegOf,
  realGrowth,
  fundState,
  smaStory,
  takings,
  countryState,
} from '../src/model.ts';
import { GL, filterGlossary, fold, render as renderGlossary } from '../src/glossary.ts';
import * as glossary from '../src/glossary.ts';
import * as multiples from '../src/multiples.ts';
import * as steps from '../src/steps.ts';
import * as stories from '../src/stories.ts';
import * as smaHtml from '../src/story-sma.ts';
import * as marketsHtml from '../src/story-markets.ts';

/** mount() only writes innerHTML; a fake root lets it run without a DOM. */
const fakeRoot = (): HTMLElement & { innerHTML: string } =>
  ({ innerHTML: '', querySelector: () => null }) as unknown as HTMLElement & { innerHTML: string };

const near = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

/* ---------- Story 3: price slider (figures of the first version) ---------- */

test('Story 3: at 30 TL and 25% growth, P/E is 14.3 and P/B is 5.0', () => {
  const s = priceState(30, 25);
  assert.equal(s.marketCap, 3_000_000);
  assert.equal(nf(s.pe, 1), '14,3');
  assert.equal(nf(s.pb, 1), '5,0');
  assert.equal(nf(s.ev / 1e6, 2), '3,05');
  assert.equal(nf(s.evEbitda, 1), '7,6');
  assert.equal(nf(s.peg, 2), '0,57');
  assert.equal(nf(s.ey, 1), '7,0');
  assert.equal(nf(s.roe, 0), '35');
  assert.equal(nf(s.eps, 2), '2,10');
});

test('Story 3: 6 TL per share is book value; there is no PEG when growth is zero or negative', () => {
  near(priceState(6, 25).pb, 1);
  assert.equal(priceState(30, 0).peg, null);
  assert.equal(priceState(30, -20).peg, null);
  assert.equal(nf(priceState(30, 0).peg, 2), '–');
});

/* ---------- Story 4: PEG ---------- */

test('Story 4: PEG and enterprise value of the three coffee shops', () => {
  near(PEG_PE, 3_000_000 / 210_000);
  assert.deepEqual(
    PEG_C.map((c) => nf(pegOf(c), 2)),
    ['2,86', '0,41', '0,07'],
  );
  assert.deepEqual(
    PEG_C.map((c) => evOf(c)),
    [3_000_000, 4_500_000, 3_000_000],
  );
});

/* ---------- Story 5: inflation ---------- */

test('Story 5: at 35% inflation the monetary gain is 70 thousand TL', () => {
  const s = inflationState(35);
  assert.equal(s.gain, 70_000);
  assert.equal(s.rep, 280_000);
  assert.equal(pct((s.gain / s.op) * 100), '+%33');
  assert.equal(nf(s.real / 1000, 0), '148');
  assert.equal(inflationState(0).gain, 0);
});

/* ---------- Story 6: ice cream shop ---------- */

test('Story 6: annual net income 535 thousand, true P/E 9.3, misleading P/E 2.9', () => {
  const s = iceCreamState();
  assert.equal(s.yr, 535);
  assert.equal(s.summer, 430);
  assert.equal(s.peakYr, 1720);
  assert.equal(nf(s.pe, 1), '9,3');
  assert.equal(nf(s.peakPe, 1), '2,9');
});

/* ---------- Story 7: neighborhood fund ---------- */

test('Story 7: the fund income statement and ROE', () => {
  const a = fundState(2);
  assert.equal(a.interestIncome, 427_500);
  assert.equal(a.interestExpense, 350_000);
  assert.equal(a.nii, 77_500);
  assert.equal(a.prov, 19_000);
  assert.equal(a.net, 21_375);
  assert.equal(nf(a.roe, 1), '21,4');
  assert.equal(nf(fundState(0).roe, 1), '35,6');
});

test('Story 7: at 10% bad loans the fund makes a loss and pays no tax', () => {
  const s = fundState(10);
  assert.equal(s.tax, 0);
  assert.ok(s.net < 0);
  assert.ok(s.roe < 0);
});

/* ---------- Story 8: daily takings and SMA ---------- */

test('Story 8: the series is deterministic, 500 days, positive and in steps of 10 TL', () => {
  const a = takings();
  assert.equal(a.length, TAKINGS_TOTAL);
  assert.ok(a.every((v) => Number.isInteger(v) && v > 0 && v % 10 === 0));
  assert.deepEqual(takings(), a);
  /* The series is seeded: if these values change, the day numbers in the story change too. */
  assert.deepEqual(a.slice(0, 5), [3370, 5430, 5330, 5260, 5370]);
  assert.deepEqual(a.slice(-3), [7760, 5810, 6020]);
});

test('Story 8: the chart shows the last 300 days; the 200-day average has 200 days of history before it', () => {
  for (const w of SMA_WINDOWS) {
    const s = smaStory(w);
    assert.equal(s.daily.length, TAKINGS_SHOWN);
    assert.equal(s.avg.length, TAKINGS_SHOWN);
    assert.equal(s.long.length, TAKINGS_SHOWN);
    assert.ok(s.avg.every((v) => Number.isFinite(v)), `the ${w}-day average has a gap`);
    assert.ok(s.long.every((v) => Number.isFinite(v)));
  }
});

test('Story 8: the average is the same calculation as shared/src/sma.ts', () => {
  const all = takings();
  for (const w of SMA_WINDOWS) {
    const s = smaStory(w);
    const manual = all.slice(-w).reduce((x, y) => x + y, 0) / w;
    near(s.avgToday, manual, 1e-6);
    near(s.avgToday, lastSma(all, w) as number, 1e-6);
    near(s.avg[s.avg.length - 1], smaSeries(all, w)[all.length - 1] as number, 1e-9);
    near(s.dist, (s.today / s.avgToday - 1) * 100, 1e-9);
    near(s.lag, (w - 1) / 2);
    assert.equal(s.today, all[all.length - 1]);
  }
});

test('Story 8: today\'s figures match the text', () => {
  const s5 = smaStory(5);
  const s20 = smaStory(20);
  const s200 = smaStory(200);
  assert.equal(s20.today, 6020);
  /* The rainy last day: below the short averages, above the 200-day one. */
  assert.ok(s5.dist < 0 && s20.dist < 0);
  assert.ok(s200.dist > 0);
  assert.equal(pct(s20.dist, 0), '%-15');
  assert.equal(pct(s200.dist, 0), '+%12');
});

test('Story 8: a short window shows the turn early, a long window late', () => {
  const troughs = SMA_WINDOWS.map((w) => smaStory(w).trough);
  for (let i = 1; i < troughs.length; i++) assert.ok(troughs[i] > troughs[i - 1], `${troughs}`);
  assert.ok(troughs[0] >= ROADWORK_END, 'lowest point comes after the roadwork ends');
  assert.ok(troughs[0] - ROADWORK_END < troughs[2] - ROADWORK_END);
});

test('Story 8: death cross first, then golden cross; the golden cross comes after the turn', () => {
  const { crosses } = smaStory(50);
  assert.deepEqual(
    crosses.map((c) => c.kind),
    ['death', 'golden'],
  );
  const [death, golden] = crosses;
  assert.ok(death.day > ROADWORK_START && death.day < ROADWORK_END + 1);
  assert.ok(golden.day > ROADWORK_END);
  assert.deepEqual(smaStory(5).crosses, crosses);
});

test('crossings: series with gaps are skipped, crossing direction is right', () => {
  const short = [null, 1, 3, 3, 1];
  const long = [null, 2, 2, 2, 2];
  assert.deepEqual(crossings(short, long), [
    { kind: 'golden', index: 2 },
    { kind: 'death', index: 4 },
  ]);
});

test('Story 8: event days show in the series (holiday jump, roadwork dip)', () => {
  const s = smaStory(5);
  const mid = s.daily.slice(ROADWORK_START + 10, ROADWORK_END - 10);
  const before = s.daily.slice(0, ROADWORK_START - 1);
  const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(mid) < mean(before), 'roadwork lowers takings');
  for (const d of HOLIDAY_DAYS) assert.ok(s.daily[d - 1] > mean(s.daily.slice(d - 8, d - 3)) * 1.1);
});

/* ---------- Story 9: two countries ---------- */

test('Story 9: both shops have the same P/E and earnings yield; the difference is the interest rate', () => {
  const s = countryState(35);
  assert.equal(s.pe, PEG_PE);
  assert.equal(nf(s.pe, 1), '14,3');
  near(s.ey, 7);
  near(s.tr.gap, 7 - 35);
  near(s.us.gap, 7 - COUNTRY.usRate);
  near(s.tr.parityPe, 100 / 35);
  near(s.us.parityPe, 25);
});

test('Story 9: real growth is found by subtracting inflation; PEG divides by nominal growth', () => {
  const s = countryState(35);
  assert.equal(nf(s.tr.realGrowth, 1), '3,7');
  assert.equal(nf(s.us.realGrowth, 1), '3,9');
  assert.equal(nf(s.tr.peg, 2), '0,36');
  assert.equal(nf(s.us.peg, 2), '2,04');
  near(realGrowth(0, 0), 0);
  near(realGrowth(10, 10), 0);
  near(realGrowth(21, 10), 10);
});

test('Story 9: when the TL rate changes, only the Turkish side changes', () => {
  const a = countryState(10);
  const b = countryState(50);
  assert.equal(a.us.gap, b.us.gap);
  assert.notEqual(a.tr.gap, b.tr.gap);
  assert.equal(a.ey, b.ey);
});

/* ---------- Text and markup ---------- */

test('Stories: BIST callouts are dated, no US company examples', () => {
  const html = stories.markup();
  const calls = html.match(/<span class="muted">BIST 30'da[^<]{0,20}/g) ?? [];
  assert.ok(calls.length >= 7, 'seven stories carry a BIST 30 note');
  for (const c of calls) assert.match(c, /^<span class="muted">BIST 30'da \(2 Ekim 2026\): /, c);
  assert.doesNotMatch(html, /\b(AAPL|MSFT|NVDA|AMZN|GOOGL?|TSLA|META|Apple|Microsoft|Nvidia|Amazon|Tesla)\b/);
});

test('Stories: nine stories, eyebrow headings and unique ids', () => {
  const html = stories.markup();
  for (let i = 1; i <= 9; i++) assert.ok(html.includes(`id="case${i}"`), `case${i}`);
  assert.ok(html.includes('Hikâye 8 · Hareketli ortalama'));
  assert.ok(html.includes('Bugün iyi bir gün müydü?'));
  assert.ok(html.includes('İki ülke, iki kahveci'));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');
  for (const id of [...smaHtml.html().matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
    assert.ok(id === 'case8' || id.startsWith('sma-'), id);
  for (const id of [...marketsHtml.html().matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
    assert.ok(id === 'case9' || id.startsWith('country-'), id);
});

test('Stories: the intro boxes name the Learn tabs and the screener app, not tabs of the other app', () => {
  const html = stories.markup();
  for (const name of ['Senaryolar', 'Çarpanlar', 'Sözlük', 'Karar adımları', 'Kendini sına', 'Tarayıcı uygulaması (screener app)'])
    assert.ok(html.includes(name), name);
  for (const name of ['Bankalar', 'Kendi hesabın', 'Ayarlar']) assert.ok(!html.includes(name), name);
  assert.doesNotMatch(html, /BIST 30 tarayıcı/);
  assert.doesNotMatch(html, /href="#(screener|banks|calculator|settings)"/);
});

test('The learning boxes of stories 8 and 9 make the required points', () => {
  const sma = smaHtml.html();
  for (const s of ['her zaman geriden gelir', 'SMA 20', 'SMA 200', 'altın kesişim (golden cross)', 'ölüm kesişimi (death cross)', 'eğilimi gösterir, değeri değil', 'enflasyon', 'Tarayıcı'])
    assert.ok(sma.toLowerCase().includes(s.toLowerCase()), s);
  const mk = marketsHtml.html();
  for (const s of ['kazanç verimi (earnings yield)', 'risksiz faiz', 'TMS 29 / IAS 29', 'ülke riski', 'sektör ortancası', 'Tarayıcı', 'örnek'])
    assert.ok(mk.toLowerCase().includes(s.toLowerCase()), s);
});

test('Story 9 does not claim real interest or inflation rates: the rates are framed as "örnek" (example)', () => {
  const mk = marketsHtml.html();
  assert.match(mk, /Buradaki oranlar örnektir/);
  assert.match(mk, /TL faizi \(örnek\)/);
  assert.doesNotMatch(mk, /Merkez Bankası|TCMB|Fed\b|politika faizi|TÜFE/);
});

/* ---------- Multiples ---------- */

test('Multiples: six original cards, six Turkey notes, a separate SMA section', () => {
  assert.equal(multiples.CARDS.length, 6);
  assert.equal(multiples.TR.length, 6);
  const root = fakeRoot();
  multiples.mount(root);
  const h = root.innerHTML;
  assert.ok(h.includes('Türkiye\'ye özgü dikkat noktaları'));
  assert.ok(h.includes('Teknik gösterge: hareketli ortalama'));
  assert.ok(h.includes('Simple moving average, SMA'));
  assert.ok(h.includes('SMA(N) = son N kapanışın toplamı ÷ N'));
  assert.ok(h.includes('Tuzak:'));
  assert.ok(h.includes('Örnekler 2 Ekim 2026 verisiyle yazıldı'));
  assert.ok(h.indexOf('lrn-sma') > h.indexOf('lrn-trlist'), 'the SMA section comes after the Turkey list, separately');
  assert.equal([...h.matchAll(/<article class="card">/g)].length, 6 + multiples.smaCards().length);
});

test('Multiples: the example figures on the SMA card come from the story series', () => {
  const n = multiples.smaExampleNumbers();
  assert.equal(n.today, 6020);
  const [sma, cross] = multiples.smaCards();
  assert.ok(sma.ex.includes('%15 altında'));
  assert.ok(sma.ex.includes('%12 üstünde'));
  const { crosses } = smaStory(50);
  assert.ok(cross.ex.includes(`${crosses[0].day}. günde aşağı`));
  assert.ok(cross.ex.includes(`${crosses[1].day}. günde yukarı`));
});

/* ---------- Glossary ---------- */

test('Glossary: original groups and the new terms group', () => {
  const groups = GL.map((g) => g[0]);
  for (const g of ['Temel büyüklükler', 'Gelir tablosu', 'Nakit ve temettü', 'Oranlar', 'Piyasa', 'Bankacılık']) assert.ok(groups.includes(g), g);
  /* The first version had 51 entries; none may be removed. */
  const original = GL.slice(0, -1).reduce((n, g) => n + g[1].length, 0);
  assert.equal(original, 51);
  assert.ok(GL[GL.length - 1][1].length >= 9, 'new terms group');
  for (const [, items] of GL)
    for (const i of items) {
      assert.ok(i[0] && i[1] && i[2], `missing field: ${i[0]}`);
      assert.ok(i[2].length > 15);
    }
});

test('Glossary: the eight requested new terms exist with their Turkish and English names', () => {
  const last = GL[GL.length - 1][1];
  const want: Array<[RegExp, RegExp]> = [
    [/^Hareketli ortalama$/, /SMA/],
    [/^Üstel hareketli ortalama$/, /EMA/],
    [/^Altın kesişim$/, /Golden cross/],
    [/^Ölüm kesişimi$/, /Death cross/],
    [/^Eğilim$/, /Trend/],
    [/^Destek ve direnç$/, /Support and resistance/],
    [/^Sektör ortancası$/, /median/i],
    [/^Kazanç verimi/, /Earnings yield/],
  ];
  for (const [tr, en] of want) {
    const hit = last.find((i) => tr.test(i[0]));
    assert.ok(hit, `${tr} is missing`);
    assert.match(hit[1], en);
  }
});

test('Glossary: search works on Turkish and English text, ignoring letter case', () => {
  const names = (q: string): string[] => filterGlossary(q).flatMap((g) => g[1].map((i) => i[0]));
  assert.ok(names('ebitda').includes('FAVÖK'), 'EBITDA in lowercase');
  assert.ok(names('EBITDA').includes('FAVÖK'));
  assert.ok(names('Ebitda').includes('FAVÖK'));
  assert.ok(names('özkaynak').includes('Özkaynak / özsermaye'));
  assert.ok(names('ÖZKAYNAK').includes('Özkaynak / özsermaye'));
  assert.ok(names('ozkaynak').includes('Özkaynak / özsermaye'), 'without typing Turkish characters');
  assert.ok(names('golden cross').includes('Altın kesişim'));
  assert.ok(names('GOLDEN').includes('Altın kesişim'));
  assert.ok(names('altın').includes('Altın kesişim'));
  assert.ok(names('sma').includes('Hareketli ortalama'));
  assert.ok(names('SMA').includes('Hareketli ortalama'));
  /* "sma" also occurs inside "amortisman" and "finansman"; matches at the start of a word come first. */
  assert.ok(!names('sma').includes('Amortisman'), 'sma: noise from amortisman');
  assert.ok(!names('sma').includes('FAVÖK'));
  /* With no match at the start of a word, the search looks inside the text. */
  assert.ok(names('kaynak').includes('Özkaynak / özsermaye'));
  assert.ok(names('moving average').includes('Üstel hareketli ortalama'));
  assert.ok(names('ortanca').includes('Sektör ortancası'));
  assert.ok(!names('watchlist').length, 'the watchlist is specific to the screener app, not in the glossary');
  assert.deepEqual(names('xyzzy'), []);
  assert.equal(names('').length, GL.reduce((n, g) => n + g[1].length, 0));
  assert.equal(names('   ').length, names('').length);
});

test('fold: Turkish upper/lower case pairs simplify to the same text', () => {
  assert.equal(fold('EBITDA'), fold('ebitda'));
  assert.equal(fold('İstanbul'), fold('istanbul'));
  assert.equal(fold('ISPARTA'), fold('ısparta'));
  assert.equal(fold('ÇARPAN'), 'carpan');
  assert.equal(fold('Kâr'), 'kar');
});

test('Glossary: search results are HTML-escaped, and a message is shown when nothing matches', () => {
  assert.ok(renderGlossary('').includes('class="ggroup"'));
  const none = renderGlossary('<img src=x>');
  assert.ok(!none.includes('<img'));
  assert.ok(none.includes('terim bulunamadı'));
  const root = fakeRoot();
  glossary.mount(root);
  assert.ok(root.innerHTML.includes('id="gl-q"'));
  assert.ok(root.innerHTML.includes('Hareketli ortalama'));
});

/* ---------- Decision steps ---------- */

test('Decision steps: five original steps, six widening items, the trend step and the closing note', () => {
  assert.equal(steps.WIDEN.length, 6);
  assert.equal(steps.STEPS.length, 6);
  assert.deepEqual(
    steps.STEPS.slice(0, 5).map((s) => s.title),
    ['Şirket ne iş yapıyor?', 'Kâr gerçek mi?', 'Bilanço sağlam mı?', 'Fiyat makul mü?', 'Büyüme sürecek mi?'],
  );
  const price = steps.STEPS[3];
  assert.match(price.body, /aynı piyasadaki, aynı sektördeki/);
  const last = steps.STEPS[5];
  assert.match(last.body, /ilk adımlar olumlu çıktıktan sonra/);
  assert.match(last.body, /ucuz ya da pahalı olduğunu söylemez/);
  const root = fakeRoot();
  steps.mount(root);
  const h = root.innerHTML;
  assert.ok(h.includes('Bakışı genişletmek'));
  assert.ok(h.includes('Tarama bir aday listesi üretir, alım kararı üretmez.'));
  assert.equal([...h.matchAll(/<li>/g)].length, 6);
  /* Real-company figures come with a dated label. */
  assert.equal([...h.matchAll(/Örnek \(BIST 30, 2 Ekim 2026\):/g)].length, 5);
});

/* ---------- Source scan ---------- */

test('apps/learn/src: no randomness, dates or emoji', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!src.includes('Math.random'), `${f}: Math.random`);
    assert.ok(!/new Date\(|Date\.now\(/.test(src), `${f}: depends on the clock`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(src.replace(/[✓✕–−×÷≈≠→←↑↓·…«»‹›]/gu, '')), `${f}: emoji`);
  }
});
