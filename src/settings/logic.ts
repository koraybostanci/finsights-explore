/**
 * Hisselerim (watchlist) için saf yardımcılar: Türkçe'ye duyarlı arama ve
 * liste işlemleri. DOM'a dokunmaz; tests/settings.test.ts sınar.
 */

import type { StockView } from '../types.ts';

/**
 * Aramada harf farklarını yok sayar: büyük/küçük harf Türkçe kurala göre
 * çevrilir (I → ı, İ → i), sonra noktalı/noktasız i ile ş, ğ, ü, ö, ç
 * yalın karşılıklarına indirilir. Böylece "isctr", "ISCTR", "turk" ve "Türk" eşleşir.
 */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Düşük sayı daha iyi eşleşme; eşleşme yoksa -1. */
export function matchRank(s: { k: string; ad: string }, query: string): number {
  const q = fold(query);
  if (!q) return -1;
  const k = fold(s.k);
  const ad = fold(s.ad);
  const hay = `${k} ${ad}`;
  const tokens = q.split(' ');
  if (!tokens.every((t) => hay.includes(t))) return -1;
  if (k === q) return 0;
  if (k.startsWith(q)) return 1;
  if (ad.startsWith(q)) return 2;
  if (ad.split(' ').some((w) => w.startsWith(tokens[0]))) return 3;
  if (k.includes(q)) return 4;
  return 5;
}

/**
 * Bir piyasanın evreninde sembol ya da şirket adına göre arar. En iyi eşleşme
 * başta; eşitlikte sembol sırası. Boş sorguda sonuç dönmez.
 */
export function searchUniverse(universe: StockView[], query: string, limit = 8): StockView[] {
  return universe
    .map((s) => ({ s, r: matchRank(s, query) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.s.k.localeCompare(b.s.k, 'tr'))
    .slice(0, limit)
    .map((x) => x.s);
}

/** Sembolü listeye ekler (yoksa); sıra korunur. */
export const addTicker = (list: string[], k: string): string[] => (list.includes(k) ? list.slice() : [...list, k]);

/** Sembolü listeden çıkarır. */
export const removeTicker = (list: string[], k: string): string[] => list.filter((x) => x !== k);

/** Evrende olup listede olmayan hisseler (yeniden eklenebilecekler), sembol sırasıyla. */
export function notInList(universe: StockView[], list: string[]): StockView[] {
  const have = new Set(list);
  return universe.filter((s) => !have.has(s.k)).sort((a, b) => a.k.localeCompare(b.k, 'tr'));
}
