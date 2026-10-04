/**
 * Kendini sına: güncel veriden üretilen sorular.
 *
 * Saf ve belirlenimlidir (deterministic): aynı veri ve aynı eşiklerle hep aynı
 * soru listesi çıkar; rastgelelik yalnızca tur kurulurken (logic.ts) kullanılır.
 * Doğru yanıt ve açıklama uygulamanın kendi hesabından gelir: tarama kuralları
 * (evaluate), sektör ortancası (median), eğilim (trend). Burada hiçbir rakam
 * uydurulmaz; verisi olmayan hisse için soru üretilmez.
 *
 * Bütün sorular tek bir piyasanın hisselerindendir; BIST ve ABD karışmaz.
 */

import { MARKET_LABEL } from '../data/store.ts';
import { DEF, evaluate, VLABEL } from '../lib/evaluate.ts';
import { nf, pct } from '../lib/format.ts';
import { trend } from '../lib/sma.ts';
import { groupByIndustry, median } from '../lib/stats.ts';
import { TERMS, termText } from '../terms.ts';
import type { Check, MarketId, StockView, Thresholds, Verdict } from '../types.ts';
import { TOPICS } from './bank.ts';
import type { QuizFact, QuizQuestion, QuizRef } from './types.ts';

/** Soru kalıpları; kimlikte "data-<kalıp>-…" olarak geçer */
export type DataTemplate = 'verdict' | 'fail' | 'lowpeg' | 'quality' | 'cyclical' | 'median' | 'roe' | 'yield' | 'trend';

export const templateOf = (q: QuizQuestion): string => (q.kind === 'data' ? (q.id.split('-')[1] ?? '') : '');

const REF_SCREENER: QuizRef = { tab: 'tarayici', label: 'Tarayıcı: hissenin satırını açıp gerekçeleri okuyun' };
const REF_COMPARE: QuizRef = { tab: 'tarayici', label: 'Tarayıcı · Sektör kıyası' };

/**
 * Talebi görece istikrarlı sayılan sektörler. "Hangisi döngüsel?" sorusunda
 * yanlış seçenekler yalnızca bunlardan seçilir; otomotiv ya da inşaat gibi
 * tartışmaya açık sektörler seçenek olmaz.
 */
const DEFENSIVE = new Set(['telecom', 'retail', 'food_beverage']);

/* ---------- Kutucuklar ---------- */

function fact(id: string, v: string, d?: string): QuizFact {
  const t = TERMS[id];
  const out: QuizFact = { k: t.tr, v };
  if (t.en !== t.tr) out.en = t.en;
  if (d) out.d = d;
  return out;
}

const fkFact = (s: StockView, th: Thresholds | null): QuizFact =>
  fact('fk', s.fk == null ? '–' : nf(s.fk), s.fk == null ? (s.loss ? 'Son 12 ayda zarar' : 'Veri yok') : th ? `Eşik: en çok ${nf(th.fk, 0)}` : undefined);

const pegFact = (s: StockView, th: Thresholds): QuizFact =>
  fact('peg', s.peg == null ? '–' : nf(s.peg), s.peg == null ? 'Hesaplanamıyor' : `Eşik: en çok ${nf(th.peg, 1)}`);

const nbFact = (s: StockView, th: Thresholds): QuizFact =>
  fact('nb', s.nb == null ? '–' : nf(s.nb), s.nb == null ? 'Veri yok' : `Eşik: en çok ${nf(th.nb, 1)}`);

const fgFact = (s: StockView, th: Thresholds): QuizFact =>
  fact('fg', s.fg == null ? s.fgT || '–' : pct(s.fg), s.fg == null ? 'Oran hesaplanamıyor' : `Eşik: en az ${pct(th.fg)}`);

const ngFact = (s: StockView): QuizFact =>
  fact('ng', s.ng == null ? s.ngT || '–' : pct(s.ng), s.ng == null ? 'Oran hesaplanamıyor' : undefined);

const screenFacts = (s: StockView, th: Thresholds): QuizFact[] => [fkFact(s, th), pegFact(s, th), nbFact(s, th), fgFact(s, th), ngFact(s)];

const lead = (s: StockView): string => `${s.k} · ${s.ad} · ${s.sek}${s.cyclical ? ' (döngüsel sektör)' : ''}`;

const check = (checks: Check[], n: string): Check | undefined => checks.find((c) => c.n === n);

