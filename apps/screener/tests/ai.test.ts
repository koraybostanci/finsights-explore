import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildCompletionRequest,
  checkBaseUrl,
  cleanText,
  httpError,
  isConfigured,
  parseCompletion,
  PROVIDERS,
  THINKING_HEADROOM,
  tidyMessage,
} from '../src/ai/providers.ts';
import type { ProviderId, ResolvedConfig } from '../src/ai/providers.ts';
import { complete, testConnection } from '../src/ai/client.ts';
import type { FetchLike } from '../src/ai/client.ts';
import * as config from '../src/ai/config.ts';
import { CACHE_MAX, cacheGet, cacheKey, cachePut, cacheSize, hash } from '../src/ai/cache.ts';
import { industryPrompt, PROMPT_VERSION, smaFigures, stockPrompt } from '../src/ai/prompts.ts';
import { AiError, aiErrorMessage, aiStatus, aiTextHtml, commentStock, compareIndustry } from '../src/ai/index.ts';
import { on, setData, toView } from '../src/data/store.ts';
import { DEF, evaluate } from '../src/lib/evaluate.ts';
import { industryMedian } from '../src/lib/stats.ts';
import type { MarketData, StockView } from '../src/types.ts';

/* ---------- Shared setup ---------- */

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

const DATA = JSON.parse(readFileSync(new URL('./fixtures/market.json', import.meta.url), 'utf8')) as MarketData;
const views: StockView[] = DATA.stocks.map((s) => toView(s, DATA.industries));
const view = (k: string): StockView => {
  const v = views.find((s) => s.symbol === k);
  assert.ok(v, `${k} is not in the data`);
  return v;
};

const KEY = 'sk-test-SECRET-123';
const cfg = (provider: ProviderId, extra: Partial<ResolvedConfig> = {}): ResolvedConfig => ({
  provider,
  key: KEY,
  model: 'model-x',
  baseUrl: '',
  ...extra,
});
const REQ = { system: 'SİSTEM', user: 'KULLANICI', maxTokens: 500 };

interface Call {
  url: string;
  init: RequestInit;
}
function mockFetch(respond: (call: Call) => Response | Promise<Response>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      const call = { url, init };
      calls.push(call);
      return respond(call);
    },
  };
}
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ANTHROPIC_OK = {
  id: 'msg_01',
  type: 'message',
  role: 'assistant',
  model: 'model-x',
  content: [
    { type: 'thinking', thinking: 'iç düşünce', signature: 'abc' },
    { type: 'text', text: 'Birinci paragraf.' },
    { type: 'text', text: '\n\nİkinci paragraf.' },
  ],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 20 },
};
const OPENAI_OK = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  model: 'model-x',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Merhaba dünya', refusal: null }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
};
const GEMINI_OK = {
  candidates: [
    {
      content: { role: 'model', parts: [{ text: 'düşünce', thought: true }, { text: 'Merhaba ' }, { text: 'Gemini' }] },
      finishReason: 'STOP',
      index: 0,
    },
  ],
  usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, thoughtsTokenCount: 9 },
};

beforeEach(() => {
  store.clear();
  setData(DATA);
});

/* ---------- Building requests ---------- */

test('Claude request: URL, headers and body', () => {
  const r = buildCompletionRequest(cfg('anthropic'), REQ);
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.method, 'POST');
  assert.deepEqual(r.headers, {
    'content-type': 'application/json',
    'x-api-key': KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  });
  assert.deepEqual(JSON.parse(r.body!), {
    model: 'model-x',
    max_tokens: 500 + THINKING_HEADROOM,
    messages: [{ role: 'user', content: 'KULLANICI' }],
    system: 'SİSTEM',
  });
});

test('OpenAI request: Bearer header, max_completion_tokens', () => {
  const r = buildCompletionRequest(cfg('openai'), REQ);
  assert.equal(r.url, 'https://api.openai.com/v1/chat/completions');
  assert.deepEqual(r.headers, { 'content-type': 'application/json', Authorization: `Bearer ${KEY}` });
  assert.deepEqual(JSON.parse(r.body!), {
    model: 'model-x',
    messages: [
      { role: 'system', content: 'SİSTEM' },
      { role: 'user', content: 'KULLANICI' },
    ],
    max_completion_tokens: 500 + THINKING_HEADROOM,
  });
});

