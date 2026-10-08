/**
 * Calculations for the stories. Pure functions that never touch the DOM;
 * tests/learn.test.ts checks them against the figures of the first version.
 * Amounts are in TL unless stated otherwise.
 */

import { distancePct, smaSeries } from '@fintools/shared/sma';

/* ---------- Story 3: Ayşe's coffee shop, price and multiples ---------- */

/** Net income, equity, EBITDA, net debt, share count */
export const CAFE = { netIncome: 210000, equity: 600000, ebitda: 400000, netDebt: 50000, shares: 100000 } as const;

export interface PriceState {
  /** Share price */
  p: number;
  /** Expected net income growth % */
  gr: number;
  /** Market cap */
  marketCap: number;
  pe: number;
  pb: number;
  /** Enterprise value */
  ev: number;
  evEbitda: number;
  /** Null when growth is zero or negative */
  peg: number | null;
  /** Return on equity % */
  roe: number;
  /** Earnings yield % = 100 ÷ P/E */
  ey: number;
  /** Earnings per share */
  eps: number;
}

export function priceState(p: number, gr: number): PriceState {
  const marketCap = p * CAFE.shares;
  const pe = marketCap / CAFE.netIncome;
  const ev = marketCap + CAFE.netDebt;
  return {
    p,
    gr,
    marketCap,
    pe,
    pb: marketCap / CAFE.equity,
    ev,
    evEbitda: ev / CAFE.ebitda,
    peg: gr > 0 ? pe / gr : null,
    roe: (CAFE.netIncome / CAFE.equity) * 100,
    ey: 100 / pe,
    eps: CAFE.netIncome / CAFE.shares,
  };
}

export const peText = (pe: number): string =>
  pe < 8
    ? 'Ucuz bölge: kâr sabit kalsa bile fiyatı hızla geri öder.'
    : pe < 15
      ? 'Orta: kâr bu seviyede kalırsa makul bir fiyat.'
      : 'Yüksek: fiyatı haklı çıkarmak için kârın büyümesi gerekir.';

export const pegText = (peg: number | null): string =>
  peg == null
    ? 'Kâr büyümüyorsa PEG anlamsızdır.'
    : peg < 1
      ? 'Büyümesine göre makul, tahmin doğruysa.'
      : 'Büyümesine göre pahalı.';

/* ---------- Story 4: three coffee shops ---------- */

export interface PegCase {
  n: string;
  /** Net income growth % */
  g: number;
  netDebt: number;
  st: 'good' | 'warn' | 'bad';
  t: string;
}

export const PEG_PRICE = 3000000;
export const PEG_PE = PEG_PRICE / CAFE.netIncome;

export const PEG_C: PegCase[] = [
  { n: 'Köşe Kahvecisi', g: 5, netDebt: 0, st: 'bad', t: 'büyümeye göre pahalı' },
  { n: 'Zincir Kahve', g: 35, netDebt: 1500000, st: 'good', t: 'ucuz ama borçlu' },
  { n: 'Film Seti Kahvesi', g: 200, netDebt: 0, st: 'warn', t: 'tek seferlik büyüme' },
];

export const pegOf = (c: PegCase): number => PEG_PE / c.g;
export const evOf = (c: PegCase): number => PEG_PRICE + c.netDebt;

/* ---------- Story 5: inflation accounting ---------- */

export interface InflationState {
  inf: number;
  /** Operating profit */
  op: number;
  /** Monetary gain */
  gain: number;
  /** Reported net income */
  rep: number;
  /** Value of the debt in start-of-year money */
  real: number;
}

export function inflationState(inf: number): InflationState {
  const op = 210000;
  const gain = (200000 * inf) / 100;
  return { inf, op, gain, rep: op + gain, real: 200000 / (1 + inf / 100) };
}

/* ---------- Story 6: ice cream shop ---------- */

/** Monthly net income, thousand TL (January to December) */
export const ICE_CREAM_MONTHLY = [-10, -10, 0, 20, 60, 120, 160, 150, 60, 10, -10, -15];

export interface IceCreamState {
  /** Annual net income, thousand TL */
  yr: number;
  /** Summer quarter (June to August), thousand TL */
  summer: number;
  /** Sale price, thousand TL */
  price: number;
  pe: number;
  /** Summer quarter × 4, thousand TL */
  peakYr: number;
  peakPe: number;
}

