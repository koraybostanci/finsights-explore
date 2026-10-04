/**
 * Terim sözlüğü: her teknik terimin Türkçesi ve İngilizce karşılığı.
 * Arayüzde bir terim ilk kez geçtiğinde term() ile yazılır; böylece
 * "F/K (P/E)" biçimi her yerde aynı olur.
 */

import { esc } from './lib/format.ts';

export interface Term {
  /** Türkçe terim */
  tr: string;
  /** İngilizce karşılık */
  en: string;
  /** Tek cümlelik açıklama (isteğe bağlı) */
  def?: string;
}

export const TERMS: Record<string, Term> = {
  fk: { tr: 'F/K', en: 'P/E', def: 'Fiyat/kazanç: piyasa değeri ÷ yıllık net kâr.' },
  pd: { tr: 'PD/DD', en: 'P/B', def: 'Piyasa değeri ÷ defter değeri (özkaynak).' },
  fdf: { tr: 'FD/FAVÖK', en: 'EV/EBITDA', def: 'Firma değeri ÷ faiz, amortisman ve vergi öncesi kâr.' },
  peg: { tr: 'PEG', en: 'PEG', def: 'F/K ÷ kâr büyümesi.' },
  nb: { tr: 'Net borç/FAVÖK', en: 'Net debt/EBITDA', def: 'Borcun kaç yıllık faaliyet kârıyla ödeneceği.' },
  fg: { tr: 'FAVÖK büyümesi', en: 'EBITDA growth' },
  ng: { tr: 'Net kâr büyümesi', en: 'Net income growth' },
  roe: { tr: 'Özkaynak kârlılığı', en: 'ROE', def: 'Net kâr ÷ özkaynak.' },
  mv: { tr: 'Piyasa değeri', en: 'Market cap' },
  price: { tr: 'Fiyat', en: 'Price' },
  target: { tr: 'Hedef fiyat', en: 'Target price' },
  favok: { tr: 'FAVÖK', en: 'EBITDA' },
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
  goldenCross: { tr: 'Altın kesişim', en: 'Golden cross' },
  deathCross: { tr: 'Ölüm kesişimi', en: 'Death cross' },
  trend: { tr: 'Eğilim', en: 'Trend' },
  npl: { tr: 'Takipteki kredi oranı', en: 'NPL ratio' },
  car: { tr: 'Sermaye yeterlilik oranı', en: 'CAR' },
  nim: { tr: 'Net faiz marjı', en: 'NIM' },
  apiKey: { tr: 'API anahtarı', en: 'API key' },
  aiProvider: { tr: 'Yapay zekâ sağlayıcısı', en: 'AI provider' },
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
