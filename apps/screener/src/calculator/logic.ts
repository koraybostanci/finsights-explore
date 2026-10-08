/**
 * The calculator tab's computations (no DOM access). The formulas match the first release:
 * multiples are derived from a few balance-sheet and income-statement figures the user
 * enters, then run through the same checks as the screener.
 */

import type { Check, Evaluation, StockView, Thresholds } from '../types.ts';
import { CHECK_LABEL, evaluate } from '../lib/evaluate.ts';

/** The figures in the inputs; an empty or invalid input is NaN. Amounts share one unit (e.g. billion TL). */
export interface CalcInput {
  /** Market cap */
  marketCap: number;
  /** Annual net income (last 12 months) */
  netIncome: number;
  /** Equity */
  equity: number;
  /** Annual EBITDA */
  ebitda: number;
  /** Net debt; can be negative */
  netDebt: number;
  /** Net income growth in % */
  netIncomeGrowth: number;
  /** EBITDA growth in % */
  ebitdaGrowth: number;
  /** Cyclical industry */
  cyc: boolean;
}

/** Example: approximate figures from BIM's 2 October 2026 data (billion TL) */
export const BIM_EXAMPLE: CalcInput = {
  marketCap: 495.6,
  netIncome: 29.54,
  equity: 201.35,
  ebitda: 55.75,
  netDebt: 32.39,
  netIncomeGrowth: 44,
  ebitdaGrowth: 23,
  cyc: false,
};

export interface CalcMultiples {
  /** P/E; null when there is no profit (loss) */
  pe: number | null;
  /** P/B */
  pb: number | null;
  /** EV/EBITDA = (market cap + net debt) ÷ EBITDA */
  evEbitda: number | null;
  /** PEG = P/E ÷ net income growth */
  peg: number | null;
  /** Return on equity in % */
  roe: number | null;
  /** Net debt/EBITDA */
  netDebtEbitda: number | null;
}

/** Net income entered and zero or negative: a loss. An empty input counts as unknown. */
export const isLoss = (i: CalcInput): boolean => !Number.isNaN(i.netIncome) && i.netIncome <= 0;

export function calcMultiples(i: CalcInput): CalcMultiples {
  const pe = i.netIncome > 0 ? i.marketCap / i.netIncome : null;
  const pb = i.equity > 0 ? i.marketCap / i.equity : null;
  const evEbitda = i.ebitda > 0 ? (i.marketCap + (Number.isNaN(i.netDebt) ? 0 : i.netDebt)) / i.ebitda : null;
  const peg = pe != null && !Number.isNaN(i.netIncomeGrowth) && i.netIncomeGrowth !== 0 ? pe / i.netIncomeGrowth : null;
  const roe = i.equity > 0 && !Number.isNaN(i.netIncome) ? (i.netIncome / i.equity) * 100 : null;
  const netDebtEbitda = i.ebitda > 0 && !Number.isNaN(i.netDebt) ? i.netDebt / i.ebitda : null;
  return { pe, pb, evEbitda, peg, roe, netDebtEbitda };
}

/** Puts the computed multiples into the shape the screener's evaluation function expects. */
export function calcStock(i: CalcInput, m: CalcMultiples): StockView {
  return {
    symbol: '',
    name: '',
    market: 'BIST',
    currency: 'TRY',
    industry: '',
    price: null,
    pe: m.pe,
    loss: isLoss(i),
    pb: m.pb,
    evEbitda: m.evEbitda,
    peg: m.peg,
    netDebtEbitda: m.netDebtEbitda,
    marketCap: null,
    ebitdaGrowth: Number.isNaN(i.ebitdaGrowth) ? null : i.ebitdaGrowth,
    netIncomeGrowth: Number.isNaN(i.netIncomeGrowth) ? null : i.netIncomeGrowth,
    targetPrice: null,
    sma20: null,
    sma50: null,
    sma200: null,
    roe: m.roe,
    industryTr: 'Bu sektör',
    industryEn: '',
    cyclical: i.cyc,
    hasData: true,
  };
}

const DEBT_UNKNOWN: Check = {
  id: 'debt',
  label: CHECK_LABEL.debt,
  status: 'bad',
  short: 'Borç ölçülemiyor',
  long: 'Net borç/FAVÖK hesaplanamıyor: FAVÖK sıfır ya da eksi, ya da net borç girilmedi. Borcun kaç yıllık faaliyet kârıyla ödeneceği bilinmiyor.',
};

/**
 * Evaluation against the screener's thresholds. When net debt/EBITDA cannot be computed,
 * the stock fails the debt check as in the first release, but no made-up ratio is written.
 */
export function calcEvaluate(i: CalcInput, th: Thresholds): { m: CalcMultiples; ev: Evaluation } {
  const m = calcMultiples(i);
  const ev = evaluate(calcStock(i, m), th);
  if (m.netDebtEbitda != null) return { m, ev };
  const checks = ev.checks.map((c) => (c.id === 'debt' ? DEBT_UNKNOWN : c));
  const warns = checks.filter((c) => c.status === 'warn').length;
  const bad = checks.some((c) => c.status === 'bad');
  return { m, ev: { checks, verdict: bad ? 'bad' : warns ? 'warn' : 'good', warns } };
}
