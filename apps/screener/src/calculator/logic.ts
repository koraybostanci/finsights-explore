/**
 * "Kendi hesabın" hesapları (DOM'a dokunmaz). Formüller ilk sürümle aynıdır:
 * girilen birkaç bilanço ve gelir tablosu rakamından çarpanlar türetilir,
 * sonra tarayıcıyla aynı ölçütlerden geçirilir.
 */

import type { Check, Evaluation, StockView, Thresholds } from '../types.ts';
import { CHECK_LABEL, evaluate } from '../lib/evaluate.ts';

/** Kutulardaki rakamlar; boş ya da geçersiz kutu NaN'dır. Tutarlar aynı birimdedir (ör. milyar TL). */
export interface CalcInput {
  /** Piyasa değeri (market cap) */
  pd: number;
  /** Yıllık net kâr (net income, son 12 ay) */
  nk: number;
  /** Özkaynak (equity) */
  ok: number;
  /** Yıllık FAVÖK (EBITDA) */
  fv: number;
  /** Net borç (net debt); eksi olabilir */
  nb: number;
  /** Net kâr büyümesi % */
  ng: number;
  /** FAVÖK büyümesi % */
  fg: number;
  /** Döngüsel sektör */
  cyc: boolean;
}

/** Örnek: BİM'in 2 Ekim 2026 verisindeki yaklaşık rakamları (milyar TL) */
export const BIM_EXAMPLE: CalcInput = { pd: 495.6, nk: 29.54, ok: 201.35, fv: 55.75, nb: 32.39, ng: 44, fg: 23, cyc: false };

export interface CalcMultiples {
  /** F/K; kâr yoksa null (zarar) */
  fk: number | null;
  /** PD/DD */
  pddd: number | null;
  /** FD/FAVÖK = (piyasa değeri + net borç) ÷ FAVÖK */
  fdf: number | null;
  /** PEG = F/K ÷ net kâr büyümesi */
  peg: number | null;
  /** Özkaynak kârlılığı % */
  roe: number | null;
  /** Net borç/FAVÖK */
  nbf: number | null;
}

/** Net kâr girilmiş ve sıfır ya da eksi: zarar. Kutu boşsa bilinmiyor sayılır. */
export const isLoss = (i: CalcInput): boolean => !Number.isNaN(i.nk) && i.nk <= 0;

export function calcMultiples(i: CalcInput): CalcMultiples {
  const fk = i.nk > 0 ? i.pd / i.nk : null;
  const pddd = i.ok > 0 ? i.pd / i.ok : null;
  const fdf = i.fv > 0 ? (i.pd + (Number.isNaN(i.nb) ? 0 : i.nb)) / i.fv : null;
  const peg = fk != null && !Number.isNaN(i.ng) && i.ng !== 0 ? fk / i.ng : null;
  const roe = i.ok > 0 && !Number.isNaN(i.nk) ? (i.nk / i.ok) * 100 : null;
  const nbf = i.fv > 0 && !Number.isNaN(i.nb) ? i.nb / i.fv : null;
  return { fk, pddd, fdf, peg, roe, nbf };
}

/** Hesaplanan çarpanları tarayıcının değerlendirme işlevine verilecek biçime sokar. */
export function calcStock(i: CalcInput, m: CalcMultiples): StockView {
  return {
    symbol: '',
    name: '',
    market: 'BIST',
    currency: 'TRY',
    industry: '',
    price: null,
    pe: m.fk,
    loss: isLoss(i),
    pb: m.pddd,
    evEbitda: m.fdf,
    peg: m.peg,
    netDebtEbitda: m.nbf,
    marketCap: null,
    ebitdaGrowth: Number.isNaN(i.fg) ? null : i.fg,
    netIncomeGrowth: Number.isNaN(i.ng) ? null : i.ng,
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
 * Tarayıcıdaki eşiklerle değerlendirme. Net borç/FAVÖK hesaplanamıyorsa ilk
 * sürümdeki gibi borç ölçütünden kalır; ama uydurma bir oran yazılmaz.
 */
export function calcEvaluate(i: CalcInput, th: Thresholds): { m: CalcMultiples; ev: Evaluation } {
  const m = calcMultiples(i);
  const ev = evaluate(calcStock(i, m), th);
  if (m.nbf != null) return { m, ev };
  const checks = ev.checks.map((c) => (c.id === 'debt' ? DEBT_UNKNOWN : c));
  const warns = checks.filter((c) => c.status === 'warn').length;
  const bad = checks.some((c) => c.status === 'bad');
  return { m, ev: { checks, verdict: bad ? 'bad' : warns ? 'warn' : 'good', warns } };
}
