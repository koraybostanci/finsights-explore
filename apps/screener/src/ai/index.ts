/**
 * Public face of the AI layer.
 *
 * Screens use only the functions here and know nothing about provider details.
 * The numbers always come from the app; the AI only explains them. The key belongs
 * to the user, is stored in this browser, and requests go straight to the provider.
 */

import { marketAsOf } from '../data/store.ts';
import type { MarketId } from '../types.ts';
import { esc } from '@fintools/shared/format';
import { cacheGet, cacheKey, cachePut } from './cache.ts';
import { complete } from './client.ts';
import { resolveConfig, status } from './config.ts';
import { industryPrompt, PROMPT_VERSION, stockPrompt } from './prompts.ts';
import type { Prompt } from './prompts.ts';
import { checkBaseUrl, cleanText, isConfigured, NETWORK_HINT, providerDef } from './providers.ts';
import { AiError } from './types.ts';
import type { AiCallOptions, AiErrorCode, AiStatus, AiText, IndustryCompareInput, StockCommentInput } from './types.ts';

export { AiError } from './types.ts';
export type { AiCallOptions, AiStatus, AiText, IndustryCompareInput, StockCommentInput } from './types.ts';

/** The selected provider and whether it is ready. The store emits an 'ai' event when it changes. */
export function aiStatus(): AiStatus {
  return status();
}

/** Keeps the same request from being sent twice at once (double click) */
const inflight = new Map<string, Promise<AiText>>();

async function explain(kind: string, id: string, market: MarketId, build: (asOf: string) => Prompt, opts: AiCallOptions): Promise<AiText> {
  const cfg = resolveConfig();
  if (!isConfigured(cfg)) throw new AiError('not_configured', '');
  const def = providerDef(cfg.provider);
  const asOf = marketAsOf(market);
  const prompt = build(asOf);
  // With a custom URL the same model name can be a different model on another server.
  const base = def.id === 'custom' ? checkBaseUrl(cfg.baseUrl) : null;
  const provider = base && base.ok ? `${def.id}@${base.url}` : def.id;
  const key = cacheKey({ kind, id, market, asOf, provider, model: cfg.model, version: PROMPT_VERSION, prompt: prompt.system + '\n' + prompt.user });

  if (!opts.force) {
    const hit = cacheGet(key);
    if (hit) return { text: hit.text, providerLabel: hit.providerLabel, model: hit.model, cached: true, createdAt: hit.createdAt };
    const running = inflight.get(key);
    if (running) return running;
  }

  const run = (async (): Promise<AiText> => {
    const raw = await complete({ system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens }, { config: cfg });
    const text = cleanText(raw);
    if (!text) throw new AiError('bad_response', 'Model boş yanıt verdi.');
    const out: AiText = { text, providerLabel: def.label, model: cfg.model, cached: false, createdAt: new Date().toISOString() };
    cachePut({ key, text, providerLabel: out.providerLabel, model: out.model, createdAt: out.createdAt });
    return out;
  })();
  inflight.set(key, run);
  try {
    return await run;
  } finally {
    if (inflight.get(key) === run) inflight.delete(key);
  }
}

/** Stock comment: explains a stock's multiples and averages in the language of the stories. */
export async function commentStock(input: StockCommentInput, opts: AiCallOptions = {}): Promise<AiText> {
  const s = input.stock;
  return explain('stock', s.symbol, s.market, (asOf) => stockPrompt(input, { asOf }), opts);
}

/** Industry comparison: reads the stocks of one industry in the same market side by side. */
export async function compareIndustry(input: IndustryCompareInput, opts: AiCallOptions = {}): Promise<AiText> {
  // The input has no industry id; the English name is unique within a market.
  return explain('industry', input.industry.nameEn, input.market, (asOf) => industryPrompt(input, { asOf }), opts);
}

/** Turns AiText.text into safe HTML paragraphs. */
export function aiTextHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const BASE: Record<AiErrorCode, string> = {
  not_configured: "Yapay zekâ sağlayıcısı ayarlanmadı. Ayarlar sekmesinden bir sağlayıcı seçip anahtarınızı ve modeli girin.",
  auth: 'Sağlayıcı anahtarı kabul etmedi. Anahtarı ve yetkilerini kontrol edin.',
  rate_limit: 'Sağlayıcının kota ya da hız sınırına takıldınız. Biraz bekleyip yeniden deneyin.',
  network: 'Sağlayıcıya ulaşılamadı.',
  provider: 'Sağlayıcı hata döndürdü.',
  bad_response: 'Sağlayıcının yanıtı beklenen biçimde değil.',
};

/**
 * Turns an error code into a short Turkish message for the user.
 * The returned text is plain text (not HTML) and never contains the key.
 */
export function aiErrorMessage(e: unknown): string {
  if (!(e instanceof AiError)) return 'Beklenmeyen bir hata oluştu. Yeniden deneyin.';
  const base = BASE[e.code] ?? BASE.provider;
  const detail = (e.message || '').trim();
  switch (e.code) {
    case 'network':
      return `${base} ${detail || NETWORK_HINT}`;
    case 'provider':
    case 'auth':
    case 'rate_limit':
      return detail ? `${base} Sağlayıcının mesajı: ${detail}` : base;
    case 'bad_response':
      return detail ? `${base} ${detail}` : base;
    case 'not_configured':
      return detail && detail !== BASE.not_configured ? `${base} ${detail}` : base;
    default:
      return base;
  }
}
