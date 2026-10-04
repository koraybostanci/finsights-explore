/**
 * Sağlayıcı uyarlayıcıları (provider adapters): istek kurma, yanıt çözme, hata eşleme.
 *
 * Buradaki her şey saf işlevdir; fetch ya da depolama kullanmaz. Böylece her
 * sağlayıcının adresi, başlıkları ve gövdesi tests/ai.test.ts içinde sınanır.
 * Üç API biçimi vardır: Anthropic (messages), Gemini (generateContent) ve
 * OpenAI uyumlu (chat/completions; OpenAI, OpenCode Go ve özel adres).
 *
 * Anahtar yalnızca istek başlığına yazılır; adrese (URL) hiçbir zaman girmez.
 */

import { AiError } from './types.ts';
import type { AiErrorCode } from './types.ts';

export type ProviderId = 'anthropic' | 'gemini' | 'openai' | 'opencode' | 'custom';
export type ApiShape = 'anthropic' | 'gemini' | 'openai';

export interface ProviderDef {
  id: ProviderId;
  /** Ekranda görünen ad */
  label: string;
  /** Adın altındaki küçük yazı */
  vendor: string;
  shape: ApiShape;
  /** Sabit taban adres; özel adreste boştur (kullanıcı girer) */
  baseUrl: string;
  /** Anahtar zorunlu mu (yerel modellerde gerekmez) */
  keyRequired: boolean;
  /** OpenAI biçiminde çıktı sınırının alan adı */
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  /** OpenAI biçiminde response_format: json_object gönderilsin mi */
  jsonMode: boolean;
  /** Tarayıcıdan doğrudan çağrıya izin verdiği (CORS) doğrulandı mı */
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
    jsonMode: false,
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
    jsonMode: true,
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
    jsonMode: true,
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
    jsonMode: false,
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
    jsonMode: false,
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

/** Bir çağrı için gereken her şey; depolamadan okunup buraya verilir. */
export interface ResolvedConfig {
  provider: ProviderId;
  key: string;
  model: string;
  /** Yalnızca özel adreste kullanılır */
  baseUrl: string;
}

export interface CompletionRequest {
  system: string;
  user: string;
  /** Görünen yanıt için bütçe; düşünen modeller için uyarlayıcı pay ekler */
  maxTokens: number;
  /** Yanıt JSON olmalı (destekleyen sağlayıcıda JSON kipi açılır) */
  json?: boolean;
}

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}

/**
 * Düşünen (reasoning) modellerde düşünme de çıktı sınırından düşer; sınır dar
 * olursa yanıt boş gelir. Sınır bir tavandır, kullanılmayan kısım ücretlenmez.
 */
export const THINKING_HEADROOM = 3000;

/* ---------- Özel adres ---------- */

export type BaseUrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Özel adres denetimi: https olmalı; http yalnızca bu bilgisayardaki modeller
 * (localhost, 127.0.0.1) için kabul edilir. Sondaki "/" ve "/chat/completions" atılır.
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

/** Sağlayıcının taban adresi; özel adres geçersizse not_configured hatası verir. */
export function baseUrlOf(cfg: ResolvedConfig): string {
  const def = providerDef(cfg.provider);
  if (def.id !== 'custom') return def.baseUrl;
  const check = checkBaseUrl(cfg.baseUrl);
  if (!check.ok) throw new AiError('not_configured', check.reason);
  return check.url;
}

/** Anahtar ve model (özel adreste adres) hazır mı */
export function isConfigured(cfg: ResolvedConfig): boolean {
  const def = providerDef(cfg.provider);
  if (!cfg.model.trim()) return false;
  if (def.keyRequired && !cfg.key.trim()) return false;
  if (def.id === 'custom' && !checkBaseUrl(cfg.baseUrl).ok) return false;
  return true;
}

/* ---------- İstek kurma ---------- */

