/**
 * Yapay zekâ katmanının dış sözleşmesi. Ekranlar yalnızca bu türleri ve
 * ai/index.ts'in dışa açtığı işlevleri kullanır; sağlayıcı ayrıntısını bilmez.
 */

import type { Evaluation, Industry, IndustryMedian, MarketId, PriceSeries, StockView } from '../types.ts';

export type AiErrorCode =
  | 'not_configured' // anahtar ya da model seçilmemiş
  | 'auth' // anahtar geçersiz ya da yetkisiz
  | 'rate_limit' // kota ya da hız sınırı
  | 'network' // ağ ya da CORS engeli
  | 'provider' // sağlayıcı hata döndürdü
  | 'bad_response'; // yanıt beklenen biçimde değil

export class AiError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}

export interface AiStatus {
  /** Anahtar ve model hazır mı */
  configured: boolean;
  /** Sağlayıcı kimliği, ör. "anthropic" */
  provider: string;
  /** Ekranda gösterilecek ad, ör. "Claude" */
  providerLabel: string;
  model: string;
}

export interface AiText {
  /** Düz metin; paragraflar boş satırla ayrılır. HTML değildir. */
  text: string;
  providerLabel: string;
  model: string;
  /** Önbellekten mi geldi */
  cached: boolean;
  /** ISO tarih-saat */
  createdAt: string;
}

export interface StockCommentInput {
  stock: StockView;
  evaluation: Evaluation;
  /** Hissenin kendi piyasasındaki sektör ortancası */
  median: IndustryMedian | null;
  /** Varsa günlük kapanışlar (hareketli ortalama yorumu için) */
  prices?: PriceSeries | null;
}

export interface IndustryCompareInput {
  market: MarketId;
  industry: Industry;
  rows: Array<{ stock: StockView; evaluation: Evaluation }>;
  median: IndustryMedian;
}

export interface AiCallOptions {
  /** Önbelleği yok say ve yeniden üret */
  force?: boolean;
}
