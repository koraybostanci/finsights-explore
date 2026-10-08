/**
 * External contract of the AI layer. Screens use only these types and the functions
 * ai/index.ts exports, and know nothing about provider details.
 */

import type { Evaluation, Industry, IndustryMedian, MarketId, PriceSeries, StockView } from '../types.ts';

export type AiErrorCode =
  | 'not_configured' // no key or model selected
  | 'auth' // invalid or unauthorized key
  | 'rate_limit' // quota or rate limit
  | 'network' // network or CORS block
  | 'provider' // the provider returned an error
  | 'bad_response'; // the response is not in the expected format

export class AiError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}

export interface AiStatus {
  /** Whether the key and model are ready */
  configured: boolean;
  /** Provider id, e.g. "anthropic" */
  provider: string;
  /** Name shown on screen, e.g. "Claude" */
  providerLabel: string;
  model: string;
}

export interface AiText {
  /** Plain text; paragraphs are separated by a blank line. Not HTML. */
  text: string;
  providerLabel: string;
  model: string;
  /** Whether it came from the cache */
  cached: boolean;
  /** ISO datetime */
  createdAt: string;
}

export interface StockCommentInput {
  stock: StockView;
  evaluation: Evaluation;
  /** The industry median in the stock's own market */
  median: IndustryMedian | null;
  /** Daily closes, if available (for the moving-average comment) */
  prices?: PriceSeries | null;
}

export interface IndustryCompareInput {
  market: MarketId;
  industry: Industry;
  rows: Array<{ stock: StockView; evaluation: Evaluation }>;
  median: IndustryMedian;
}

export interface AiCallOptions {
  /** Ignore the cache and generate again */
  force?: boolean;
}
