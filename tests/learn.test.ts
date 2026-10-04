import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { nf, pct } from '../src/lib/format.ts';
import { lastSma, smaSeries } from '../src/lib/sma.ts';
import {
  BAYRAM_DAYS,
  PEG_C,
  PEG_FK,
  ROADWORK_END,
  ROADWORK_START,
  SMA_WINDOWS,
  TAKINGS_SHOWN,
  TAKINGS_TOTAL,
  ULKE,
  crossings,
  dondurmaState,
  enfState,
  evOf,
  fiyatState,
  pegOf,
  realGrowth,
  sandikState,
  smaStory,
  takings,
  ulkeState,
} from '../src/learn/model.ts';
import { GL, filterGlossary, fold, render as renderGlossary } from '../src/learn/glossary.ts';
import * as glossary from '../src/learn/glossary.ts';
import * as multiples from '../src/learn/multiples.ts';
import * as steps from '../src/learn/steps.ts';
import * as stories from '../src/learn/stories.ts';
import * as smaHtml from '../src/learn/story-sma.ts';
import * as marketsHtml from '../src/learn/story-markets.ts';
import { TERMS, term, termText } from '../src/terms.ts';

/** mount() yalnızca innerHTML yazar; DOM olmadan sınamak için sahte kök. */
const fakeRoot = (): HTMLElement & { innerHTML: string } =>
  ({ innerHTML: '', querySelector: () => null }) as unknown as HTMLElement & { innerHTML: string };

const near = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

/* ---------- Hikâye 3: fiyat kaydırıcısı (ilk sürümün rakamları) ---------- */

test('Hikâye 3: 30 TL ve %25 büyümede F/K 14,3 ve PD/DD 5,0', () => {
  const s = fiyatState(30, 25);
  assert.equal(s.pd, 3_000_000);
  assert.equal(nf(s.fk, 1), '14,3');
  assert.equal(nf(s.pddd, 1), '5,0');
  assert.equal(nf(s.fd / 1e6, 2), '3,05');
  assert.equal(nf(s.fdf, 1), '7,6');
  assert.equal(nf(s.peg, 2), '0,57');
  assert.equal(nf(s.ey, 1), '7,0');
  assert.equal(nf(s.roe, 0), '35');
  assert.equal(nf(s.eps, 2), '2,10');
});

test('Hikâye 3: pay başına 6 TL defter değeridir; büyüme sıfır ya da eksiyse PEG yoktur', () => {
  near(fiyatState(6, 25).pddd, 1);
  assert.equal(fiyatState(30, 0).peg, null);
  assert.equal(fiyatState(30, -20).peg, null);
  assert.equal(nf(fiyatState(30, 0).peg, 2), '–');
});

/* ---------- Hikâye 4: PEG ---------- */

test('Hikâye 4: üç kahvecinin PEG ve firma değeri', () => {
  near(PEG_FK, 3_000_000 / 210_000);
  assert.deepEqual(
    PEG_C.map((c) => nf(pegOf(c), 2)),
    ['2,86', '0,41', '0,07'],
  );
  assert.deepEqual(
    PEG_C.map((c) => evOf(c)),
    [3_000_000, 4_500_000, 3_000_000],
  );
});

/* ---------- Hikâye 5: enflasyon ---------- */

test('Hikâye 5: %35 enflasyonda parasal kazanç 70 bin TL', () => {
  const s = enfState(35);
  assert.equal(s.gain, 70_000);
  assert.equal(s.rep, 280_000);
  assert.equal(pct((s.gain / s.op) * 100), '+%33');
  assert.equal(nf(s.real / 1000, 0), '148');
  assert.equal(enfState(0).gain, 0);
});

/* ---------- Hikâye 6: dondurmacı ---------- */

test('Hikâye 6: yıllık kâr 535 bin, gerçek F/K 9,3, yanıltıcı F/K 2,9', () => {
  const s = dondurmaState();
  assert.equal(s.yr, 535);
  assert.equal(s.summer, 430);
  assert.equal(s.peakYr, 1720);
  assert.equal(nf(s.fk, 1), '9,3');
  assert.equal(nf(s.peakFk, 1), '2,9');
});

