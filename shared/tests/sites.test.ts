import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SITES, siteLink } from '../src/sites.ts';

test('siteLink: adres boşken kaçırılmış düz metin, doluyken bağlantı', () => {
  assert.deepEqual(SITES, { learn: '', screener: '' });
  assert.equal(siteLink('screener', 'Tarayıcı <yeni>'), 'Tarayıcı &lt;yeni&gt;');
  const sites = { learn: '', screener: 'https://example.org/?a=1&b="2"' };
  assert.equal(
    siteLink('screener', 'Tarayıcı & co', sites),
    '<a href="https://example.org/?a=1&amp;b=&quot;2&quot;">Tarayıcı &amp; co</a>',
  );
  assert.equal(siteLink('learn', 'Rehber', sites), 'Rehber');
});
