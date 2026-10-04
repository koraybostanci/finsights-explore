/** Elle yazılmış hisse yorumlarının (Stock.not) güncelliği. */

/** ISO tarih ya da tarih-saatin gün kısmı (YYYY-AA-GG) */
const day = (iso: string): string => iso.slice(0, 10);

/**
 * Yorum, yazıldığı günün verisiyle hâlâ geçerli mi? Veri yorumdan sonraki bir
 * güne aitse rakamlar değişmiştir ve yorum onlarla çelişebilir; o zaman gösterilmez.
 * Yorumun tarihi yoksa geçerli sayılır.
 */
export function noteIsCurrent(notAsOf: string | undefined, dataAsOf: string | undefined): boolean {
  if (!notAsOf || !dataAsOf) return true;
  return day(dataAsOf) <= day(notAsOf);
}
