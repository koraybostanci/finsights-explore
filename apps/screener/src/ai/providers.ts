/**
 * Provider adapters: building requests, parsing responses, mapping errors.
 *
 * Everything here is a pure function; nothing uses fetch or storage. That way each
 * provider's URL, headers and body are tested in tests/ai.test.ts.
 * There are three API shapes: Anthropic (messages), Gemini (generateContent) and
 * OpenAI-compatible (chat/completions; OpenAI, OpenCode Go and the custom endpoint).
 *
 * The key is written only into a request header; it never enters a URL.
 */

import { AiError } from './types.ts';
import type { AiErrorCode } from './types.ts';

export type ProviderId = 'anthropic' | 'gemini' | 'openai' | 'opencode' | 'custom';
export type ApiShape = 'anthropic' | 'gemini' | 'openai';

export interface ProviderDef {
  id: ProviderId;
  /** Name shown on screen */
  label: string;
  /** Small text under the name */
  vendor: string;
  shape: ApiShape;
  /** Fixed base URL; empty for the custom endpoint (the user enters it) */
  baseUrl: string;
  /** Whether a key is required (local models do not need one) */
  keyRequired: boolean;
  /** Name of the output-limit field in the OpenAI shape */
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  /** Whether it is verified to allow direct calls from the browser (CORS) */
  corsVerified: boolean;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    label: 'Claude',
    vendor: 'Anthropic',
    shape: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyRequired: true,
    tokenParam: 'max_tokens',
    corsVerified: true,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    vendor: 'Google',
    shape: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyRequired: true,
    tokenParam: 'max_tokens',
    corsVerified: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    vendor: 'OpenAI',
    shape: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyRequired: true,
    tokenParam: 'max_completion_tokens',
    corsVerified: true,
  },
  {
    id: 'opencode',
    label: 'OpenCode Go',
    vendor: 'OpenCode',
    shape: 'openai',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    keyRequired: true,
    tokenParam: 'max_tokens',
    corsVerified: false,
  },
  {
    id: 'custom',
    label: 'Özel adres',
    vendor: 'OpenAI uyumlu uç nokta',
    shape: 'openai',
    baseUrl: '',
    keyRequired: false,
    tokenParam: 'max_tokens',
    corsVerified: false,
  },
];

export const DEFAULT_PROVIDER: ProviderId = 'anthropic';

export const isProviderId = (v: unknown): v is ProviderId =>
  typeof v === 'string' && PROVIDERS.some((p) => p.id === v);

export function providerDef(id: ProviderId): ProviderDef {
  const def = PROVIDERS.find((p) => p.id === id);
  if (!def) throw new Error(`Bilinmeyen sağlayıcı: ${id}`);
  return def;
}

/** Everything a call needs; read from storage and handed in here. */
export interface ResolvedConfig {
  provider: ProviderId;
  key: string;
  model: string;
  /** Used only by the custom endpoint */
  baseUrl: string;
}

export interface CompletionRequest {
  system: string;
  user: string;
  /** Budget for the visible response; the adapter adds headroom for reasoning models */
  maxTokens: number;
}

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}

/**
 * With reasoning models the thinking also counts against the output limit; if the limit
 * is tight the response comes back empty. The limit is a ceiling; the unused part is not billed.
 */
export const THINKING_HEADROOM = 3000;

/* ---------- Custom endpoint ---------- */

export type BaseUrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Custom URL check: must be https; http is accepted only for models on this computer
 * (localhost, 127.0.0.1). A trailing "/" and "/chat/completions" are stripped.
 */
export function checkBaseUrl(raw: string): BaseUrlCheck {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'Adres boş.' };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, reason: 'Adres geçerli değil. Örnek: https://ornek.com/v1' };
  }
  const host = u.hostname.toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local))
    return { ok: false, reason: 'Adres https ile başlamalı. http yalnızca localhost ya da 127.0.0.1 için kabul edilir.' };
  if (u.username || u.password) return { ok: false, reason: 'Adrese kullanıcı adı ya da parola yazmayın; anahtar ayrı alana girilir.' };
  if (u.search || u.hash) return { ok: false, reason: 'Adreste "?" ya da "#" bulunmamalı.' };
  let path = u.pathname.replace(/\/+$/, '');
  path = path.replace(/\/chat\/completions$/i, '');
  return { ok: true, url: `${u.protocol}//${u.host}${path}` };
}

/** The provider's base URL; throws a not_configured error when the custom URL is invalid. */
export function baseUrlOf(cfg: ResolvedConfig): string {
  const def = providerDef(cfg.provider);
  if (def.id !== 'custom') return def.baseUrl;
  const check = checkBaseUrl(cfg.baseUrl);
  if (!check.ok) throw new AiError('not_configured', check.reason);
  return check.url;
}

