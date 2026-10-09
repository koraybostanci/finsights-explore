/**
 * The single gateway to the provider: complete() sends a prompt and returns plain text.
 * Errors are mapped to AiError codes; the key never enters any error text or record.
 *
 * fetch and the configuration can be injected (tests use a fake fetch).
 */

import { resolveConfig } from './config.ts';
import {
  buildCompletionRequest,
  httpError,
  isConfigured,
  networkError,
  parseCompletion,
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
  /** Connection test: an empty text also counts as success */
  allowEmpty?: boolean;
}

const COMPLETE_TIMEOUT = 90_000;

/** Sends the request; maps network errors, timeouts and non-2xx responses to AiError. Returns the body as text. */
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
        // No cookies and no referrer are sent; the request goes to the provider only.
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

/** Sends a prompt to the selected provider and returns the plain-text response. */
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

/** Connection test: sends a very short request. Throws AiError on failure. */
export async function testConnection(deps: ClientDeps = {}): Promise<void> {
  await complete(
    { system: '', user: 'Bağlantı sınaması. Yalnızca "tamam" yaz.', maxTokens: 16 },
    { ...deps, allowEmpty: true },
  );
}
