/**
 * Public URLs of the two apps. Each app is deployed on its own host. While a URL is empty,
 * siteLink() writes plain text instead of a link.
 */

import { esc } from './format.ts';

export const SITES = {
  learn: 'https://fintools-learn.bostanci-koray.workers.dev',
  screener: 'https://fintools-screener.bostanci-koray.workers.dev',
};

export type SiteId = keyof typeof SITES;

/** A link to the other app, or the escaped text alone while its URL is unknown. */
export function siteLink(app: SiteId, text: string, sites: Record<SiteId, string> = SITES): string {
  const url = sites[app];
  return url ? `<a href="${esc(url)}">${esc(text)}</a>` : esc(text);
}

/** Link to the other app for the header ("Name →"), or '' while its URL is unknown. */
export function siblingLinkHtml(app: SiteId, text: string, sites: Record<SiteId, string> = SITES): string {
  const url = sites[app];
  return url ? `<a href="${esc(url)}" rel="noopener">${esc(text)} →</a>` : '';
}

/** Fills the header's `#sibling` element and shows it; with no URL it stays hidden and empty. */
export function mountSiblingLink(app: SiteId, text: string, sites: Record<SiteId, string> = SITES): void {
  const el = document.getElementById('sibling');
  const html = siblingLinkHtml(app, text, sites);
  if (!el || !html) return;
  el.innerHTML = html;
  el.hidden = false;
}
