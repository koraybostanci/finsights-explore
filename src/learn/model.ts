/**
 * Hikâyelerin hesapları. DOM'a dokunmayan saf işlevlerdir; tests/learn.test.ts
 * ilk sürümün rakamlarıyla doğrular. Tutarlar TL'dir, aksi yazılmadıkça.
 */

import { distancePct, smaSeries } from '@fintools/shared/sma';

/* ---------- Hikâye 3: Ayşe'nin Kahvesi, fiyat ve çarpanlar ---------- */

/** Net kâr, özkaynak, FAVÖK, net borç, pay sayısı */
export const KAHVE = { nk: 210000, ok: 600000, fv: 400000, nb: 50000, pay: 100000 } as const;

export interface FiyatState {
  /** Pay fiyatı */
  p: number;
  /** Beklenen net kâr büyümesi % */
  gr: number;
  /** Piyasa değeri */
  pd: number;
  fk: number;
  pddd: number;
  /** Firma değeri */
  fd: number;
  fdf: number;
  /** Büyüme sıfır ya da eksiyse null */
  peg: number | null;
  /** Özkaynak kârlılığı % */
  roe: number;
  /** Kazanç verimi % = 100 ÷ F/K */
  ey: number;
  /** Hisse başına kâr */
  eps: number;
}

export function fiyatState(p: number, gr: number): FiyatState {
  const pd = p * KAHVE.pay;
  const fk = pd / KAHVE.nk;
  const fd = pd + KAHVE.nb;
  return {
    p,
    gr,
    pd,
    fk,
    pddd: pd / KAHVE.ok,
    fd,
    fdf: fd / KAHVE.fv,
    peg: gr > 0 ? fk / gr : null,
    roe: (KAHVE.nk / KAHVE.ok) * 100,
    ey: 100 / fk,
    eps: KAHVE.nk / KAHVE.pay,
  };
}

export const fkText = (fk: number): string =>
  fk < 8
    ? 'Ucuz bölge: kâr sabit kalsa bile fiyatı hızla geri öder.'
    : fk < 15
      ? 'Orta: kâr bu seviyede kalırsa makul bir fiyat.'
      : 'Yüksek: fiyatı haklı çıkarmak için kârın büyümesi gerekir.';

export const pegText = (peg: number | null): string =>
  peg == null
    ? 'Kâr büyümüyorsa PEG anlamsızdır.'
    : peg < 1
      ? 'Büyümesine göre makul, tahmin doğruysa.'
      : 'Büyümesine göre pahalı.';

/* ---------- Hikâye 4: üç kahveci ---------- */

export interface PegCase {
  n: string;
  /** Net kâr büyümesi % */
  g: number;
  nb: number;
  st: 'good' | 'warn' | 'bad';
  t: string;
}

export const PEG_PRICE = 3000000;
export const PEG_FK = PEG_PRICE / KAHVE.nk;

export const PEG_C: PegCase[] = [
  { n: 'Köşe Kahvecisi', g: 5, nb: 0, st: 'bad', t: 'büyümeye göre pahalı' },
  { n: 'Zincir Kahve', g: 35, nb: 1500000, st: 'good', t: 'ucuz ama borçlu' },
  { n: 'Film Seti Kahvesi', g: 200, nb: 0, st: 'warn', t: 'tek seferlik büyüme' },
];

export const pegOf = (c: PegCase): number => PEG_FK / c.g;
export const evOf = (c: PegCase): number => PEG_PRICE + c.nb;

/* ---------- Hikâye 5: enflasyon muhasebesi ---------- */

export interface EnfState {
  inf: number;
  /** Faaliyetten gelen kâr */
  op: number;
  /** Parasal kazanç */
  gain: number;
  /** Raporlanan net kâr */
  rep: number;
  /** Borcun yıl başı parasıyla değeri */
  real: number;
}

export function enfState(inf: number): EnfState {
  const op = 210000;
  const gain = (200000 * inf) / 100;
  return { inf, op, gain, rep: op + gain, real: 200000 / (1 + inf / 100) };
}

/* ---------- Hikâye 6: dondurmacı ---------- */

/** Aylık net kâr, bin TL (Ocak–Aralık) */
export const DON_V = [-10, -10, 0, 20, 60, 120, 160, 150, 60, 10, -10, -15];

export interface DondurmaState {
  /** Yıllık kâr, bin TL */
  yr: number;
  /** Yaz çeyreği (Haz–Ağu), bin TL */
  summer: number;
  /** Satış fiyatı, bin TL */
  price: number;
  fk: number;
  /** Yaz çeyreği × 4, bin TL */
  peakYr: number;
  peakFk: number;
}

export function dondurmaState(): DondurmaState {
  const yr = DON_V.reduce((a, b) => a + b, 0);
  const summer = DON_V[5] + DON_V[6] + DON_V[7];
  const price = 5000;
  return { yr, summer, price, fk: price / yr, peakYr: summer * 4, peakFk: price / (summer * 4) };
}

/* ---------- Hikâye 7: mahalle sandığı ---------- */

export interface SandikState {
  npl: number;
  /** Krediler */
  L: number;
  /** Özkaynak */
  E: number;
  /** Faiz geliri, faiz gideri, net faiz geliri */
  fi: number;
  fg: number;
  nii: number;
  opex: number;
  /** Batık kredi karşılığı */
  prov: number;
  tax: number;
  net: number;
  roe: number;
}

export function sandikState(npl: number): SandikState {
  const L = 950000;
  const D = 1000000;
  const E = 100000;
  const fi = L * 0.45;
  const fg = D * 0.35;
  const nii = fi - fg;
  const opex = 30000;
  const prov = (L * npl) / 100;
  const pre = nii - opex - prov;
  const tax = pre > 0 ? pre * 0.25 : 0;
  const net = pre - tax;
  return { npl, L, E, fi, fg, nii, opex, prov, tax, net, roe: (net / E) * 100 };
}