const base = (tpl: DataTemplate, s: StockView): Pick<QuizQuestion, 'id' | 'kind' | 'ticker' | 'market' | 'lead'> => ({
  id: `data-${tpl}-${s.market}-${s.k}`,
  kind: 'data',
  ticker: s.k,
  market: s.market,
  lead: lead(s),
});

/** Biçimlenmiş hâlleri birbirinden ve doğru yanıttan farklı ilk üç adayı seçer; üç aday çıkmazsa null. */
function distinct3(correct: string, candidates: string[]): [string, string, string] | null {
  const out: string[] = [];
  for (const c of candidates) {
    if (c === correct || out.includes(c)) continue;
    out.push(c);
    if (out.length === 3) return [out[0], out[1], out[2]];
  }
  return null;
}

/** Sembolden küçük, kararlı bir sayı (hangi yanlış seçeneğin atılacağı gibi seçimler için) */
const pick = (k: string, n: number): number => [...k].reduce((a, ch) => a + ch.charCodeAt(0), 0) % n;

/* ---------- Kalıplar ---------- */

const RULE_NOTE =
  'Hatırlatma: 0,15 ve altındaki PEG, hesaplanamayan PEG, net kârın FAVÖK\'ten 50 puandan fazla hızlı büyümesi, eksik borç verisi ve döngüsel sektör birer uyarıdır.';

/** 1. Tarayıcı bu hisseye hangi sonucu verir? */
function verdictQ(s: StockView, th: Thresholds): QuizQuestion | null {
  const e = evaluate(s, th);
  const order: Verdict[] = ['good', 'warn', 'bad', 'na'];
  if (e.verdict === 'na') return null;
  const bads = e.checks.filter((c) => c.st === 'bad');
  const warns = e.checks.filter((c) => c.st === 'warn');
  let why: string;
  if (e.verdict === 'bad')
    why =
      `${VLABEL.bad}. ${bads.map((c) => c.t).join(' ')}` + (warns.length ? ` Ayrıca: ${warns.map((c) => c.t).join(' ')}` : '');
  else if (e.verdict === 'warn') why = `${VLABEL.warn}. Hiçbir ölçütten kalmıyor, ama: ${warns.map((c) => c.t).join(' ')}`;
  else why = `${VLABEL.good}. ${e.checks.map((c) => c.t).join(' ')}`;
  return {
    ...base('verdict', s),
    topic: 'Tarama kuralları',
    facts: screenFacts(s, th),
    q: 'Tarayıcı, varsayılan eşiklerle bu hisseye hangi sonucu verir?',
    note: RULE_NOTE,
    options: [
      `${VLABEL.good}: bütün ölçütlerden geçer`,
      `${VLABEL.warn}: elenmez ama en az bir uyarı alır`,
      `${VLABEL.bad}: en az bir ölçütten kalır`,
      `${VLABEL.na}: banka gibi başka bir yöntemle bakılır`,
    ],
    correct: order.indexOf(e.verdict),
    why,
    ref: REF_SCREENER,
    keepOrder: true,
  };
}

/** 2. Tek bir ölçütten kalan hisse: hangisinden? */
function failQ(s: StockView, th: Thresholds): QuizQuestion | null {
  const e = evaluate(s, th);
  const bads = e.checks.filter((c) => c.st === 'bad');
  if (bads.length !== 1) return null;
  const statements: Array<[string, string]> = [
    ['Kâr', 'Son 12 ayda zarar ediyor'],
    ['F/K', `F/K eşiğin (${nf(th.fk, 0)}) üzerinde`],
    ['PEG', `PEG eksi ya da eşiğin (${nf(th.peg, 1)}) üzerinde`],
    ['Büyüme kalitesi', `FAVÖK büyümesi eşiğin (${pct(th.fg)}) altında`],
    ['Borç', `Net borç/FAVÖK eşiğin (${nf(th.nb, 1)}) üzerinde`],
  ];
  const right = statements.find(([n]) => n === bads[0].n);
  if (!right) return null;
  const wrong = statements.filter(([n]) => n !== bads[0].n);
  wrong.splice(pick(s.k, wrong.length), 1);
  return {
    ...base('fail', s),
    topic: 'Tarama kuralları',
    facts: screenFacts(s, th),
    q: 'Tarayıcı bu hisseyi varsayılan eşiklerle eliyor. Hangi ölçüt yüzünden?',
    options: [right[1], ...wrong.map(([, text]) => text)],
    correct: 0,
    why: bads[0].t,
    ref: REF_SCREENER,
  };
}