test('Gemini request: key in the header, not the URL; native API body', () => {
  const r = buildCompletionRequest(cfg('gemini', { model: 'models/gemini-x' }), REQ);
  assert.equal(r.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
  assert.deepEqual(r.headers, { 'content-type': 'application/json', 'x-goog-api-key': KEY });
  assert.deepEqual(JSON.parse(r.body!), {
    contents: [{ role: 'user', parts: [{ text: 'KULLANICI' }] }],
    generationConfig: { maxOutputTokens: 500 + THINKING_HEADROOM },
    systemInstruction: { parts: [{ text: 'SİSTEM' }] },
  });
});

test('Custom endpoint request: the base URL is normalized; without a key no Authorization is sent', () => {
  const r = buildCompletionRequest(cfg('custom', { baseUrl: 'http://localhost:11434/v1/', key: '' }), REQ);
  assert.equal(r.url, 'http://localhost:11434/v1/chat/completions');
  assert.deepEqual(r.headers, { 'content-type': 'application/json' });
  const withKey = buildCompletionRequest(cfg('custom', { baseUrl: 'https://llm.ornek.com/v1/chat/completions' }), REQ);
  assert.equal(withKey.url, 'https://llm.ornek.com/v1/chat/completions');
  assert.equal(withKey.headers.Authorization, `Bearer ${KEY}`);
  assert.throws(
    () => buildCompletionRequest(cfg('custom', { baseUrl: 'http://ornek.com/v1' }), REQ),
    (e: unknown) => e instanceof AiError && e.code === 'not_configured',
  );
});

test('an empty system prompt is not written to the body', () => {
  const empty = { system: '', user: 'u', maxTokens: 10 };
  assert.equal('system' in JSON.parse(buildCompletionRequest(cfg('anthropic'), empty).body!), false);
  assert.equal('systemInstruction' in JSON.parse(buildCompletionRequest(cfg('gemini'), empty).body!), false);
  assert.deepEqual(JSON.parse(buildCompletionRequest(cfg('openai'), empty).body!).messages, [{ role: 'user', content: 'u' }]);
});

test('the key is never written to the URL or the body for any provider', () => {
  for (const p of PROVIDERS) {
    const c = cfg(p.id, { baseUrl: 'https://llm.ornek.com/v1' });
    const r = buildCompletionRequest(c, REQ);
    assert.equal(r.url.includes(KEY), false, `${p.id}: key in the URL`);
    assert.equal((r.body ?? '').includes(KEY), false, `${p.id}: key in the body`);
    assert.ok(Object.values(r.headers).some((v) => v.includes(KEY)), `${p.id}: key should be in a header`);
  }
});

test('checkBaseUrl: https is required, http only for local addresses', () => {
  assert.deepEqual(checkBaseUrl(' https://a.b/v1/ '), { ok: true, url: 'https://a.b/v1' });
  assert.deepEqual(checkBaseUrl('http://localhost:1234/v1'), { ok: true, url: 'http://localhost:1234/v1' });
  assert.deepEqual(checkBaseUrl('http://127.0.0.1:8080'), { ok: true, url: 'http://127.0.0.1:8080' });
  assert.equal(checkBaseUrl('http://ornek.com/v1').ok, false);
  assert.equal(checkBaseUrl('ftp://ornek.com').ok, false);
  assert.equal(checkBaseUrl('https://kullanici:parola@ornek.com/v1').ok, false);
  assert.equal(checkBaseUrl('https://ornek.com/v1?key=abc').ok, false);
  assert.equal(checkBaseUrl('adres değil').ok, false);
  assert.equal(checkBaseUrl('').ok, false);
});

test('isConfigured: key and model; a valid URL for the custom endpoint', () => {
  assert.equal(isConfigured(cfg('anthropic')), true);
  assert.equal(isConfigured(cfg('anthropic', { key: '' })), false);
  assert.equal(isConfigured(cfg('anthropic', { model: ' ' })), false);
  assert.equal(isConfigured(cfg('custom', { key: '', baseUrl: 'http://localhost:11434/v1' })), true);
  assert.equal(isConfigured(cfg('custom', { key: '', baseUrl: '' })), false);
});

/* ---------- Parsing responses ---------- */

test('parseCompletion: Claude joins only the text blocks', () => {
  assert.deepEqual(parseCompletion('anthropic', ANTHROPIC_OK), {
    text: 'Birinci paragraf.\n\nİkinci paragraf.',
    truncated: false,
  });
  assert.equal(parseCompletion('anthropic', { ...ANTHROPIC_OK, stop_reason: 'max_tokens' }).truncated, true);
  assert.throws(
    () => parseCompletion('anthropic', { content: [], stop_reason: 'refusal' }),
    (e: unknown) => e instanceof AiError && e.code === 'bad_response',
  );
  assert.throws(() => parseCompletion('anthropic', { type: 'message' }), AiError);
});

test('parseCompletion: OpenAI shape (plain text and an array of parts)', () => {
  assert.deepEqual(parseCompletion('openai', OPENAI_OK), { text: 'Merhaba dünya', truncated: false });
  const parts = {
    choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }, finish_reason: 'length' }],
  };
  assert.deepEqual(parseCompletion('openai', parts), { text: 'ab', truncated: true });
  assert.throws(
    () => parseCompletion('openai', { choices: [{ message: { content: null, refusal: 'Üzgünüm' }, finish_reason: 'stop' }] }),
    (e: unknown) => e instanceof AiError && e.code === 'bad_response',
  );
  assert.throws(() => parseCompletion('openai', { choices: [] }), AiError);
});