/* ---------- Hikâye 7: sandık ---------- */

test('Hikâye 7: sandığın gelir tablosu ve ÖK kârlılığı', () => {
  const a = sandikState(2);
  assert.equal(a.fi, 427_500);
  assert.equal(a.fg, 350_000);
  assert.equal(a.nii, 77_500);
  assert.equal(a.prov, 19_000);
  assert.equal(a.net, 21_375);
  assert.equal(nf(a.roe, 1), '21,4');
  assert.equal(nf(sandikState(0).roe, 1), '35,6');
});

test('Hikâye 7: %10 batık kredide sandık zarar eder ve vergi ödemez', () => {
  const s = sandikState(10);
  assert.equal(s.tax, 0);
  assert.ok(s.net < 0);
  assert.ok(s.roe < 0);
});

/* ---------- Hikâye 8: günlük hasılat ve SMA ---------- */

test('Hikâye 8: seri deterministik, 500 gün, pozitif ve 10 TL basamaklı', () => {
  const a = takings();
  assert.equal(a.length, TAKINGS_TOTAL);
  assert.ok(a.every((v) => Number.isInteger(v) && v > 0 && v % 10 === 0));
  assert.deepEqual(takings(), a);
  /* Seri tohumludur: bu değerler değişirse hikâyedeki gün numaraları da değişir. */
  assert.deepEqual(a.slice(0, 5), [3370, 5430, 5330, 5260, 5370]);
  assert.deepEqual(a.slice(-3), [7760, 5810, 6020]);
});

test('Hikâye 8: grafik son 300 günü gösterir, 200 günlük ortalama için 200 gün öncesi vardır', () => {
  for (const w of SMA_WINDOWS) {
    const s = smaStory(w);
    assert.equal(s.daily.length, TAKINGS_SHOWN);
    assert.equal(s.avg.length, TAKINGS_SHOWN);
    assert.equal(s.long.length, TAKINGS_SHOWN);
    assert.ok(s.avg.every((v) => Number.isFinite(v)), `${w} günlük ortalamada boşluk var`);
    assert.ok(s.long.every((v) => Number.isFinite(v)));
  }
});