/** 3. Şüpheli derecede düşük PEG nasıl okunur? */
function lowPegQ(s: StockView, th: Thresholds): QuizQuestion | null {
  const c = check(evaluate(s, th).checks, 'PEG');
  if (!c || c.st !== 'warn' || s.peg == null || s.peg <= 0 || s.peg > 0.15) return null;
  return {
    ...base('lowpeg', s),
    topic: 'Büyüme ve PEG',
    facts: [fkFact(s, null), fact('peg', nf(s.peg)), fgFact(s, th), ngFact(s)],
    q: `Bu hissenin PEG'i ${nf(s.peg)}. Tarayıcı bu kadar düşük bir PEG'i nasıl okur?`,
    options: [
      'Şüpheli derecede düşük: büyüme büyük olasılıkla baz etkisinden ya da tek seferlik kalemlerden geliyor; uyarı verir',
      'Çok ucuz: PEG ne kadar düşükse hisse o kadar caziptir; ölçütten temiz geçer',
      'Kâr düşüyor: eksi PEG gibi hisseyi eler',
      'Büyümeye göre pahalı: PEG eşiğin üzerinde sayılır ve hisse elenir',
    ],
    correct: 0,
    why: `${c.t} Film Seti Kahvesi'nin PEG'i de 0,07 idi ve büyümesinin tamamı tek seferlik kira gelirinden geliyordu.`,
    ref: TOPICS.peg.ref,
  };
}

type QualityBranch = 'noFavok' | 'shrinking' | 'baseEffect' | 'gap' | 'fromOperations';

const QUALITY_TEXT: Record<QualityBranch, string> = {
  noFavok: 'Ölçülemiyor: FAVÖK büyümesi hesaplanamadığı için faaliyetin büyüyüp büyümediği bilinmiyor (uyarı)',
  shrinking: 'Faaliyetler büyümüyor: FAVÖK büyümesi eşiğin altında (kalır)',
  baseEffect: 'Baz etkisi: FAVÖK büyümüş ama net kâr büyümesi hesaplanamıyor (uyarı)',
  gap: "Fark faaliyet dışı: net kâr FAVÖK'ten çok daha hızlı büyümüş; kalıcı olmayabilir (uyarı)",
  fromOperations: 'Büyüme faaliyetten: FAVÖK büyümüş, net kâr onunla uyumlu (geçer)',
};
const QUALITY_ST: Record<QualityBranch, Verdict> = { noFavok: 'warn', shrinking: 'bad', baseEffect: 'warn', gap: 'warn', fromOperations: 'good' };

/** 4. "Büyüme kalitesi" ölçütü ne der? */
function qualityQ(s: StockView, th: Thresholds): QuizQuestion | null {
  const c = check(evaluate(s, th).checks, 'Büyüme kalitesi');
  if (!c) return null;
  const branch: QualityBranch =
    s.fg == null ? 'noFavok' : s.fg < th.fg ? 'shrinking' : s.ng == null ? 'baseEffect' : s.ng > s.fg + 50 ? 'gap' : 'fromOperations';
  // Kural değişirse soru yanlış yanıt göstermesin: dal, evaluate() sonucuyla uyuşmalı.
  if (c.st !== QUALITY_ST[branch]) return null;
  // Rakamlara bakınca savunulabilecek ikinci bir seçenek kalmasın.
  const drop = new Set<QualityBranch>();
  if (s.ng == null) drop.add('baseEffect');
  if (s.fg != null && s.ng != null && s.ng > s.fg + 50) drop.add('gap');
  const others = (Object.keys(QUALITY_TEXT) as QualityBranch[]).filter((b) => b !== branch && !drop.has(b));
  while (others.length > 3) others.splice(pick(s.k, others.length), 1);
  if (others.length < 3) return null;
  return {
    ...base('quality', s),
    topic: 'Büyüme kalitesi',
    facts: [fgFact(s, th), ngFact(s)],
    q: 'Tarayıcının "Büyüme kalitesi" ölçütü bu hisse için ne der?',
    note: 'Kural: net kâr büyümesi FAVÖK büyümesini 50 puandan fazla aşıyorsa aradaki fark faaliyet dışı sayılır.',
    options: [QUALITY_TEXT[branch], ...others.map((b) => QUALITY_TEXT[b])],
    correct: 0,
    why: c.t,
    ref: TOPICS.enflasyon.ref,
  };
}