/* ---------- Hikâye 8: günlük hasılat ve hareketli ortalama ---------- */

/** Seçilebilen pencereler (gün) */
export const SMA_WINDOWS = [5, 20, 50, 200] as const;
/** Kesişimde kullanılan kısa ve uzun pencere */
export const SMA_SHORT = 50;
export const SMA_LONG = 200;

/** Üretilen gün sayısı ve grafikte gösterilen son gün sayısı */
export const TAKINGS_TOTAL = 500;
export const TAKINGS_SHOWN = 300;
const HIDDEN = TAKINGS_TOTAL - TAKINGS_SHOWN;

/** Grafikteki gün numaralarıyla (1…300) hikâyenin olayları */
export const ROADWORK_START = 50;
export const ROADWORK_END = 140;
export const BAYRAM_DAYS = [251, 252];

/** Eğilimin düğüm noktaları: [gün sırası (0…499), günlük hasılat] */
const KNOTS: Array<[number, number]> = [
  [0, 5300],
  [HIDDEN + ROADWORK_START, 5700],
  [HIDDEN + ROADWORK_END, 4300],
  [TAKINGS_TOTAL - 1, 7000],
];

/** Tohumlu sözde rastgele sayı üreteci (mulberry32): her açılışta aynı seri. */
function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gürültüsüz eğilim: düğümler arasında yumuşak (kosinüs) geçiş. */
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
 * Ayşe'nin Kahvesi'nin kurgusal günlük hasılatı, 500 gün, eskiden yeniye.
 * Eğilim + haftalık düzen (pazar günü kalabalık) + rastgele dalga + yağmurlu
 * günler + bayram. Son gün yağmurludur. Rakamlar 10 TL'ye yuvarlanır.
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
  BAYRAM_DAYS.forEach((d, k) => {
    out[HIDDEN + d - 1] = takingsTrend(HIDDEN + d - 1) * (1.45 - k * 0.1);
  });
  out[TAKINGS_TOTAL - 1] = takingsTrend(TAKINGS_TOTAL - 1) * 0.86;
  TAKINGS = out.map((v) => Math.round(v / 10) * 10);
  return TAKINGS;
}

export interface CrossMark {
  kind: 'golden' | 'death';
  /** Grafikteki gün numarası (1…300) */
  day: number;
}

/** İki ortalama dizisinin kesişimleri (diziler aynı uzunlukta; null olan günler atlanır). */
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
  /** Seçilen pencere (gün) */
  win: number;
  /** Son 300 günün hasılatı */
  daily: number[];
  /** Seçilen pencerenin ortalaması, aynı 300 gün */
  avg: number[];
  /** 200 günlük ortalama, aynı 300 gün */
  long: number[];
  /** Bugünkü (son gün) hasılat */
  today: number;
  /** Bugünkü N günlük ortalama */
  avgToday: number;
  /** Bugünün ortalamaya uzaklığı % */
  dist: number;
  /** Ortalamanın yaklaşık gecikmesi, gün: (N − 1) ÷ 2 */
  lag: number;
  /** Ortalamanın en düşük olduğu gün (1…300) */
  trough: number;
  /** 50 ve 200 günlük ortalamaların grafikteki kesişimleri */
  crosses: CrossMark[];
}

/** Hikâye 8'in durumu: seçilen pencereye göre ortalama, uzaklık ve kesişimler. */
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

/* ---------- Hikâye 9: iki ülke, iki kahveci ---------- */

/**
 * Örnek (kurgusal) rakamlar: gerçek faiz ya da enflasyon oranları değildir.
 * İki dükkânın F/K'sı aynıdır (Ayşe'nin Kahvesi'nin 30 TL'deki F/K'sı).
 */
export const ULKE = {
  fk: PEG_FK,
  /** Dolar faizi % */
  usRate: 4,
  /** Enflasyon %: Türkiye, ABD */
  trInf: 35,
  usInf: 3,
  /** Nominal net kâr büyümesi %: TL, USD */
  trGrowth: 40,
  usGrowth: 7,
} as const;

export interface UlkeSide {
  /** Yerel faiz % */
  rate: number;
  /** Kazanç verimi − faiz, puan */
  gap: number;
  /** Kazanç veriminin faize eşit olduğu F/K = 100 ÷ faiz */
  parityFk: number;
  inf: number;
  /** Nominal ve reel kâr büyümesi % */
  growth: number;
  realGrowth: number;
  peg: number;
}

export interface UlkeState {
  fk: number;
  /** Kazanç verimi % (iki dükkânda aynı) */
  ey: number;
  tr: UlkeSide;
  us: UlkeSide;
}

/** Reel büyüme % = (1 + nominal) ÷ (1 + enflasyon) − 1 */
export const realGrowth = (nominalPct: number, infPct: number): number =>
  ((1 + nominalPct / 100) / (1 + infPct / 100) - 1) * 100;

export function ulkeState(trRate: number): UlkeState {
  const ey = 100 / ULKE.fk;
  const side = (rate: number, inf: number, growth: number): UlkeSide => ({
    rate,
    gap: ey - rate,
    parityFk: 100 / rate,
    inf,
    growth,
    realGrowth: realGrowth(growth, inf),
    peg: ULKE.fk / growth,
  });
  return {
    fk: ULKE.fk,
    ey,
    tr: side(trRate, ULKE.trInf, ULKE.trGrowth),
    us: side(ULKE.usRate, ULKE.usInf, ULKE.usGrowth),
  };
}
