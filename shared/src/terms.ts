/**
 * Terim sözlüğü: her teknik terimin Türkçesi ve İngilizce karşılığı.
 * Arayüzde bir terim ilk kez geçtiğinde term() ile yazılır; böylece
 * "F/K (P/E)" biçimi her yerde aynı olur.
 */

import { esc } from './format.ts';

export interface Term {
  /** Türkçe terim */
  tr: string;
  /** İngilizce karşılık */
  en: string;
  /** Tek cümlelik açıklama (isteğe bağlı) */
  def?: string;
}

export const TERMS: Record<string, Term> = {
  pe: { tr: 'F/K', en: 'P/E', def: 'Fiyat/kazanç: piyasa değeri ÷ yıllık net kâr.' },
  pb: { tr: 'PD/DD', en: 'P/B', def: 'Piyasa değeri ÷ defter değeri (özkaynak).' },
  evEbitda: { tr: 'FD/FAVÖK', en: 'EV/EBITDA', def: 'Firma değeri ÷ faiz, amortisman ve vergi öncesi kâr.' },
  peg: { tr: 'PEG', en: 'PEG', def: 'F/K ÷ kâr büyümesi.' },
  netDebtEbitda: { tr: 'Net borç/FAVÖK', en: 'Net debt/EBITDA', def: 'Borcun kaç yıllık faaliyet kârıyla ödeneceği.' },
  ebitdaGrowth: { tr: 'FAVÖK büyümesi', en: 'EBITDA growth' },
  netIncomeGrowth: { tr: 'Net kâr büyümesi', en: 'Net income growth' },
  roe: { tr: 'Özkaynak kârlılığı', en: 'ROE', def: 'Net kâr ÷ özkaynak.' },
  marketCap: { tr: 'Piyasa değeri', en: 'Market cap' },
  price: { tr: 'Fiyat', en: 'Price' },
  target: { tr: 'Hedef fiyat', en: 'Target price' },
  ebitda: { tr: 'FAVÖK', en: 'EBITDA' },
  netIncome: { tr: 'Net kâr', en: 'Net income' },
  equity: { tr: 'Özkaynak', en: "Shareholders' equity" },
  netDebt: { tr: 'Net borç', en: 'Net debt' },
  median: { tr: 'Ortanca', en: 'Median' },
  industry: { tr: 'Sektör', en: 'Industry' },
  market: { tr: 'Piyasa', en: 'Market' },
  cyclical: { tr: 'Döngüsel', en: 'Cyclical' },
  watchlist: { tr: 'Hisselerim', en: 'Watchlist' },
  sma: {
    tr: 'Hareketli ortalama',
    en: 'Simple moving average, SMA',
    def: 'Son N günün kapanış fiyatlarının ortalaması.',
  },
  sma20: { tr: '20 günlük ortalama', en: 'SMA 20' },
  sma50: { tr: '50 günlük ortalama', en: 'SMA 50' },
  sma200: { tr: '200 günlük ortalama', en: 'SMA 200' },
  goldenCross: {
    tr: 'Altın kesişim',
    en: 'Golden cross',
    def: '50 günlük ortalamanın 200 günlük ortalamayı aşağıdan yukarı kesmesi.',
  },
  deathCross: {
    tr: 'Ölüm kesişimi',
    en: 'Death cross',
    def: '50 günlük ortalamanın 200 günlük ortalamayı yukarıdan aşağı kesmesi.',
  },
  trend: { tr: 'Eğilim', en: 'Trend', def: 'Fiyatın bir süredir genel olarak gittiği yön.' },
  npl: { tr: 'Takipteki kredi oranı', en: 'NPL ratio' },
  car: { tr: 'Sermaye yeterlilik oranı', en: 'CAR' },
  nim: { tr: 'Net faiz marjı', en: 'NIM' },
  apiKey: { tr: 'API anahtarı', en: 'API key' },
  aiProvider: { tr: 'Yapay zekâ sağlayıcısı', en: 'AI provider' },

  /* Öğrenme sekmelerinin eklediği terimler */
  ema: {
    tr: 'Üstel hareketli ortalama',
    en: 'Exponential moving average, EMA',
    def: 'Son günlere daha fazla ağırlık veren hareketli ortalama.',
  },
  supportResistance: {
    tr: 'Destek ve direnç',
    en: 'Support and resistance',
    def: 'Fiyatın geçmişte defalarca döndüğü alt ve üst seviyeler.',
  },
  close: { tr: 'Kapanış fiyatı', en: 'Closing price', def: 'Hissenin o günkü son işlem fiyatı.' },
  lag: { tr: 'Gecikme', en: 'Lag' },
  industryMedian: {
    tr: 'Sektör ortancası',
    en: 'Industry median',
    def: 'Aynı piyasa ve sektördeki hisselerin bir çarpanı sıralandığında ortada kalan değer.',
  },
  earningsYield: { tr: 'Kazanç verimi', en: 'Earnings yield', def: "F/K'nın tersi: 1 ÷ F/K." },
  riskFree: {
    tr: 'Risksiz faiz',
    en: 'Risk-free rate',
    def: 'Bir para biriminde en güvenli kabul edilen yatırımın getirisi.',
  },
  countryRisk: { tr: 'Ülke riski', en: 'Country risk' },
  inflationAccounting: { tr: 'Enflasyon muhasebesi', en: 'Inflation accounting, TMS 29 / IAS 29' },
  nominalGrowth: { tr: 'Nominal büyüme', en: 'Nominal growth', def: 'Enflasyon düşülmeden ölçülen büyüme.' },
  realGrowth: { tr: 'Reel büyüme', en: 'Real growth', def: 'Enflasyon düşüldükten sonra kalan büyüme.' },
  multiple: { tr: 'Çarpan', en: 'Multiple', def: 'Fiyatın bir finansal büyüklüğe oranı.' },
};

function get(id: string): Term {
  const t = TERMS[id];
  if (!t) throw new Error(`Bilinmeyen terim: ${id}`);
  return t;
}

/** HTML: 'F/K <span class="en">(P/E)</span>'. Türkçe ve İngilizce aynıysa yalnız Türkçe. */
export function term(id: string): string {
  const t = get(id);
  return t.tr === t.en ? esc(t.tr) : `${esc(t.tr)} <span class="en">(${esc(t.en)})</span>`;
}

/** Düz metin: 'F/K (P/E)' */
export function termText(id: string): string {
  const t = get(id);
  return t.tr === t.en ? t.tr : `${t.tr} (${t.en})`;
}