function authHeaders(def: ProviderDef, key: string): Record<string, string> {
  if (def.shape === 'anthropic')
    return {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // Tarayıcıdan doğrudan çağrı (CORS) için Anthropic bu başlığı ister.
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  if (def.shape === 'gemini') return { 'x-goog-api-key': key };
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** Gemini model adları listede "models/…" önekiyle gelir; istek adresinde önek bir kez yazılır. */
const geminiModel = (model: string): string => model.trim().replace(/^models\//, '');

export function buildCompletionRequest(cfg: ResolvedConfig, req: CompletionRequest): HttpRequest {
  const def = providerDef(cfg.provider);
  const base = baseUrlOf(cfg);
  const key = cfg.key.trim();
  const model = cfg.model.trim();
  const headers = { 'content-type': 'application/json', ...authHeaders(def, key) };

  if (def.shape === 'anthropic') {
    // max_tokens düşünme ile yanıtın toplam tavanıdır; düşünen bir model seçilirse yanıt kesilmesin diye pay eklenir.
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
    if (req.json) generationConfig.responseMimeType = 'application/json';
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
  if (req.json && def.jsonMode) body.response_format = { type: 'json_object' };
  return { url: `${base}/chat/completions`, method: 'POST', headers, body: JSON.stringify(body) };
}

export function buildModelsRequest(cfg: ResolvedConfig): HttpRequest {
  const def = providerDef(cfg.provider);
  const base = baseUrlOf(cfg);
  const headers = authHeaders(def, cfg.key.trim());
  const query = def.shape === 'anthropic' ? '?limit=1000' : def.shape === 'gemini' ? '?pageSize=1000' : '';
  return { url: `${base}/models${query}`, method: 'GET', headers };
}

/* ---------- Yanıt çözme ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export interface Completion {
  text: string;
  /** Yanıt çıktı sınırına takılıp kesildi mi */
  truncated: boolean;
}

function bad(detail: string): AiError {
  return new AiError('bad_response', detail);
}

/** Sağlayıcının başarılı (2xx) yanıtından düz metni çıkarır. */
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

/** Sohbet için uygun olmayan OpenAI modelleri (ses, görsel, gömme vb.); kaba bir elemedir. */
const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|sora|babbage|davinci|search|computer-use/i;

/** Model listesi yanıtından model kimliklerini çıkarır (yinelenenler atılır). */
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

/* ---------- Hata eşleme ---------- */

/** Sağlayıcı mesajını gösterilebilir hâle getirir: anahtar geçiyorsa siler, imleri atar, kısaltır. */
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

/** Hata gövdesinden sağlayıcının mesajını bulur; Anthropic, OpenAI ve Gemini biçimlerini tanır. */
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

/** 2xx olmayan bir HTTP yanıtını AiError'a çevirir. */
export function httpError(provider: ProviderId, status: number, bodyText: string, key = ''): AiError {
  const { message, marker } = providerMessage(bodyText);
  const detail = tidyMessage(message, key);
  let code: AiErrorCode = 'provider';
  if (status === 401 || status === 403) code = 'auth';
  else if (status === 429) code = 'rate_limit';
  // Gemini geçersiz anahtarı 400 ile bildirir (API_KEY_INVALID).
  else if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(`${marker} ${message}`)) code = 'auth';
  const withStatus = detail ? `${detail} (HTTP ${status})` : `HTTP ${status}`;
  const hint =
    code === 'provider' && status === 404
      ? ' Model adını ve adresi kontrol edin.' +
        (provider === 'opencode' ? " OpenCode Go'da yalnızca chat/completions uç noktasını kullanan modeller çalışır." : '')
      : '';
  return new AiError(code, withStatus + hint);
}

/** fetch'in attığı hatayı (ağ, CORS, zaman aşımı) AiError'a çevirir. Tarayıcının hata metni mesaja yazılmaz. */
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

/** Ağ hatasının genel açıklaması */
export const NETWORK_HINT =
  'İnternet bağlantınızı kontrol edin. Tarayıcı isteği engelliyor da olabilir (CORS); bazı sağlayıcılar tarayıcıdan doğrudan çağrıya izin vermez.';

/* ---------- Metin yardımcıları ---------- */

/** Modelin metninden JSON'u çıkarır: kod çitlerini ve baştaki/sondaki açıklamaları atar. */
export function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    /* gövdeyi ayıklamayı dene */
  }
  const starts = [s.indexOf('{'), s.indexOf('[')].filter((i) => i >= 0);
  if (starts.length) {
    const start = Math.min(...starts);
    const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        /* aşağıda hata verilir */
      }
    }
  }
  throw bad('Yanıt geçerli bir JSON değil.');
}

/** Düz metin yanıtını temizler: markdown imlerini ve fazla boş satırları atar. */
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
