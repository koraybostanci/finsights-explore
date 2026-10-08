/**
 * Data contract, schema 2.
 *
 * public/data/market.json has this shape: the data job under scripts/ writes it
 * and the app reads it.
 */

import type { Currency } from '@fintools/shared/format';

export type { Currency };
export type MarketId = 'BIST' | 'US';
export type Verdict = 'good' | 'warn' | 'bad' | 'na';

export interface Industry {
  /** Turkish name, e.g. "Havayolu" */
  nameTr: string;
  /** English name, e.g. "Airlines" */
  nameEn: string;
  /** Whether the industry is cyclical (commodities, refining, metals, airlines) */
  cyclical: boolean;
}

export interface Stock {
  /** Ticker symbol, e.g. "THYAO", "AAPL". Unique within a market. */
  symbol: string;
  /** Company name */
  name: string;
  market: MarketId;
  currency: Currency;
  /** Industry id; a key of MarketData.industries */
  industry: string;
  /** Bank: evaluated with a separate method */
  bank?: boolean;
  /** Overrides the industry flag at stock level */
  cyc?: boolean;

  /** Price */
  price: number | null;
  /** P/E. null: loss over the last 12 months (loss: true) or no data */
  pe: number | null;
  /** Made a loss over the last 12 months (earnings per share zero or negative). Absent: no loss, or unknown. */
  loss?: boolean;
  /** P/B */
  pb: number | null;
  /** EV/EBITDA */
  evEbitda: number | null;
  /** PEG */
  peg: number | null;
  /** Net debt/EBITDA */
  netDebtEbitda: number | null;
  /** Market cap, in billions, in the stock's own currency */
  marketCap: number | null;
  /** EBITDA growth in % (year over year) */
  ebitdaGrowth: number | null;
  /** Net income growth in % (year over year) */
  netIncomeGrowth: number | null;
  /** Explanation when ebitdaGrowth cannot be computed, e.g. "eksiden artıya" */
  ebitdaGrowthNote?: string;
  /** Explanation when netIncomeGrowth cannot be computed, e.g. "zarardan kâra" */
  netIncomeGrowthNote?: string;
  /** Analysts' average 12-month target price */
  targetPrice: number | null;

  /** Simple moving averages (SMA), computed from daily closes */
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;

  /** Functional currency note (BIST), e.g. "USD" */
  usd?: string;
  /** Hand-written comment and the date it was written (ISO day) */
  note?: string;
  noteAsOf?: string;

  /** Banks only: non-performing loan ratio %, capital adequacy ratio %, net interest margin % */
  npl?: number | null;
  car?: number | null;
  nim?: number | null;
}

export interface MarketData {
  schema: 2;
  /** Date of the latest data update (ISO 8601) */
  asOf: string;
  /**
   * Data date per market. The scheduled job fetches one market per run,
   * so BIST and US data can carry different dates. When absent, asOf applies.
   */
  asOfBy?: Partial<Record<MarketId, string>>;
  /** Source name shown on screen */
  source: string;
  /** Reporting period per market, e.g. { BIST: "2026/6" } */
  period: Partial<Record<MarketId, string>>;
  industries: Record<string, Industry>;
  stocks: Stock[];
}

/** public/data/prices/<MARKET>-<SYMBOL>.json: daily closes, oldest first */
export interface PriceSeries {
  symbol: string;
  market: MarketId;
  currency: Currency;
  /** ISO days (YYYY-MM-DD) */
  dates: string[];
  /** Closing prices; same length as dates */
  closes: number[];
}

/** Stock plus derived fields; the screens work with this */
export interface StockView extends Stock {
  /** Approximate return on equity in % = P/B ÷ P/E × 100 */
  roe: number | null;
  /** Turkish industry name */
  industryTr: string;
  /** English industry name */
  industryEn: string;
  /** Whether cyclical (from the industry when the stock has no flag) */
  cyclical: boolean;
  /** Whether it has a price and at least one multiple */
  hasData: boolean;
}

export interface Thresholds {
  /** Highest P/E */
  maxPe: number;
  /** Highest PEG */
  maxPeg: number;
  /** Highest net debt/EBITDA */
  maxNetDebtEbitda: number;
  /** Lowest EBITDA growth in % */
  minEbitdaGrowth: number;
  /** Warn about cyclical industries */
  warnCyclical: boolean;
  /** Show banks in the list */
  showBanks: boolean;
}

/** Check ids; the logic keys on these, the screen shows CHECK_LABEL */
export type CheckId =
  | 'data'
  | 'bank'
  | 'roe'
  | 'profit'
  | 'pe'
  | 'peg'
  | 'growthQuality'
  | 'debt'
  | 'cyclical';

export interface Check {
  id: CheckId;
  /** On-screen name of the check, e.g. "F/K" */
  label: string;
  status: Verdict;
  /** Short reason (table) */
  short: string;
  /** Long reason (expanded row) */
  long: string;
}

export interface Evaluation {
  checks: Check[];
  verdict: Verdict;
  warns: number;
}

/** Median values of the stocks in one industry */
export interface IndustryMedian {
  /** Number of stocks in the median (those with data) */
  n: number;
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  peg: number | null;
  netDebtEbitda: number | null;
  ebitdaGrowth: number | null;
  netIncomeGrowth: number | null;
  roe: number | null;
}
