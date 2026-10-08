/**
 * Cache of the AI texts (localStorage). A request is not repeated for the same stock,
 * data date, provider and model, so the user's key is not spent for nothing.
 * At most CACHE_MAX entries are kept; the oldest is dropped.
 */

import { lsGet, lsSet } from '../data/store.ts';

export const CACHE_MAX = 60;
const K_CACHE = 'ai.cache';

export interface CacheEntry {
  key: string;
  text: string;
  providerLabel: string;
  model: string;
  /** ISO tarih-saat */
  createdAt: string;
}

export interface CacheKeyParts {
  /** "stock" | "industry" */
  kind: string;
  /** Id unique within a market: a stock symbol or an industry id */
  id: string;
  market: string;
  /** data().asOf */
  asOf: string;
  provider: string;
  model: string;
  /** Prompt version (PROMPT_VERSION) */
  version: number;
  /** The prompt text: hashed into the key so the key changes when thresholds or the watchlist change */
  prompt?: string;
}

/** Short, stable text digest (FNV-1a, 32 bit). Not meant for security. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function cacheKey(p: CacheKeyParts): string {
  const base = [p.kind, p.market, p.id, p.asOf, p.provider, p.model, `v${p.version}`].join('|');
  return p.prompt == null ? base : `${base}|${hash(p.prompt)}`;
}

function readAll(): CacheEntry[] {
  const v = lsGet<unknown>(K_CACHE, []);
  if (!Array.isArray(v)) return [];
  return v.filter(
    (e): e is CacheEntry =>
      typeof e === 'object' && e !== null && typeof (e as CacheEntry).key === 'string' && typeof (e as CacheEntry).text === 'string',
  );
}

export function cacheGet(key: string): CacheEntry | null {
  return readAll().find((e) => e.key === key) ?? null;
}

/** Appends the entry (newest last); when the limit is exceeded, drops from the front (the oldest). */
export function cachePut(entry: CacheEntry): void {
  const rest = readAll().filter((e) => e.key !== entry.key);
  rest.push(entry);
  lsSet(K_CACHE, rest.slice(Math.max(0, rest.length - CACHE_MAX)));
}

export function cacheClear(): void {
  lsSet(K_CACHE, []);
}

export const cacheSize = (): number => readAll().length;