export function iceCreamState(): IceCreamState {
  const yr = ICE_CREAM_MONTHLY.reduce((a, b) => a + b, 0);
  const summer = ICE_CREAM_MONTHLY[5] + ICE_CREAM_MONTHLY[6] + ICE_CREAM_MONTHLY[7];
  const price = 5000;
  return { yr, summer, price, pe: price / yr, peakYr: summer * 4, peakPe: price / (summer * 4) };
}

/* ---------- Story 7: neighborhood fund (a bank in miniature) ---------- */

export interface FundState {
  npl: number;
  /** Loans */
  L: number;
  /** Equity */
  E: number;
  /** Interest income, interest expense, net interest income */
  interestIncome: number;
  interestExpense: number;
  nii: number;
  opex: number;
  /** Loan loss provisions */
  prov: number;
  tax: number;
  net: number;
  roe: number;
}

export function fundState(npl: number): FundState {
  const L = 950000;
  const D = 1000000;
  const E = 100000;
  const interestIncome = L * 0.45;
  const interestExpense = D * 0.35;
  const nii = interestIncome - interestExpense;
  const opex = 30000;
  const prov = (L * npl) / 100;
  const pre = nii - opex - prov;
  const tax = pre > 0 ? pre * 0.25 : 0;
  const net = pre - tax;
  return { npl, L, E, interestIncome, interestExpense, nii, opex, prov, tax, net, roe: (net / E) * 100 };
}

/* ---------- Story 8: daily takings and the moving average ---------- */

/** Selectable windows (days) */
export const SMA_WINDOWS = [5, 20, 50, 200] as const;
/** Short and long window used for the crossover */
export const SMA_SHORT = 50;
export const SMA_LONG = 200;

/** Number of generated days and number of latest days shown in the chart */
export const TAKINGS_TOTAL = 500;
export const TAKINGS_SHOWN = 300;
const HIDDEN = TAKINGS_TOTAL - TAKINGS_SHOWN;

/** Events of the story by day number in the chart (1…300) */
export const ROADWORK_START = 50;
export const ROADWORK_END = 140;
export const HOLIDAY_DAYS = [251, 252];

/** Knots of the trend: [day index (0…499), daily takings] */
const KNOTS: Array<[number, number]> = [
  [0, 5300],
  [HIDDEN + ROADWORK_START, 5700],
  [HIDDEN + ROADWORK_END, 4300],
  [TAKINGS_TOTAL - 1, 7000],
];

/** Seeded pseudo-random number generator (mulberry32): the same series on every load. */
function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Noise-free trend: smooth (cosine) transition between the knots. */
export function takingsTrend(i: number): number {
  for (let k = 1; k < KNOTS.length; k++) {
    const [x0, y0] = KNOTS[k - 1];
    const [x1, y1] = KNOTS[k];
    if (i <= x1) {
      const t = (i - x0) / (x1 - x0);
      return y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * t))) / 2;
    }
  }
  return KNOTS[KNOTS.length - 1][1];
}

let TAKINGS: number[] | null = null;

/**
 * Fictional daily takings of Ayşe's coffee shop, 500 days, oldest first.
 * Trend + weekly pattern (busy on Sundays) + random noise + rainy days +
 * holiday. The last day is rainy. Figures are rounded to 10 TL.
 */
export function takings(): number[] {
  if (TAKINGS) return TAKINGS;
  const r = rng(7);
  const out: number[] = [];
  for (let i = 0; i < TAKINGS_TOTAL; i++) {
    let v = takingsTrend(i);
    const wd = i % 7;
    if (wd === 5) v *= 1.18;
    else if (wd === 1) v *= 0.92;
    v *= 1 + (r() - 0.5) * 0.24;
    const rain = r() < 0.09;
    if (rain) v *= 0.72;
    out.push(v);
  }
  HOLIDAY_DAYS.forEach((d, k) => {
    out[HIDDEN + d - 1] = takingsTrend(HIDDEN + d - 1) * (1.45 - k * 0.1);
  });
  out[TAKINGS_TOTAL - 1] = takingsTrend(TAKINGS_TOTAL - 1) * 0.86;
  TAKINGS = out.map((v) => Math.round(v / 10) * 10);
  return TAKINGS;
}

export interface CrossMark {
  kind: 'golden' | 'death';
  /** Day number in the chart (1…300) */
  day: number;
}

