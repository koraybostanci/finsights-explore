/**
 * Simple moving average (SMA).
 * Input: daily closes, oldest first.
 */

/** SMA series over n days; the first n-1 values are null. */
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

/** Average of the last n days; null when there is not enough data. */
export function lastSma(closes: number[], n: number): number | null {
  if (n <= 0 || closes.length < n) return null;
  let sum = 0;
  for (let i = closes.length - n; i < closes.length; i++) sum += closes[i];
  return sum / n;
}

/** Distance of the price from the average in %: (price / average - 1) × 100. */
export function distancePct(price: number | null, avg: number | null): number | null {
  if (price == null || avg == null || avg === 0) return null;
  return (price / avg - 1) * 100;
}

export type CrossKind = 'golden' | 'death';

export interface Cross {
  kind: CrossKind;
  /** Day index in the closes array */
  index: number;
}

/**
 * The most recent crossover within the last `lookback` days.
 * golden: the short average crosses above the long one (golden cross)
 * death: the short average crosses below the long one (death cross)
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
 * Simple trend reading:
 * up: price > SMA50 > SMA200, down: price < SMA50 < SMA200, otherwise mixed.
 * null when data is missing.
 */
export function trend(price: number | null, sma50: number | null, sma200: number | null): Trend | null {
  if (price == null || sma50 == null || sma200 == null) return null;
  if (price > sma50 && sma50 > sma200) return 'up';
  if (price < sma50 && sma50 < sma200) return 'down';
  return 'mixed';
}