/** Whether the key and model (and, for a custom endpoint, the URL) are ready */
export function isConfigured(cfg: ResolvedConfig): boolean {
  const def = providerDef(cfg.provider);
  if (!cfg.model.trim()) return false;
  if (def.keyRequired && !cfg.key.trim()) return false;
  if (def.id === 'custom' && !checkBaseUrl(cfg.baseUrl).ok) return false;
  return true;
}

/* ---------- Building requests ---------- */

function authHeaders(def: ProviderDef, key: string): Record<string, string> {
  if (def.shape === 'anthropic')
    return {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // Anthropic requires this header for direct calls from the browser (CORS).
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  if (def.shape === 'gemini') return { 'x-goog-api-key': key };
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** Gemini model names come with a "models/…" prefix in the list; the request URL carries the prefix only once. */
const geminiModel = (model: string): string => model.trim().replace(/^models\//, '');

export function buildCompletionRequest(cfg: ResolvedConfig, req: CompletionRequest): HttpRequest {
  const def = providerDef(cfg.provider);
  const base = baseUrlOf(cfg);
  const key = cfg.key.trim();
  const model = cfg.model.trim();
  const headers = { 'content-type': 'application/json', ...authHeaders(def, key) };

  if (def.shape === 'anthropic') {
    // max_tokens is the combined ceiling for thinking and the response; headroom is added so the response is not cut off if a reasoning model is chosen.
    const body: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens + THINKING_HEADROOM,
      messages: [{ role: 'user', content: req.user }],
    };
    if (req.system) body.system = req.system;
    return { url: `${base}/messages`, method: 'POST', headers, body: JSON.stringify(body) };
  }

  if (def.shape === 'gemini') {
    const generationConfig: Record<string, unknown> = { maxOutputTokens: req.maxTokens + THINKING_HEADROOM };
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig,
    };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    return {
      url: `${base}/models/${encodeURIComponent(geminiModel(model))}:generateContent`,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: req.user });
  const body: Record<string, unknown> = { model, messages, [def.tokenParam]: req.maxTokens + THINKING_HEADROOM };
  return { url: `${base}/chat/completions`, method: 'POST', headers, body: JSON.stringify(body) };
}

export function buildModelsRequest(cfg: ResolvedConfig): HttpRequest {
  const def = providerDef(cfg.provider);
  const base = baseUrlOf(cfg);
  const headers = authHeaders(def, cfg.key.trim());
  const query = def.shape === 'anthropic' ? '?limit=1000' : def.shape === 'gemini' ? '?pageSize=1000' : '';
  return { url: `${base}/models${query}`, method: 'GET', headers };
}

/* ---------- Parsing responses ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export interface Completion {
  text: string;
  /** Whether the response was cut off at the output limit */
  truncated: boolean;
}

function bad(detail: string): AiError {
  return new AiError('bad_response', detail);
}

/** Extracts the plain text from a successful (2xx) provider response. */
export function parseCompletion(shape: ApiShape, json: unknown): Completion {
  if (!isObj(json)) throw bad('Yanıt bir JSON nesnesi değil.');

  if (shape === 'anthropic') {
    if (!Array.isArray(json.content)) throw bad('Yanıtta "content" alanı yok.');
    const text = json.content
      .filter((b): b is Obj => isObj(b) && b.type === 'text')
      .map((b) => str(b.text))
      .join('');
    if (!text.trim() && json.stop_reason === 'refusal') throw bad('Model bu isteği yanıtlamayı reddetti.');
    return { text, truncated: json.stop_reason === 'max_tokens' };
  }

  if (shape === 'gemini') {
    const cands = json.candidates;
    if (!Array.isArray(cands) || !cands.length) {
      const fb = isObj(json.promptFeedback) ? str(json.promptFeedback.blockReason) : '';
      throw bad(fb ? `Sağlayıcı isteği engelledi (${fb}).` : 'Yanıtta "candidates" alanı yok.');
    }
    const first = cands[0];
    if (!isObj(first)) throw bad('Yanıt beklenen biçimde değil.');
    const parts = isObj(first.content) && Array.isArray(first.content.parts) ? first.content.parts : [];
    const text = parts
      .filter((p): p is Obj => isObj(p) && p.thought !== true)
      .map((p) => str(p.text))
      .join('');
    const reason = str(first.finishReason);
    if (!text.trim() && reason && reason !== 'STOP' && reason !== 'MAX_TOKENS')
      throw bad(`Model yanıt üretmedi (${reason}).`);
    return { text, truncated: reason === 'MAX_TOKENS' };
  }

  const choices = json.choices;
  if (!Array.isArray(choices) || !choices.length || !isObj(choices[0])) throw bad('Yanıtta "choices" alanı yok.');
  const choice = choices[0];
  const msg = isObj(choice.message) ? choice.message : {};
  let text = '';
  if (typeof msg.content === 'string') text = msg.content;
  else if (Array.isArray(msg.content))
    text = msg.content
      .filter((p): p is Obj => isObj(p) && (p.type === 'text' || p.type === 'output_text'))
      .map((p) => str(p.text))
      .join('');
  if (!text.trim() && str(msg.refusal)) throw bad('Model bu isteği yanıtlamayı reddetti.');
  return { text, truncated: choice.finish_reason === 'length' };
}