test('parseCompletion: Gemini drops thought parts and reports a block', () => {
  assert.deepEqual(parseCompletion('gemini', GEMINI_OK), { text: 'Merhaba Gemini', truncated: false });
  assert.throws(
    () => parseCompletion('gemini', { promptFeedback: { blockReason: 'SAFETY' } }),
    (e: unknown) => e instanceof AiError && e.code === 'bad_response' && e.message.includes('SAFETY'),
  );
  assert.throws(
    () => parseCompletion('gemini', { candidates: [{ finishReason: 'SAFETY' }] }),
    (e: unknown) => e instanceof AiError && e.code === 'bad_response',
  );
  assert.equal(parseCompletion('gemini', { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }).truncated, true);
});

/* ---------- Error mapping ---------- */

test('httpError: status codes map to AiError codes', () => {
  const anth401 = JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  const e401 = httpError('anthropic', 401, anth401);
  assert.equal(e401.code, 'auth');
  assert.match(e401.message, /invalid x-api-key/);
  assert.equal(httpError('anthropic', 403, '{"type":"error","error":{"type":"permission_error","message":"no"}}').code, 'auth');

  const oa429 = JSON.stringify({ error: { message: 'You exceeded your current quota', type: 'insufficient_quota', code: 'insufficient_quota' } });
  assert.equal(httpError('openai', 429, oa429).code, 'rate_limit');

  const gem400 = JSON.stringify({
    error: {
      code: 400,
      message: 'API key not valid. Please pass a valid API key.',
      status: 'INVALID_ARGUMENT',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }],
    },
  });
  assert.equal(httpError('gemini', 400, gem400).code, 'auth');
  const gemOther = JSON.stringify({ error: { code: 400, message: 'Invalid JSON payload', status: 'INVALID_ARGUMENT' } });
  assert.equal(httpError('gemini', 400, gemOther).code, 'provider');

  const e404 = httpError('openai', 404, JSON.stringify({ error: { message: 'model not found' } }));
  assert.equal(e404.code, 'provider');
  assert.match(e404.message, /model not found \(HTTP 404\)/);
  assert.match(e404.message, /Model adını ve adresi kontrol edin/);

  const e500 = httpError('openai', 500, '<html><body>Bad gateway</body></html>');
  assert.equal(e500.code, 'provider');
  assert.equal(e500.message, 'HTTP 500');
  assert.equal(httpError('anthropic', 529, '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}').code, 'provider');
});

