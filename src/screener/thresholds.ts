/**
 * Tarama eşikleri. Tarayıcı ve "Kendi hesabın" aynı eşikleri kullanır
 * (ilk sürümdeki gibi); bu yüzden tek bir yerde durur ve tarayıcıda saklanır.
 */

import type { Thresholds } from '../types.ts';
import { DEF } from '../lib/evaluate.ts';
import { lsGet, lsSet } from '../data/store.ts';

const KEY = 'thresholds';

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Saklanan (ya da dışarıdan gelen) değeri geçerli eşiklere çevirir; eksik ya da bozuk alan varsayılana döner. */
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

/** Sayı kutusundaki metni eşiğe çevirir; boş ya da geçersizse varsayılan (ilk sürümdeki davranış). */
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

/** Eşik değişince çağrılır; dönen işlev aboneliği kaldırır. */
export function subscribeThresholds(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
