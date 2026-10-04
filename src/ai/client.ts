/**
 * Sağlayıcıya giden tek kapı: complete() bir istem gönderir ve düz metin döndürür.
 * Hatalar AiError kodlarına çevrilir; anahtar hiçbir hata metnine ya da kayda girmez.
 *
 * fetch ve ayar dışarıdan verilebilir (testlerde sahte fetch kullanılır).
 */

import { resolveConfig, setModelList } from './config.ts';
import {
  buildCompletionRequest,
  buildModelsRequest,
  httpError,
  isConfigured,
  networkError,
  parseCompletion,
  parseModels,
  providerDef,
} from './providers.ts';
import type { CompletionRequest, HttpRequest, ResolvedConfig } from './providers.ts';
import { AiError } from './types.ts';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ClientDeps {
  fetch?: FetchLike;
  config?: ResolvedConfig;
  timeoutMs?: number;
}

export interface CompleteOptions extends ClientDeps {
  /** Bağlantı sınaması: boş metin de başarı sayılır */
  allowEmpty?: boolean;
}

const COMPLETE_TIMEOUT = 90_000;
const MODELS_TIMEOUT = 20_000;

/** İsteği gönderir; ağ hatası, zaman aşımı ve 2xx dışı yanıtları AiError'a çevirir. Gövdeyi metin olarak döndürür. */
async function send(req: HttpRequest, cfg: ResolvedConfig, deps: ClientDeps, timeoutMs: number): Promise<string> {
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, deps.timeoutMs ?? timeoutMs);
  try {
    let res: Response;
    try {
      res = await doFetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: ctl.signal,
        // Çerez ve yönlendiren adres gönderilmez; istek yalnızca sağlayıcıya gider.
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw networkError(cfg.provider, timedOut);
    }
    let body = '';
    try {
      body = await res.text();
    } catch {
      throw networkError(cfg.provider, timedOut);
    }
    if (!res.ok) throw httpError(cfg.provider, res.status, body, cfg.key);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new AiError('bad_response', 'Yanıt JSON değil.');
  }
}

function requireConfigured(cfg: ResolvedConfig): void {
  if (!isConfigured(cfg)) throw new AiError('not_configured', '');
}

/** Seçili sağlayıcıya bir istem gönderir, düz metin yanıtı döndürür. */
export async function complete(req: CompletionRequest, opts: CompleteOptions = {}): Promise<string> {
  const cfg = opts.config ?? resolveConfig();
  requireConfigured(cfg);
  const http = buildCompletionRequest(cfg, req);
  const body = await send(http, cfg, opts, COMPLETE_TIMEOUT);
  const out = parseCompletion(providerDef(cfg.provider).shape, parseJson(body));
  if (!out.text.trim() && !opts.allowEmpty)
    throw new AiError(
      'bad_response',
      out.truncated ? 'Model çıktı sınırına takıldı ve metin üretemedi.' : 'Model boş yanıt verdi.',
    );
  return out.text;
}

/**
 * Sağlayıcının model listesini alır ve saklar. Model seçili olmasa da çalışır;
 * anahtar (özel adreste adres) yeterlidir.
 */
export async function listModels(deps: ClientDeps = {}): Promise<string[]> {
  const cfg = deps.config ?? resolveConfig();
  const def = providerDef(cfg.provider);
  if (def.keyRequired && !cfg.key.trim()) throw new AiError('not_configured', 'Önce API anahtarını girin.');
  const http = buildModelsRequest(cfg);
  const body = await send(http, cfg, deps, MODELS_TIMEOUT);
  const models = parseModels(cfg.provider, parseJson(body));
  if (!deps.config) setModelList(cfg.provider, models);
  return models;
}

/** Bağlantı sınaması: çok kısa bir istek gönderir. Başarısızsa AiError atar. */
export async function testConnection(deps: ClientDeps = {}): Promise<void> {
  await complete(
    { system: '', user: 'Bağlantı sınaması. Yalnızca "tamam" yaz.', maxTokens: 16 },
    { ...deps, allowEmpty: true },
  );
}
