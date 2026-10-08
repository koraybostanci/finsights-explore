/** Freshness of the hand-written stock comments (Stock.note). */

/** Day part of an ISO date or datetime (YYYY-MM-DD) */
const day = (iso: string): string => iso.slice(0, 10);

/**
 * Is the comment still valid against the data of the day it was written? If the
 * data belongs to a later day the figures have moved and the comment may contradict
 * them, so it is not shown. A comment with no date counts as current.
 */
export function noteIsCurrent(noteAsOf: string | undefined, dataAsOf: string | undefined): boolean {
  if (!noteAsOf || !dataAsOf) return true;
  return day(dataAsOf) <= day(noteAsOf);
}