test('an error message keeps no key or HTML marks, and a long message is truncated', () => {
  const body = JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}. <script>alert(1)</script>` } });
  const e = httpError('openai', 401, body, KEY);
  assert.equal(e.message.includes(KEY), false);
  assert.equal(/[<>]/.test(e.message), false);
  assert.ok(tidyMessage('x'.repeat(500)).length <= 220);
});

/* ---------- complete(): with a fake fetch ---------- */

test('complete: Claude success response and the request sent', async () => {
  const m = mockFetch(() => json(ANTHROPIC_OK));
  const text = await complete(REQ, { fetch: m.fetch, config: cfg('anthropic') });
  assert.equal(text, 'Birinci paragraf.\n\nİkinci paragraf.');
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(m.calls[0].init.method, 'POST');
  assert.equal((m.calls[0].init.headers as Record<string, string>)['x-api-key'], KEY);
  assert.equal(m.calls[0].init.credentials, 'omit');
  assert.ok(m.calls[0].init.signal instanceof AbortSignal);
});

test('complete: OpenAI and Gemini success responses', async () => {
  assert.equal(await complete(REQ, { fetch: mockFetch(() => json(OPENAI_OK)).fetch, config: cfg('openai') }), 'Merhaba dünya');
  assert.equal(await complete(REQ, { fetch: mockFetch(() => json(GEMINI_OK)).fetch, config: cfg('gemini') }), 'Merhaba Gemini');
});

const rejects = async (p: Promise<unknown>, code: string, pattern?: RegExp): Promise<void> => {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof AiError, 'AiError expected');
    assert.equal(e.code, code);
    if (pattern) assert.match(aiErrorMessage(e), pattern);
    assert.equal(aiErrorMessage(e).includes(KEY), false, 'the message must not contain the key');
    return true;
  });
};

test('complete: 401 maps to auth, 429 to rate_limit, 500 to provider', async () => {
  const body = { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } };
  await rejects(complete(REQ, { fetch: mockFetch(() => json(body, 401)).fetch, config: cfg('anthropic') }), 'auth', /anahtarı kabul etmedi/);
  await rejects(
    complete(REQ, { fetch: mockFetch(() => json({ error: { message: 'Rate limit reached' } }, 429)).fetch, config: cfg('openai') }),
    'rate_limit',
    /kota ya da hız sınırı/,
  );
  await rejects(
    complete(REQ, { fetch: mockFetch(() => json({ error: { message: 'boom' } }, 500)).fetch, config: cfg('openai') }),
    'provider',
    /boom \(HTTP 500\)/,
  );
});

test('complete: fetch TypeError maps to network; the message mentions the CORS possibility', async () => {
  const failing: FetchLike = async () => {
    throw new TypeError('Failed to fetch');
  };
  await rejects(complete(REQ, { fetch: failing, config: cfg('anthropic') }), 'network', /CORS/);
  await rejects(
    complete(REQ, { fetch: failing, config: cfg('custom', { baseUrl: 'https://llm.ornek.com/v1' }) }),
    'network',
    /Özel adresin tarayıcıdan çağrıya \(CORS\) izin verdiğinden emin olun/,
  );
});

test('complete: a timeout aborts through AbortController and maps to network', async () => {
  const hanging: FetchLike = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  await rejects(complete(REQ, { fetch: hanging, config: cfg('openai'), timeoutMs: 20 }), 'network', /zaman aşımı/);
});

test('complete: an unparseable or empty response maps to bad_response', async () => {
  const html = mockFetch(() => new Response('<html>ok</html>', { status: 200 }));
  await rejects(complete(REQ, { fetch: html.fetch, config: cfg('openai') }), 'bad_response');
  const empty = mockFetch(() => json({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }));
  await rejects(complete(REQ, { fetch: empty.fetch, config: cfg('openai') }), 'bad_response', /çıktı sınırına/);
  const shape = mockFetch(() => json({ hello: 'world' }));
  await rejects(complete(REQ, { fetch: shape.fetch, config: cfg('anthropic') }), 'bad_response');
});

test('complete: without configuration no request is sent and not_configured is thrown', async () => {
  const m = mockFetch(() => json(OPENAI_OK));
  await rejects(complete(REQ, { fetch: m.fetch, config: cfg('openai', { key: '' }) }), 'not_configured', /Ayarlar sekmesinden/);
  await rejects(complete(REQ, { fetch: m.fetch, config: cfg('openai', { model: '' }) }), 'not_configured');
  assert.equal(m.calls.length, 0);
});

test('testConnection: a 2xx response with empty text also succeeds; 401 fails', async () => {
  const empty = mockFetch(() => json({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }));
  await testConnection({ fetch: empty.fetch, config: cfg('openai') });
  assert.equal(JSON.parse(String(empty.calls[0].init.body)).max_completion_tokens, 16 + THINKING_HEADROOM);
  await rejects(testConnection({ fetch: mockFetch(() => json({ error: { message: 'no' } }, 401)).fetch, config: cfg('openai') }), 'auth');
});

/* ---------- Settings storage ---------- */

test('settings are stored per provider and every change emits an "ai" event', () => {
  let events = 0;
  const off = on('ai', () => events++);
  assert.deepEqual(aiStatus(), { configured: false, provider: 'anthropic', providerLabel: 'Claude', model: 'claude-haiku-4-5-20251001' });

  config.setKey('anthropic', '  k-claude  ');
  config.setModel('anthropic', 'claude-x');
  config.setKey('openai', 'k-openai');
  config.setModel('openai', 'gpt-x');
  assert.equal(events, 4);
  assert.deepEqual(aiStatus(), { configured: true, provider: 'anthropic', providerLabel: 'Claude', model: 'claude-x' });

  config.setProvider('openai');
  assert.deepEqual(aiStatus(), { configured: true, provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-x' });
  assert.equal(config.getKey('anthropic'), 'k-claude');

  config.setProvider('custom');
  assert.equal(aiStatus().configured, false);
  config.setBaseUrl('http://localhost:11434/v1');
  config.setModel('custom', 'llama');
  assert.deepEqual(aiStatus(), { configured: true, provider: 'custom', providerLabel: 'Özel adres', model: 'llama' });

  config.setProvider('openai');
  config.clearKey('openai');
  assert.equal(config.getKey('openai'), '');
  assert.equal(config.getModel('openai'), 'gpt-x', 'the model name is remembered');
  assert.equal(aiStatus().configured, false);
  off();

  // The store holds only keys with the "fintools.screener." prefix
  assert.ok([...store.keys()].every((k) => k.startsWith('fintools.screener.ai.')));
});

test('the model defaults to the provider default until the user types one', () => {
  store.clear();
  for (const p of PROVIDERS) assert.equal(config.getModel(p.id), p.defaultModel);
  assert.notEqual(config.getModel('anthropic'), '');
  assert.equal(config.getModel('custom'), '', 'the custom endpoint has no default model');
  config.setModel('openai', 'gpt-x');
  assert.equal(config.getModel('openai'), 'gpt-x');
  config.setModel('openai', '  ');
  assert.equal(config.getModel('openai'), PROVIDERS.find((p) => p.id === 'openai')!.defaultModel);
  assert.equal(config.getModel('gemini'), PROVIDERS.find((p) => p.id === 'gemini')!.defaultModel);
  store.clear();
});

test('a stored provider that no longer exists (opencode) or is unknown falls back to the default provider', () => {
  store.clear();
  for (const stale of ['"opencode"', '"yok"', '42', 'null']) {
    store.set('fintools.screener.ai.provider', stale);
    store.set('fintools.screener.ai.key.opencode', '"k"');
    store.set('fintools.screener.ai.models.opencode', '["a","b"]');
    assert.equal(config.getProvider(), 'anthropic');
    assert.equal(config.resolveConfig().provider, 'anthropic');
    assert.equal(aiStatus().provider, 'anthropic');
  }
  store.clear();
});

test('a corrupt stored value falls back to the default', () => {
  store.set('fintools.screener.ai.provider', '"yok-boyle-saglayici"');
  store.set('fintools.screener.ai.key.anthropic', '{"a":1}');
  assert.equal(config.getProvider(), 'anthropic');
  assert.equal(config.getKey('anthropic'), '');
});

/* ---------- Cache ---------- */

test('cacheKey: kind, market, id, data date, provider, model, version and prompt digest', () => {
  const parts = { kind: 'stock', id: 'THYAO', market: 'BIST', asOf: '2026-10-02', provider: 'anthropic', model: 'm', version: 1 };
  assert.equal(cacheKey(parts), 'stock|BIST|THYAO|2026-10-02|anthropic|m|v1');
  const a = cacheKey({ ...parts, prompt: 'eşik 30' });
  const b = cacheKey({ ...parts, prompt: 'eşik 25' });
  assert.notEqual(a, b);
  assert.equal(a, cacheKey({ ...parts, prompt: 'eşik 30' }));
  assert.notEqual(cacheKey({ ...parts, market: 'US' }), cacheKey(parts));
  assert.notEqual(cacheKey({ ...parts, asOf: '2026-10-03' }), cacheKey(parts));
  assert.notEqual(cacheKey({ ...parts, model: 'n' }), cacheKey(parts));
  assert.notEqual(cacheKey({ ...parts, version: 2 }), cacheKey(parts));
  assert.equal(hash('abc'), hash('abc'));
});

test('the cache keeps at most CACHE_MAX entries and drops the oldest', () => {
  for (let i = 0; i < CACHE_MAX + 5; i++)
    cachePut({ key: `k${i}`, text: `t${i}`, providerLabel: 'P', model: 'm', createdAt: '2026-10-02T00:00:00Z' });
  assert.equal(cacheSize(), CACHE_MAX);
  assert.equal(cacheGet('k0'), null);
  assert.equal(cacheGet('k4'), null);
  assert.equal(cacheGet('k5')?.text, 't5');
  assert.equal(cacheGet(`k${CACHE_MAX + 4}`)?.text, `t${CACHE_MAX + 4}`);
  // Writing the same key again does not duplicate the entry and makes it the newest
  cachePut({ key: 'k5', text: 'yeni', providerLabel: 'P', model: 'm', createdAt: '2026-10-02T00:00:00Z' });
  assert.equal(cacheSize(), CACHE_MAX);
  assert.equal(cacheGet('k5')?.text, 'yeni');
});

/* ---------- Prompts ---------- */

const stockInput = (k: string) => {
  const stock = view(k);
  const peers = views.filter((s) => s.market === stock.market && s.industry === stock.industry);
  return { stock, evaluation: evaluate(stock, DEF), median: industryMedian(peers), prices: null };
};

test('stockPrompt: the data figures, rule results, median, terms and rules', () => {
  const p = stockPrompt(stockInput('THYAO'), { asOf: DATA.asOf });
  assert.match(p.system, /Yalnızca sana verilen verideki sayıları kullan/);
  assert.match(p.system, /Al, sat, tut/);
  assert.match(p.system, /110–170 kelime/);
  assert.match(p.system, /markdown/);
  assert.match(p.system, /BIST ve ABD hisselerini birbiriyle kıyaslama/);
  assert.doesNotMatch(p.system, /hikâye|matchingStories/);
  assert.match(p.user, /F\/K = P\/E/);
  assert.match(p.user, /Net borç\/FAVÖK = Net debt\/EBITDA/);

  const payload = JSON.parse(p.user.slice(p.user.indexOf('Veri (JSON):') + 'Veri (JSON):'.length));
  assert.equal(payload.dataDate, DATA.asOf);
  assert.equal(payload.market, 'BIST');
  assert.equal(payload.currency, 'TRY');
  assert.equal(payload.stock.symbol, 'THYAO');
  assert.equal(payload.stock.pe, 3.6);
  assert.equal(payload.stock.pb, 0.4);
  assert.equal(payload.stock.netDebtEbitda, 4.25);
  assert.equal(payload.stock.cyclical, true);
  assert.equal(payload.stock.functionalCurrency, 'USD');
  assert.equal(payload.ruleResult.result, 'Elendi');
  assert.ok(payload.ruleResult.checks.some((c: { check: string; status: string }) => c.check === 'Borç' && c.status === 'kaldı'));
  assert.equal(payload.industryMedian.stocksInMedian, 2);
  assert.equal(payload.movingAverages, null);
  assert.equal('matchingStories' in payload, false);
  assert.deepEqual(Object.keys(payload), ['dataDate', 'market', 'currency', 'stock', 'ruleResult', 'industryMedian', 'movingAverages']);
  // The prompt text refers to the keys in the data by name
  assert.match(p.user, /industryMedian ya da movingAverages null ise/);
});

test('smaFigures: averages from the data or computed from the price series', () => {
  const base = stockInput('BIMAS');
  assert.equal(smaFigures(base), null);
  const stored = smaFigures({ ...base, stock: { ...base.stock, price: 120, sma20: 118, sma50: 110, sma200: 100 } });
  assert.deepEqual(stored, {
    sma20: 118,
    sma50: 110,
    sma200: 100,
    priceDistanceFromSma50Pct: 9.1,
    priceDistanceFromSma200Pct: 20,
    trend: 'yukarı (fiyat > SMA 50 > SMA 200)',
  });
  const c = Array.from({ length: 260 }, (_, i) => 100 + i);
  const fromPrices = smaFigures({
    ...base,
    stock: { ...base.stock, price: 359 },
    prices: { symbol: 'BIMAS', market: 'BIST', currency: 'TRY', dates: c.map((_, i) => `g${i}`), closes: c },
  });
  assert.equal(fromPrices?.sma20, 349.5);
  assert.equal(fromPrices?.sma200, 259.5);
  assert.equal(fromPrices?.crossLast60Days, 'yok');
});

test('industryPrompt: a single market, stocks with no data in a separate list', () => {
  const rowsOf = (market: 'BIST' | 'US') =>
    views.filter((s) => s.market === market && s.industry === 'airlines').map((stock) => ({ stock, evaluation: evaluate(stock, DEF) }));
  const bist = rowsOf('BIST');
  // Even if US rows get mixed in by mistake, they do not enter the prompt
  const p = industryPrompt(
    { market: 'BIST', industry: DATA.industries.airlines, rows: [...bist, ...rowsOf('US')], median: industryMedian(bist.map((r) => r.stock)) },
    { asOf: DATA.asOf },
  );
  assert.match(p.system, /130–200 kelime/);
  assert.doesNotMatch(p.system, /hikâye|matchingStories/);
  const payload = JSON.parse(p.user.slice(p.user.indexOf('Veri (JSON):') + 'Veri (JSON):'.length));
  assert.deepEqual(payload.stocks.map((h: { symbol: string }) => h.symbol).sort(), ['PGSUS', 'THYAO']);
  assert.deepEqual(payload.stocksWithoutData, []);
  assert.equal(p.user.includes('DAL'), false);
  assert.equal(payload.industry.cyclical, true);
  assert.match(p.user, /stocksWithoutData doluysa/);

  const us = rowsOf('US');
  const pu = industryPrompt(
    { market: 'US', industry: DATA.industries.airlines, rows: us, median: industryMedian(us.map((r) => r.stock)) },
    { asOf: DATA.asOf },
  );
  const pUs = JSON.parse(pu.user.slice(pu.user.indexOf('Veri (JSON):') + 'Veri (JSON):'.length));
  assert.deepEqual(pUs.stocks, []);
  assert.deepEqual(pUs.stocksWithoutData.sort(), ['DAL', 'LUV', 'UAL']);
  assert.equal(pUs.industryMedian, null);
  assert.equal(pUs.currency, 'USD');
});

/* ---------- Public functions ---------- */

function configureAnthropic(): void {
  config.setProvider('anthropic');
  config.setKey('anthropic', KEY);
  config.setModel('anthropic', 'claude-x');
}

test('commentStock: goes to the provider, writes to the cache, refreshes with force', async () => {
  configureAnthropic();
  let n = 0;
  const calls: Call[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    n++;
    return json({ ...ANTHROPIC_OK, content: [{ type: 'text', text: `**Yorum ${n}**\n\n\n- ikinci paragraf` }] });
  }) as typeof fetch;
  try {
    const input = stockInput('THYAO');
    const first = await commentStock(input);
    assert.equal(first.text, 'Yorum 1\n\nikinci paragraf');
    assert.equal(first.cached, false);
    assert.equal(first.providerLabel, 'Claude');
    assert.equal(first.model, 'claude-x');
    assert.ok(!Number.isNaN(Date.parse(first.createdAt)));

    const again = await commentStock(input);
    assert.equal(again.cached, true);
    assert.equal(again.text, first.text);
    assert.equal(again.createdAt, first.createdAt);
    assert.equal(calls.length, 1);

    const forced = await commentStock(input, { force: true });
    assert.equal(forced.cached, false);
    assert.equal(forced.text, 'Yorum 2\n\nikinci paragraf');
    assert.equal(calls.length, 2);
    assert.equal((await commentStock(input)).text, forced.text);

    // Another stock, another model or another data date: the cache does not apply
    await commentStock(stockInput('BIMAS'));
    assert.equal(calls.length, 3);
    config.setModel('anthropic', 'claude-y');
    await commentStock(input);
    assert.equal(calls.length, 4);
    // Only the US data was refreshed: the BIST stock's comment stays cached
    setData({ ...DATA, asOf: '2026-10-05T23:45:00+03:00', asOfBy: { ...DATA.asOfBy, US: '2026-10-05T23:45:00+03:00' } });
    assert.equal((await commentStock(input)).cached, true);
    assert.equal(calls.length, 4);
    setData({ ...DATA, asOf: '2026-10-05T18:45:00+03:00', asOfBy: { ...DATA.asOfBy, BIST: '2026-10-05T18:45:00+03:00' } });
    await commentStock(input);
    assert.equal(calls.length, 5);
    // When a threshold changes, the evaluation changes, and with it the prompt and the cache key
    await commentStock({ ...input, evaluation: evaluate(input.stock, { ...DEF, maxNetDebtEbitda: 5 }) });
    assert.equal(calls.length, 6);

    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.model, 'claude-x');
    assert.match(body.messages[0].content, /THYAO/);
    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
    // The key does not enter the cache
    assert.equal((store.get('fintools.screener.ai.cache') ?? '').includes(KEY), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('commentStock: two simultaneous calls send a single request', async () => {
  configureAnthropic();
  let n = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    n++;
    await new Promise((r) => setTimeout(r, 10));
    return json(ANTHROPIC_OK);
  }) as typeof fetch;
  try {
    const input = stockInput('ASELS');
    const [a, b] = await Promise.all([commentStock(input), commentStock(input)]);
    assert.equal(n, 1);
    assert.equal(a.text, b.text);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('compareIndustry: the cache is per industry and market', async () => {
  configureAnthropic();
  let n = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    n++;
    return json(ANTHROPIC_OK);
  }) as typeof fetch;
  try {
    const make = (market: 'BIST' | 'US', ind: string) => {
      const rows = views.filter((s) => s.market === market && s.industry === ind).map((stock) => ({ stock, evaluation: evaluate(stock, DEF) }));
      return { market, industry: DATA.industries[ind], rows, median: industryMedian(rows.map((r) => r.stock)) };
    };
    const first = await compareIndustry(make('BIST', 'airlines'));
    assert.equal(first.cached, false);
    assert.equal((await compareIndustry(make('BIST', 'airlines'))).cached, true);
    assert.equal((await compareIndustry(make('US', 'airlines'))).cached, false);
    assert.equal((await compareIndustry(make('BIST', 'telecom'))).cached, false);
    assert.equal(n, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('commentStock and compareIndustry: not_configured without configuration', async () => {
  await rejects(commentStock(stockInput('THYAO')), 'not_configured', /Ayarlar sekmesinden/);
  const rows = [{ stock: view('THYAO'), evaluation: evaluate(view('THYAO'), DEF) }];
  await rejects(
    compareIndustry({ market: 'BIST', industry: DATA.industries.airlines, rows, median: industryMedian([view('THYAO')]) }),
    'not_configured',
  );
});

test('aiTextHtml escapes everything and splits into paragraphs', () => {
  assert.equal(
    aiTextHtml('Bir <b>iki</b>\nüç\n\n\n<img src=x onerror="alert(1)"> & \'son\''),
    '<p>Bir &lt;b&gt;iki&lt;/b&gt;<br>üç</p><p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;son&#39;</p>',
  );
  assert.equal(aiTextHtml('  \n\n '), '');
});

test('aiErrorMessage: a short Turkish message for every code', () => {
  assert.match(aiErrorMessage(new AiError('not_configured', '')), /ayarlanmadı/);
  assert.match(aiErrorMessage(new AiError('auth', 'invalid x-api-key (HTTP 401)')), /anahtarı kabul etmedi.*invalid x-api-key/);
  assert.match(aiErrorMessage(new AiError('rate_limit', '')), /kota ya da hız sınırı/);
  assert.match(aiErrorMessage(new AiError('network', '')), /ulaşılamadı.*CORS.*tarayıcıdan doğrudan çağrıya izin vermez/);
  assert.match(aiErrorMessage(new AiError('provider', 'boom (HTTP 500)')), /hata döndürdü.*boom/);
  assert.match(aiErrorMessage(new AiError('bad_response', '')), /beklenen biçimde değil/);
  assert.match(aiErrorMessage(new Error('iç ayrıntı')), /Beklenmeyen bir hata/);
  assert.equal(aiErrorMessage(new Error('iç ayrıntı')).includes('iç ayrıntı'), false);
  assert.match(aiErrorMessage('x'), /Beklenmeyen bir hata/);
});

/* ---------- Text helpers ---------- */
test('cleanText: markdown marks and extra whitespace are removed', () => {
  assert.equal(cleanText('## Başlık\r\n\r\n**Kalın** metin  \n\n\n\n* madde\n- madde 2'), 'Başlık\n\nKalın metin\n\nmadde\nmadde 2');
  assert.equal(cleanText('F/K 3,60 - düşük; PEG * yok'), 'F/K 3,60 - düşük; PEG * yok');
});

test('the prompt version is defined', () => {
  assert.equal(typeof PROMPT_VERSION, 'number');
});
