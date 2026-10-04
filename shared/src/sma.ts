/**
 * Basit hareketli ortalama (simple moving average, SMA).
 * Girdi: günlük kapanışlar, eskiden yeniye.
 */

/** n günlük SMA dizisi; ilk n-1 değer null. */
export function smaSeries(closes: number[], n: number): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (n <= 0) return out;
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Son günün n günlük ortalaması; yeterli veri yoksa null. */
export function lastSma(closes: number[], n: number): number | null {
  if (n <= 0 || closes.length < n) return null;
  let sum = 0;
  for (let i = closes.length - n; i < closes.length; i++) sum += closes[i];
  return sum / n;
}

/** Fiyatın ortalamaya uzaklığı %; (fiyat / ortalama - 1) × 100. */
export function distancePct(price: number | null, avg: number | null): number | null {
  if (price == null || avg == null || avg === 0) return null;
  return (price / avg - 1) * 100;
}

export type CrossKind = 'golden' | 'death';

export interface Cross {
  kind: CrossKind;
  /** closes dizisindeki gün sırası */
  index: number;
}

/**
 * Son `lookback` gün içindeki en yeni kesişim.
 * golden: kısa ortalama uzunu yukarı keser (altın kesişim, golden cross)
 * death: kısa ortalama uzunu aşağı keser (ölüm kesişimi, death cross)
 */
export function lastCross(closes: number[], short = 50, long = 200, lookback = 60): Cross | null {
  const a = smaSeries(closes, short);
  const b = smaSeries(closes, long);
  const start = Math.max(1, closes.length - lookback);
  for (let i = closes.length - 1; i >= start; i--) {
    const a1 = a[i], b1 = b[i], a0 = a[i - 1], b0 = b[i - 1];
    if (a1 == null || b1 == null || a0 == null || b0 == null) continue;
    if (a0 <= b0 && a1 > b1) return { kind: 'golden', index: i };
    if (a0 >= b0 && a1 < b1) return { kind: 'death', index: i };
  }
  return null;
}

export type Trend = 'up' | 'down' | 'mixed';

/**
 * Basit trend okuması:
 * up: fiyat > SMA50 > SMA200, down: fiyat < SMA50 < SMA200, aksi halde mixed.
 * Eksik veri varsa null.
 */
export function trend(price: number | null, sma50: number | null, sma200: number | null): Trend | null {
  if (price == null || sma50 == null || sma200 == null) return null;
  if (price > sma50 && sma50 > sma200) return 'up';
  if (price < sma50 && sma50 < sma200) return 'down';
  return 'mixed';
}