/** OpenAI models unsuitable for chat (audio, image, embeddings, etc.); a rough filter. */
const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|sora|babbage|davinci|search|computer-use/i;

/** Extracts model ids from the model-list response (duplicates are dropped). */
export function parseModels(provider: ProviderId, json: unknown): string[] {
  const def = providerDef(provider);
  if (!isObj(json)) throw bad('Model listesi bir JSON nesnesi değil.');
  let ids: string[] = [];

  if (def.shape === 'gemini') {
    if (!Array.isArray(json.models)) throw bad('Model listesinde "models" alanı yok.');
    ids = json.models
      .filter((m): m is Obj => isObj(m))
      .filter((m) => !Array.isArray(m.supportedGenerationMethods) || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => str(m.name).replace(/^models\//, ''));
  } else {
    if (!Array.isArray(json.data)) throw bad('Model listesinde "data" alanı yok.');
    let rows = json.data.filter((m): m is Obj => isObj(m));
    if (provider === 'openai') {
      rows = rows
        .filter((m) => !NOT_CHAT.test(str(m.id)))
        .sort((a, b) => (typeof b.created === 'number' ? b.created : 0) - (typeof a.created === 'number' ? a.created : 0));
    }
    ids = rows.map((m) => str(m.id));
  }
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
}

/* ---------- Error mapping ---------- */

/** Makes a provider message displayable: masks the key if present, strips angle brackets, truncates. */
export function tidyMessage(raw: string, key = ''): string {
  let s = raw;
  const k = key.trim();
  if (k) s = s.split(k).join('•••');
  s = s
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 220 ? s.slice(0, 217).trimEnd() + '…' : s;
}

/** Finds the provider's message in an error body; recognizes the Anthropic, OpenAI and Gemini shapes. */
export function providerMessage(bodyText: string): { message: string; marker: string } {
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    return { message: bodyText.trim().startsWith('<') ? '' : bodyText, marker: '' };
  }
  if (Array.isArray(json)) json = json[0];
  if (!isObj(json)) return { message: '', marker: '' };
  const err = json.error;
  if (typeof err === 'string') return { message: err, marker: '' };
  if (isObj(err)) {
    const details = Array.isArray(err.details) ? err.details : [];
    const reason = details.map((d) => (isObj(d) ? str(d.reason) : '')).find(Boolean) ?? '';
    const marker = [str(err.type), str(err.code), str(err.status), reason].filter(Boolean).join(' ');
    return { message: str(err.message), marker };
  }
  return { message: str(json.message) || str(json.detail), marker: '' };
}

/** Turns a non-2xx HTTP response into an AiError. */
export function httpError(provider: ProviderId, status: number, bodyText: string, key = ''): AiError {
  const { message, marker } = providerMessage(bodyText);
  const detail = tidyMessage(message, key);
  let code: AiErrorCode = 'provider';
  if (status === 401 || status === 403) code = 'auth';
  else if (status === 429) code = 'rate_limit';
  // Gemini reports an invalid key with a 400 (API_KEY_INVALID).
  else if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(`${marker} ${message}`)) code = 'auth';
  const withStatus = detail ? `${detail} (HTTP ${status})` : `HTTP ${status}`;
  const hint =
    code === 'provider' && status === 404
      ? ' Model adını ve adresi kontrol edin.' +
        (provider === 'opencode' ? " OpenCode Go'da yalnızca chat/completions uç noktasını kullanan modeller çalışır." : '')
      : '';
  return new AiError(code, withStatus + hint);
}

/** Turns an error thrown by fetch (network, CORS, timeout) into an AiError. The browser's error text is not put in the message. */
export function networkError(provider: ProviderId, timedOut: boolean): AiError {
  if (timedOut) return new AiError('network', 'İstek zaman aşımına uğradı; biraz sonra yeniden deneyin.');
  const def = providerDef(provider);
  const extra = def.corsVerified
    ? ''
    : def.id === 'opencode'
      ? " OpenCode Go'nun tarayıcıdan çağrıya izin verdiği doğrulanmadı; engel büyük olasılıkla CORS."
      : ' Özel adresin tarayıcıdan çağrıya (CORS) izin verdiğinden emin olun.';
  return new AiError('network', NETWORK_HINT + extra);
}

/** General explanation of a network error */
export const NETWORK_HINT =
  'İnternet bağlantınızı kontrol edin. Tarayıcı isteği engelliyor da olabilir (CORS); bazı sağlayıcılar tarayıcıdan doğrudan çağrıya izin vermez.';

/* ---------- Text helpers ---------- */

/** Cleans a plain-text response: strips markdown marks and extra blank lines. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\*\*|__/g, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[-*•][ \t]+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