/** Crossovers of two average series (same length; days with null are skipped). */
export function crossings(short: Array<number | null>, long: Array<number | null>): Array<{ kind: 'golden' | 'death'; index: number }> {
  const out: Array<{ kind: 'golden' | 'death'; index: number }> = [];
  for (let i = 1; i < short.length; i++) {
    const a0 = short[i - 1], b0 = long[i - 1], a1 = short[i], b1 = long[i];
    if (a0 == null || b0 == null || a1 == null || b1 == null) continue;
    if (a0 <= b0 && a1 > b1) out.push({ kind: 'golden', index: i });
    else if (a0 >= b0 && a1 < b1) out.push({ kind: 'death', index: i });
  }
  return out;
}

export interface SmaStory {
  /** Selected window (days) */
  win: number;
  /** Takings of the last 300 days */
  daily: number[];
  /** Average of the selected window, same 300 days */
  avg: number[];
  /** 200-day average, same 300 days */
  long: number[];
  /** Today's (last day's) takings */
  today: number;
  /** Today's N-day average */
  avgToday: number;
  /** Distance of today from the average, % */
  dist: number;
  /** Approximate lag of the average, in days: (N − 1) ÷ 2 */
  lag: number;
  /** Day on which the average is lowest (1…300) */
  trough: number;
  /** Crossovers of the 50- and 200-day averages in the chart */
  crosses: CrossMark[];
}

/** State of story 8: the average, distance and crossovers for the selected window. */
export function smaStory(win: number): SmaStory {
  const all = takings();
  const cut = <T>(a: T[]): T[] => a.slice(HIDDEN);
  const avg = cut(smaSeries(all, win)) as number[];
  const longAll = smaSeries(all, SMA_LONG);
  const shortAll = smaSeries(all, SMA_SHORT);
  const today = all[all.length - 1];
  const avgToday = avg[avg.length - 1];
  const crosses = crossings(shortAll, longAll)
    .filter((c) => c.index >= HIDDEN)
    .map((c) => ({ kind: c.kind, day: c.index - HIDDEN + 1 }));
  return {
    win,
    daily: cut(all),
    avg,
    long: cut(longAll) as number[],
    today,
    avgToday,
    dist: distancePct(today, avgToday) ?? 0,
    lag: (win - 1) / 2,
    trough: avg.indexOf(Math.min(...avg)) + 1,
    crosses,
  };
}

/* ---------- Story 9: two countries, two coffee shops ---------- */

/**
 * Example (fictional) figures: not real interest or inflation rates.
 * Both shops have the same P/E (that of Ayşe's coffee shop at 30 TL).
 */
export const COUNTRY = {
  pe: PEG_PE,
  /** Dollar interest rate % */
  usRate: 4,
  /** Inflation %: Turkey, US */
  trInf: 35,
  usInf: 3,
  /** Nominal net income growth %: TL, USD */
  trGrowth: 40,
  usGrowth: 7,
} as const;

export interface CountrySide {
  /** Local interest rate % */
  rate: number;
  /** Earnings yield − interest rate, in percentage points */
  gap: number;
  /** The P/E at which earnings yield equals the rate: 100 ÷ rate */
  parityPe: number;
  inf: number;
  /** Nominal and real net income growth % */
  growth: number;
  realGrowth: number;
  peg: number;
}

export interface CountryState {
  pe: number;
  /** Earnings yield % (the same in both shops) */
  ey: number;
  tr: CountrySide;
  us: CountrySide;
}

/** Real growth % = (1 + nominal) ÷ (1 + inflation) − 1 */
export const realGrowth = (nominalPct: number, infPct: number): number =>
  ((1 + nominalPct / 100) / (1 + infPct / 100) - 1) * 100;

export function countryState(trRate: number): CountryState {
  const ey = 100 / COUNTRY.pe;
  const side = (rate: number, inf: number, growth: number): CountrySide => ({
    rate,
    gap: ey - rate,
    parityPe: 100 / rate,
    inf,
    growth,
    realGrowth: realGrowth(growth, inf),
    peg: COUNTRY.pe / growth,
  });
  return {
    pe: COUNTRY.pe,
    ey,
    tr: side(trRate, COUNTRY.trInf, COUNTRY.trGrowth),
    us: side(COUNTRY.usRate, COUNTRY.usInf, COUNTRY.usGrowth),
  };
}