/** 5. Dört hisseden hangisi döngüsel sektörde? */
function cyclicalQs(list: StockView[], th: Thresholds): QuizQuestion[] {
  const defensive = list.filter((s) => !s.cyclical && DEFENSIVE.has(s.ind));
  if (defensive.length < 3) return [];
  const out: QuizQuestion[] = [];
  list
    .filter((s) => s.cyclical)
    .forEach((s, i) => {
      const c = check(evaluate(s, { ...th, cyc: true }).checks, 'Döngüsellik');
      if (!c) return;
      const others = [0, 1, 2].map((j) => defensive[(i + j) % defensive.length]);
      const label = (x: StockView): string => `${x.k} · ${x.sek}`;
      out.push({
        ...base('cyclical', s),
        lead: undefined,
        topic: 'Döngüsellik',
        q: `Tarayıcı bu dört hisseden hangisine "Döngüsel sektör" (${TERMS.cyclical.en}) uyarısı verir?`,
        options: [label(s), ...others.map(label)],
        correct: 0,
        why: `${c.t} Kâr zirvedeyken F/K ve PEG yapay olarak düşük görünür. Öbür üç hissenin sektörü Tarayıcı'da döngüsel sayılmaz.`,
        ref: TOPICS.dongu.ref,
      });
    });
  return out;
}

/** 6. Sektör ortancası: aynı piyasa, aynı sektör */
function medianQs(market: MarketId, list: StockView[]): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  for (const g of groupByIndustry(list.filter((s) => s.fk != null))) {
    const rows = g.stocks.slice().sort((a, b) => (a.fk as number) - (b.fk as number));
    if (rows.length < 2 || rows.length > 6) continue;
    const vals = rows.map((s) => s.fk as number);
    const med = median(vals);
    if (med == null) continue;
    const n = vals.length;
    const sum = vals.reduce((a, b) => a + b, 0);
    const wrong = distinct3(nf(med), [nf(vals[0]), nf(vals[n - 1]), nf(sum / n), nf(sum)]);
    if (!wrong) continue;
    const mid = n >> 1;
    const how =
      n === 2
        ? `İki değerin ortancası ikisinin ortalamasıdır: (${nf(vals[0])} + ${nf(vals[1])}) ÷ 2 = ${nf(med)}.`
        : n % 2
          ? `Değerler küçükten büyüğe sıralanınca ortada kalan ${nf(med)} olur.`
          : `Değerler küçükten büyüğe sıralanınca ortadaki iki değerin (${nf(vals[mid - 1])} ve ${nf(vals[mid])}) ortalaması ${nf(med)} olur.`;
    out.push({
      id: `data-median-${market}-${g.ind}`,
      kind: 'data',
      market,
      topic: 'Sektör ortancası',
      lead: `${MARKET_LABEL[market]} · ${g.sek} (${g.sekEn})`,
      facts: rows.map((s) => ({ k: s.k, v: nf(s.fk), d: s.ad })),
      q: `${g.sek} sektöründe listenizdeki ${MARKET_LABEL[market]} hisselerinin ${termText('fk')} değerleri yukarıda. ${termText('industryMedian')} kaçtır?`,
      options: [nf(med), ...wrong],
      correct: 0,
      why: `${how} Ortanca yalnızca aynı piyasadaki aynı sektörün hisselerinden hesaplanır; uç değerlerden ortalama kadar etkilenmez.`,
      ref: REF_COMPARE,
    });
  }
  return out;
}

const pc = (v: number): string => `%${nf(v, 1)}`;

/** 7. PD/DD ve F/K'dan yaklaşık özkaynak kârlılığı */
function roeQ(s: StockView): QuizQuestion | null {
  if (s.roe == null || s.fk == null || s.fk <= 0 || s.pd == null || s.pd <= 0) return null;
  const wrong = distinct3(pc(s.roe), [pc(s.fk / s.pd), pc(s.pd * s.fk), pc(100 / s.fk), pc(s.roe * 2), pc(s.roe / 2), pc(s.roe + 10)]);
  if (!wrong) return null;
  return {
    ...base('roe', s),
    topic: 'Özkaynak kârlılığı',
    facts: [fact('pd', nf(s.pd)), fact('fk', nf(s.fk))],
    q: `Bu iki çarpandan yaklaşık ${termText('roe').toLocaleLowerCase('tr-TR').replace('roe', 'ROE')} yüzde kaç çıkar?`,
    options: [pc(s.roe), ...wrong],
    correct: 0,
    why: `PD/DD ≈ ÖK kârlılığı × F/K olduğundan ÖK kârlılığı ≈ PD/DD ÷ F/K: ${nf(s.pd)} ÷ ${nf(s.fk)} ≈ ${pc(s.roe)}. Tarayıcı da özkaynak kârlılığını bu yolla, yaklaşık olarak hesaplar.`,
    ref: TOPICS.banka.ref,
  };
}

