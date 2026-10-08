import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SITES, siteLink, siblingLinkHtml } from '../src/sites.ts';

const NO_SITES = { learn: '', screener: '' };

test('SITES: both apps have an https URL without a trailing slash', () => {
  for (const url of Object.values(SITES)) assert.match(url, /^https:\/\/[^/\s]+$/);
});

test('siteLink: escaped plain text while the URL is empty, a link once it is set', () => {
  assert.equal(siteLink('screener', 'Tarayıcı <yeni>', NO_SITES), 'Tarayıcı &lt;yeni&gt;');
  const sites = { learn: '', screener: 'https://example.org/?a=1&b="2"' };
  assert.equal(
    siteLink('screener', 'Tarayıcı & co', sites),
    '<a href="https://example.org/?a=1&amp;b=&quot;2&quot;">Tarayıcı &amp; co</a>',
  );
  assert.equal(siteLink('learn', 'Rehber', sites), 'Rehber');
});

test('siblingLinkHtml: nothing while the URL is empty, an escaped noopener link with an arrow once it is set', () => {
  assert.equal(siblingLinkHtml('screener', 'Hisse Tarayıcı', NO_SITES), '');
  const sites = { learn: '', screener: 'https://example.org/?a=1&b="2"' };
  assert.equal(
    siblingLinkHtml('screener', 'Tarayıcı <x>', sites),
    '<a href="https://example.org/?a=1&amp;b=&quot;2&quot;" rel="noopener">Tarayıcı &lt;x&gt; →</a>',
  );
  assert.equal(siblingLinkHtml('learn', 'Rehber', sites), '');
});
