/**
 * Yapay zekâ katmanının dışa açık yüzü (geçici iskelet).
 * Dışa açılan işlevlerin adları ve imzaları sözleşmedir; ekranlar bunlara göre yazılır.
 */

import { esc } from '../lib/format.ts';
import { AiError } from './types.ts';
import type { AiCallOptions, AiStatus, AiText, IndustryCompareInput, StockCommentInput } from './types.ts';

export { AiError } from './types.ts';
export type { AiCallOptions, AiStatus, AiText, IndustryCompareInput, StockCommentInput } from './types.ts';

/** Seçili sağlayıcı ve hazır olup olmadığı. Değişince store 'ai' olayı yayılır. */
export function aiStatus(): AiStatus {
  return { configured: false, provider: '', providerLabel: '', model: '' };
}

/** Hisse yorumu: bir hissenin çarpanlarını ve ortalamalarını hikâyelerin diliyle açıklar. */
export async function commentStock(_input: StockCommentInput, _opts: AiCallOptions = {}): Promise<AiText> {
  throw new AiError('not_configured', 'Yapay zekâ sağlayıcısı ayarlanmadı.');
}

/** Sektör karşılaştırması: aynı piyasadaki bir sektörün hisselerini yan yana okur. */
export async function compareIndustry(_input: IndustryCompareInput, _opts: AiCallOptions = {}): Promise<AiText> {
  throw new AiError('not_configured', 'Yapay zekâ sağlayıcısı ayarlanmadı.');
}

/** AiText.text'i güvenli HTML paragraflarına çevirir. */
export function aiTextHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Hata kodunu kullanıcıya gösterilecek kısa Türkçe mesaja çevirir. */
export function aiErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
