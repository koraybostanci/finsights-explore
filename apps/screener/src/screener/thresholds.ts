/**
 * Screening thresholds. The screener and the calculator tab use the same thresholds
 * (as in the first release), so they live in one place and are stored in the browser.
 */

import type { Thresholds } from '../types.ts';
import { DEF } from '../lib/evaluate.ts';
import { lsGet, lsSet } from '../data/store.ts';

const KEY = 'thresholds';

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Turns a stored (or external) value into valid thresholds; a missing or malformed field falls back to the default. */
export function sanitizeThresholds(raw: unknown): Thresholds {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    maxPe: num(r.maxPe, DEF.maxPe),
    maxPeg: num(r.maxPeg, DEF.maxPeg),
    maxNetDebtEbitda: num(r.maxNetDebtEbitda, DEF.maxNetDebtEbitda),
    minEbitdaGrowth: num(r.minEbitdaGrowth, DEF.minEbitdaGrowth),
    warnCyclical: bool(r.warnCyclical, DEF.warnCyclical),
    showBanks: bool(r.showBanks, DEF.showBanks),
  };
}

/** Turns the text of a number input into a threshold; empty or invalid input gives the default (as in the first release). */
export function parseThreshold(text: string, fallback: number): number {
  const v = parseFloat(text);
  return Number.isFinite(v) ? v : fallback;
}

let current: Thresholds | null = null;
const subs = new Set<() => void>();

function notify(): void {
  subs.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

export function getThresholds(): Thresholds {
  if (!current) current = sanitizeThresholds(lsGet<unknown>(KEY, null));
  return { ...current };
}

export function setThresholds(patch: Partial<Thresholds>): void {
  current = sanitizeThresholds({ ...getThresholds(), ...patch });
  lsSet(KEY, current);
  notify();
}

export function resetThresholds(): void {
  current = { ...DEF };
  lsSet(KEY, current);
  notify();
}

/** Called when a threshold changes; the returned function unsubscribes. */
export function subscribeThresholds(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
