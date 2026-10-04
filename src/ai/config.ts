/**
 * Yapay zekâ ayarları: seçili sağlayıcı, sağlayıcı başına anahtar ve model,
 * özel adres. Hepsi yalnızca bu tarayıcıda (localStorage, "finsights." öneki)
 * durur; anahtar hiçbir yere yazdırılmaz ve hiçbir adrese eklenmez.
 *
 * Her değişiklikte store 'ai' olayı yayılır.
 */

import { emit, lsGet, lsRemove, lsSet } from '../data/store.ts';
import { DEFAULT_PROVIDER, isConfigured, isProviderId, providerDef } from './providers.ts';
import type { ProviderId, ResolvedConfig } from './providers.ts';
import type { AiStatus } from './types.ts';

const K_PROVIDER = 'ai.provider';
const kKey = (p: ProviderId) => `ai.key.${p}`;
const kModel = (p: ProviderId) => `ai.model.${p}`;
const kModels = (p: ProviderId) => `ai.models.${p}`;
const K_BASE = 'ai.baseUrl';

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

export function getProvider(): ProviderId {
  const v = lsGet<unknown>(K_PROVIDER, DEFAULT_PROVIDER);
  return isProviderId(v) ? v : DEFAULT_PROVIDER;
}

export function setProvider(p: ProviderId): void {
  lsSet(K_PROVIDER, p);
  emit('ai');
}

export const getKey = (p: ProviderId): string => text(lsGet<unknown>(kKey(p), ''));

export function setKey(p: ProviderId, key: string): void {
  const k = key.trim();
  if (k) lsSet(kKey(p), k);
  else lsRemove(kKey(p));
  emit('ai');
}

/** Anahtarı ve o anahtarla alınmış model listesini siler; seçili model adı kalır. */
export function clearKey(p: ProviderId): void {
  lsRemove(kKey(p));
  lsRemove(kModels(p));
  emit('ai');
}

/** Sağlayıcı başına son seçilen model */
export const getModel = (p: ProviderId): string => text(lsGet<unknown>(kModel(p), ''));

export function setModel(p: ProviderId, model: string): void {
  const m = model.trim();
  if (m) lsSet(kModel(p), m);
  else lsRemove(kModel(p));
  emit('ai');
}

/** Özel adresin taban adresi (yalnızca "custom" sağlayıcısında kullanılır) */
export const getBaseUrl = (): string => text(lsGet<unknown>(K_BASE, ''));

export function setBaseUrl(url: string): void {
  const u = url.trim();
  if (u) lsSet(K_BASE, u);
  else lsRemove(K_BASE);
  lsRemove(kModels('custom'));
  emit('ai');
}

/** Sağlayıcıdan en son alınan model listesi (sayfa yenilenince açılır liste dolu gelsin diye saklanır) */
export function getModelList(p: ProviderId): string[] {
  const v = lsGet<unknown>(kModels(p), []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function setModelList(p: ProviderId, models: string[]): void {
  lsSet(kModels(p), models);
}

/** Bir sağlayıcı için çağrıya hazır ayar */
export function resolveConfig(p: ProviderId = getProvider()): ResolvedConfig {
  return { provider: p, key: getKey(p), model: getModel(p), baseUrl: p === 'custom' ? getBaseUrl() : '' };
}

export function status(): AiStatus {
  const cfg = resolveConfig();
  const def = providerDef(cfg.provider);
  return { configured: isConfigured(cfg), provider: def.id, providerLabel: def.label, model: cfg.model };
}
