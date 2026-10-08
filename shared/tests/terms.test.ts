import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TERMS, term, termText } from '../src/terms.ts';

test('terms: terms render and the original ids are still present', () => {
  for (const id of ['pe', 'pb', 'evEbitda', 'peg', 'netDebtEbitda', 'ebitdaGrowth', 'netIncomeGrowth', 'roe', 'marketCap', 'price', 'target', 'ebitda', 'netIncome', 'equity', 'netDebt', 'median', 'industry', 'market', 'cyclical', 'watchlist', 'sma', 'sma20', 'sma50', 'sma200', 'goldenCross', 'deathCross', 'trend', 'npl', 'car', 'nim', 'apiKey', 'aiProvider'])
    assert.ok(TERMS[id], `id was removed: ${id}`);
  assert.equal(term('pe'), 'F/K <span class="en">(P/E)</span>');
  assert.equal(termText('pe'), 'F/K (P/E)');
  assert.equal(term('peg'), 'PEG');
  assert.equal(termText('earningsYield'), 'Kazanç verimi (Earnings yield)');
  assert.equal(termText('goldenCross'), 'Altın kesişim (Golden cross)');
  assert.throws(() => term('no-such-term'));
});