test('Hikâye 8: ortalama src/lib/sma.ts ile aynı hesaptır', () => {
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

test('Hikâye 8: bugünkü rakamlar metindekilerle uyumlu', () => {
  const s5 = smaStory(5);
  const s20 = smaStory(20);
  const s200 = smaStory(200);
  assert.equal(s20.today, 6020);
  /* Yağmurlu son gün: kısa ortalamanın altında, 200 günlüğün üstünde. */
  assert.ok(s5.dist < 0 && s20.dist < 0);
  assert.ok(s200.dist > 0);
  assert.equal(pct(s20.dist, 0), '%-15');
  assert.equal(pct(s200.dist, 0), '+%12');
});

test('Hikâye 8: kısa pencere dönüşü erken, uzun pencere geç gösterir', () => {
  const troughs = SMA_WINDOWS.map((w) => smaStory(w).trough);
  for (let i = 1; i < troughs.length; i++) assert.ok(troughs[i] > troughs[i - 1], `${troughs}`);
  assert.ok(troughs[0] >= ROADWORK_END, 'en düşük nokta yol çalışması bittikten sonra');
  assert.ok(troughs[0] - ROADWORK_END < troughs[2] - ROADWORK_END);
});

test('Hikâye 8: önce ölüm, sonra altın kesişim; altın kesişim dönüşten sonra gelir', () => {
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

test('crossings: boşluklu diziler atlanır, kesişim yönü doğru', () => {
  const short = [null, 1, 3, 3, 1];
  const long = [null, 2, 2, 2, 2];
  assert.deepEqual(crossings(short, long), [
    { kind: 'golden', index: 2 },
    { kind: 'death', index: 4 },
  ]);
});

test('Hikâye 8: olay günleri seride görünür (bayram sıçraması, yol çalışması düşüşü)', () => {
  const s = smaStory(5);
  const mid = s.daily.slice(ROADWORK_START + 10, ROADWORK_END - 10);
  const before = s.daily.slice(0, ROADWORK_START - 1);
  const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(mid) < mean(before), 'yol çalışması hasılatı düşürür');
  for (const d of BAYRAM_DAYS) assert.ok(s.daily[d - 1] > mean(s.daily.slice(d - 8, d - 3)) * 1.1);
});

/* ---------- Hikâye 9: iki ülke ---------- */

test('Hikâye 9: iki dükkânın F/K ve kazanç verimi aynı; fark faizde', () => {
  const s = ulkeState(35);
  assert.equal(s.fk, PEG_FK);
  assert.equal(nf(s.fk, 1), '14,3');
  near(s.ey, 7);
  near(s.tr.gap, 7 - 35);
  near(s.us.gap, 7 - ULKE.usRate);
  near(s.tr.parityFk, 100 / 35);
  near(s.us.parityFk, 25);
});

test('Hikâye 9: reel büyüme enflasyon düşülerek bulunur; PEG nominal büyümeyi bölen', () => {
  const s = ulkeState(35);
  assert.equal(nf(s.tr.realGrowth, 1), '3,7');
  assert.equal(nf(s.us.realGrowth, 1), '3,9');
  assert.equal(nf(s.tr.peg, 2), '0,36');
  assert.equal(nf(s.us.peg, 2), '2,04');
  near(realGrowth(0, 0), 0);
  near(realGrowth(10, 10), 0);
  near(realGrowth(21, 10), 10);
});

test('Hikâye 9: TL faizi değişince yalnızca Türkiye tarafı değişir', () => {
  const a = ulkeState(10);
  const b = ulkeState(50);
  assert.equal(a.us.gap, b.us.gap);
  assert.notEqual(a.tr.gap, b.tr.gap);
  assert.equal(a.ey, b.ey);
});

/* ---------- Metin ve işaretleme ---------- */

test('Senaryolar: BIST çağrıları tarihli, ABD şirketi örneği yok', () => {
  const html = stories.markup();
  const calls = html.match(/<span class="muted">BIST 30'da[^<]{0,20}/g) ?? [];
  assert.ok(calls.length >= 7, 'yedi hikâyede BIST 30 notu var');
  for (const c of calls) assert.match(c, /^<span class="muted">BIST 30'da \(2 Ekim 2026\): /, c);
  assert.doesNotMatch(html, /\b(AAPL|MSFT|NVDA|AMZN|GOOGL?|TSLA|META|Apple|Microsoft|Nvidia|Amazon|Tesla)\b/);
});

test('Senaryolar: dokuz hikâye, eyebrow başlıkları ve benzersiz kimlikler', () => {
  const html = stories.markup();
  for (let i = 1; i <= 9; i++) assert.ok(html.includes(`id="case${i}"`), `case${i}`);
  assert.ok(html.includes('Hikâye 8 · Hareketli ortalama'));
  assert.ok(html.includes('Bugün iyi bir gün müydü?'));
  assert.ok(html.includes('İki ülke, iki kahveci'));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'yinelenen kimlik');
  for (const id of [...smaHtml.html().matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
    assert.ok(id === 'case8' || id.startsWith('sma-'), id);
  for (const id of [...marketsHtml.html().matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
    assert.ok(id === 'case9' || id.startsWith('ulke-'), id);
});

test('Senaryolar: tab adları yeni sekme kümesiyle uyumlu, eski "BIST 30 tarayıcı" adı yok', () => {
  const html = stories.markup();
  for (const name of ['Senaryolar', 'Çarpanlar', 'Sözlük', 'Karar adımları', 'Tarayıcı', 'Bankalar', 'Kendi hesabın', 'Kendini sına', 'Ayarlar'])
    assert.ok(html.includes(name), name);
  assert.doesNotMatch(html, /BIST 30 tarayıcı/);
});

test('Hikâye 8 ve 9 öğrenme kutuları gerekli noktaları söyler', () => {
  const sma = smaHtml.html();
  for (const s of ['her zaman geriden gelir', 'SMA 20', 'SMA 200', 'altın kesişim (golden cross)', 'ölüm kesişimi (death cross)', 'eğilimi gösterir, değeri değil', 'enflasyon', 'Tarayıcı'])
    assert.ok(sma.toLowerCase().includes(s.toLowerCase()), s);
  const mk = marketsHtml.html();
  for (const s of ['kazanç verimi (earnings yield)', 'risksiz faiz', 'TMS 29 / IAS 29', 'ülke riski', 'sektör ortancası', 'Tarayıcı', 'örnek'])
    assert.ok(mk.toLowerCase().includes(s.toLowerCase()), s);
});

test('Hikâye 9 gerçek faiz ya da enflasyon oranı iddia etmez: oranlar "örnek" diye çerçevelenir', () => {
  const mk = marketsHtml.html();
  assert.match(mk, /Buradaki oranlar örnektir/);
  assert.match(mk, /TL faizi \(örnek\)/);
  assert.doesNotMatch(mk, /Merkez Bankası|TCMB|Fed\b|politika faizi|TÜFE/);
});

/* ---------- Çarpanlar ---------- */

test('Çarpanlar: altı özgün kart, altı Türkiye notu, ayrı SMA bölümü', () => {
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
  assert.ok(h.indexOf('lrn-sma') > h.indexOf('lrn-trlist'), 'SMA bölümü Türkiye listesinden sonra, ayrı');
  assert.equal([...h.matchAll(/<article class="card">/g)].length, 6 + multiples.smaCards().length);
});

test('Çarpanlar: SMA kartındaki örnek rakamlar hikâyenin serisinden gelir', () => {
  const n = multiples.smaExampleNumbers();
  assert.equal(n.today, 6020);
  const [sma, cross] = multiples.smaCards();
  assert.ok(sma.ex.includes('%15 altında'));
  assert.ok(sma.ex.includes('%12 üstünde'));
  const { crosses } = smaStory(50);
  assert.ok(cross.ex.includes(`${crosses[0].day}. günde aşağı`));
  assert.ok(cross.ex.includes(`${crosses[1].day}. günde yukarı`));
});

/* ---------- Sözlük ---------- */

test('Sözlük: özgün gruplar ve yeni terimler grubu', () => {
  const groups = GL.map((g) => g[0]);
  for (const g of ['Temel büyüklükler', 'Gelir tablosu', 'Nakit ve temettü', 'Oranlar', 'Piyasa', 'Bankacılık']) assert.ok(groups.includes(g), g);
  /* İlk sürümde 51 madde vardı; hiçbiri silinmemeli. */
  const original = GL.slice(0, -1).reduce((n, g) => n + g[1].length, 0);
  assert.equal(original, 51);
  assert.ok(GL[GL.length - 1][1].length >= 9, 'yeni terimler grubu');
  for (const [, items] of GL)
    for (const i of items) {
      assert.ok(i[0] && i[1] && i[2], `eksik alan: ${i[0]}`);
      assert.ok(i[2].length > 15);
    }
});

test('Sözlük: istenen dokuz yeni terim Türkçe ve İngilizce karşılığıyla var', () => {
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
    [/^İzleme listesi \/ Hisselerim$/, /Watchlist/],
  ];
  for (const [tr, en] of want) {
    const hit = last.find((i) => tr.test(i[0]));
    assert.ok(hit, `${tr} yok`);
    assert.match(hit[1], en);
  }
});

test('Sözlük: arama Türkçe ve İngilizce metinde, büyük/küçük harf gözetmeden çalışır', () => {
  const names = (q: string): string[] => filterGlossary(q).flatMap((g) => g[1].map((i) => i[0]));
  assert.ok(names('ebitda').includes('FAVÖK'), 'küçük harfle EBITDA');
  assert.ok(names('EBITDA').includes('FAVÖK'));
  assert.ok(names('Ebitda').includes('FAVÖK'));
  assert.ok(names('özkaynak').includes('Özkaynak / özsermaye'));
  assert.ok(names('ÖZKAYNAK').includes('Özkaynak / özsermaye'));
  assert.ok(names('ozkaynak').includes('Özkaynak / özsermaye'), 'Türkçe karakter yazmadan');
  assert.ok(names('golden cross').includes('Altın kesişim'));
  assert.ok(names('GOLDEN').includes('Altın kesişim'));
  assert.ok(names('altın').includes('Altın kesişim'));
  assert.ok(names('sma').includes('Hareketli ortalama'));
  assert.ok(names('SMA').includes('Hareketli ortalama'));
  /* "sma", "amortisman" ve "finansman" içinde de geçer; sözcük başı eşleşmesi öne alınır. */
  assert.ok(!names('sma').includes('Amortisman'), 'sma: amortisman gürültüsü');
  assert.ok(!names('sma').includes('FAVÖK'));
  /* Sözcük başında eşleşme yoksa metnin içinde aranır. */
  assert.ok(names('kaynak').includes('Özkaynak / özsermaye'));
  assert.ok(names('moving average').includes('Üstel hareketli ortalama'));
  assert.ok(names('ortanca').includes('Sektör ortancası'));
  assert.ok(names('watchlist').includes('İzleme listesi / Hisselerim'));
  assert.deepEqual(names('xyzzy'), []);
  assert.equal(names('').length, GL.reduce((n, g) => n + g[1].length, 0));
  assert.equal(names('   ').length, names('').length);
});

test('fold: Türkçe büyük/küçük harf çiftleri aynı sadeleşir', () => {
  assert.equal(fold('EBITDA'), fold('ebitda'));
  assert.equal(fold('İstanbul'), fold('istanbul'));
  assert.equal(fold('ISPARTA'), fold('ısparta'));
  assert.equal(fold('ÇARPAN'), 'carpan');
  assert.equal(fold('Kâr'), 'kar');
});

test('Sözlük: arama sonucu HTML olarak kaçırılır, sonuç yoksa mesaj verir', () => {
  assert.ok(renderGlossary('').includes('class="ggroup"'));
  const none = renderGlossary('<img src=x>');
  assert.ok(!none.includes('<img'));
  assert.ok(none.includes('terim bulunamadı'));
  const root = fakeRoot();
  glossary.mount(root);
  assert.ok(root.innerHTML.includes('id="gl-q"'));
  assert.ok(root.innerHTML.includes('Hareketli ortalama'));
});

/* ---------- Karar adımları ---------- */

test('Karar adımları: beş özgün adım, altı genişletme maddesi, eğilim adımı ve kapanış notu', () => {
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
  /* Gerçek şirket rakamları tarihli etiketle gelir. */
  assert.equal([...h.matchAll(/Örnek \(BIST 30, 2 Ekim 2026\):/g)].length, 5);
});

/* ---------- Terimler ---------- */

test('terms: yeni terimler yazılır ve eski kimlikler yerinde', () => {
  for (const id of ['pe', 'pb', 'evEbitda', 'peg', 'netDebtEbitda', 'ebitdaGrowth', 'netIncomeGrowth', 'roe', 'marketCap', 'price', 'target', 'ebitda', 'netIncome', 'equity', 'netDebt', 'median', 'industry', 'market', 'cyclical', 'watchlist', 'sma', 'sma20', 'sma50', 'sma200', 'goldenCross', 'deathCross', 'trend', 'npl', 'car', 'nim', 'apiKey', 'aiProvider'])
    assert.ok(TERMS[id], `kimlik silinmiş: ${id}`);
  assert.equal(term('pe'), 'F/K <span class="en">(P/E)</span>');
  assert.equal(termText('pe'), 'F/K (P/E)');
  assert.equal(term('peg'), 'PEG');
  assert.equal(termText('earningsYield'), 'Kazanç verimi (Earnings yield)');
  assert.equal(termText('goldenCross'), 'Altın kesişim (Golden cross)');
  assert.throws(() => term('yok-boyle-bir-terim'));
});

/* ---------- Kaynak taraması ---------- */

test('src/learn: rastgelelik, tarih ya da emoji yok', () => {
  const dir = new URL('../src/learn/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!src.includes('Math.random'), `${f}: Math.random`);
    assert.ok(!/new Date\(|Date\.now\(/.test(src), `${f}: saate bağlı`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(src.replace(/[✓✕–−×÷≈≠→←↑↓·…«»‹›]/gu, '')), `${f}: emoji`);
  }
});