/** 8. F/K'dan kazanç verimi */
function yieldQ(s: StockView, th: Thresholds): QuizQuestion | null {
  if (s.fk == null || s.fk <= 0) return null;
  const ey = 100 / s.fk;
  const c = check(evaluate(s, th).checks, 'Kâr');
  // Açıklama evaluate()'in metninden gelir; aynı rakamı söylemiyorsa soru üretilmez.
  if (!c || !c.t.includes(pc(ey))) return null;
  const wrong = distinct3(pc(ey), [pc(s.fk), pc(100 - ey), pc(ey / 10), pc(ey * 2), pc(ey / 2)]);
  if (!wrong) return null;
  return {
    ...base('yield', s),
    topic: 'Kazanç verimi',
    facts: [fact('fk', nf(s.fk))],
    q: `Bu F/K ile ${termText('earningsYield').toLocaleLowerCase('tr-TR')} yaklaşık yüzde kaçtır?`,
    options: [pc(ey), ...wrong],
    correct: 0,
    why: `Kazanç verimi F/K'nın tersidir: 1 ÷ ${nf(s.fk)} ≈ ${pc(ey)}. ${c.t} Bu verim, hissenin kendi para birimindeki faizle kıyaslanır.`,
    ref: TOPICS.piyasa.ref,
  };
}

const TREND_TEXT = {
  up: 'Yukarı: fiyat 50 günlük ortalamanın, 50 günlük ortalama da 200 günlük ortalamanın üstünde',
  down: 'Aşağı: fiyat 50 günlük ortalamanın, 50 günlük ortalama da 200 günlük ortalamanın altında',
  mixed: 'Karışık: sıralama yukarı eğilime de aşağı eğilime de uymuyor',
} as const;

/** 9. Fiyat ve ortalamalardan eğilim okuması */
function trendQ(s: StockView): QuizQuestion | null {
  const tr = trend(s.f, s.sma50, s.sma200);
  if (!tr || s.f == null) return null;
  const order = ['up', 'down', 'mixed'] as const;
  return {
    ...base('trend', s),
    topic: 'Hareketli ortalama',
    facts: [fact('price', nf(s.f)), fact('sma50', nf(s.sma50)), fact('sma200', nf(s.sma200))],
    q: `Tarayıcı bu hissenin eğilimini (${TERMS.trend.en.toLocaleLowerCase('en-US')}) nasıl okur?`,
    options: [TREND_TEXT.up, TREND_TEXT.down, TREND_TEXT.mixed, 'Okunamaz: eğilim için önce F/K ve PEG gerekir'],
    correct: order.indexOf(tr),
    why: `Fiyat ${nf(s.f)}, 50 günlük ortalama ${nf(s.sma50)}, 200 günlük ortalama ${nf(s.sma200)}. ${TREND_TEXT[tr]}. Hareketli ortalama eğilimi gösterir, hissenin ucuz ya da pahalı olduğunu söylemez.`,
    ref: TOPICS.sma.ref,
    keepOrder: true,
  };
}

/* ---------- Dışa açık ---------- */

/**
 * Bir piyasanın hisselerinden üretilebilecek bütün veri soruları.
 * Banka ve verisi olmayan hisseler dışarıda kalır; başka piyasadan hisse gelirse atılır.
 */
export function dataQuestions(market: MarketId, stocks: StockView[], th: Thresholds = DEF): QuizQuestion[] {
  const list = stocks
    .filter((s) => s.market === market && s.hasData && !s.bank)
    .sort((a, b) => a.k.localeCompare(b.k, 'tr'));
  const out: Array<QuizQuestion | null> = [];
  for (const s of list) out.push(verdictQ(s, th), failQ(s, th), lowPegQ(s, th), qualityQ(s, th), roeQ(s), yieldQ(s, th), trendQ(s));
  out.push(...cyclicalQs(list, th), ...medianQs(market, list));
  return out.filter((q): q is QuizQuestion => q != null);
}

/** Bu piyasada verisi olan (banka dışı) hisse sayısı */
export const dataCount = (market: MarketId, stocks: StockView[]): number =>
  stocks.filter((s) => s.market === market && s.hasData && !s.bank).length;
