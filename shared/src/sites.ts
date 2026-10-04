/**
 * Public URLs of the two apps. Empty until each app has its own host;
 * while a URL is empty, siteLink() writes plain text instead of a link.
 */

import { esc } from './format.ts';

export const SITES = { learn: '', screener: '' };

export type SiteId = keyof typeof SITES;

/** A link to the other app, or the escaped text alone while its URL is unknown. */
export function siteLink(app: SiteId, text: string, sites: Record<SiteId, string> = SITES): string {
  const url = sites[app];
  return url ? `<a href="${esc(url)}">${esc(text)}</a>` : esc(text);
}
