import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nf, pct, esc, money } from '../src/format.ts';

test('nf ve pct Türkçe yazımla biçimlendirir', () => {
  assert.equal(nf(1234.5), '1.234,50');
  assert.equal(nf(null), '–');
  assert.equal(nf(3.6, 1), '3,6');
  assert.equal(pct(9), '+%9');
  assert.equal(pct(-22), '%-22');
  assert.equal(pct(null), '–');
  assert.equal(money(291, 'TRY'), '291,00 TL');
  assert.equal(money(12.5, 'USD'), '12,50 USD');
});

test('esc HTML özel karakterlerini kaçırır', () => {
  assert.equal(esc(`<a href="x">T&'s</a>`), '&lt;a href=&quot;x&quot;&gt;T&amp;&#39;s&lt;/a&gt;');
});
