/**
 * Veri sözleşmesi (data contract).
 *
 * public/data/market.json bu yapıdadır; scripts/ altındaki veri işi üretir,
 * uygulama okur. Kısa alan adları ilk sürümden (BIST 30 Çarpan Rehberi) gelir
 * ve değerlendirme kurallarıyla aynı kalsın diye korunmuştur.
 */

export type MarketId = 'BIST' | 'US';
export type Currency = 'TRY' | 'USD';
export type Verdict = 'good' | 'warn' | 'bad' | 'na';

export interface Industry {
  /** Türkçe ad, ör. "Havayolu" */
  tr: string;
  /** İngilizce karşılık, ör. "Airlines" */
  en: string;
  /** Döngüsel sektör mü (emtia, rafineri, metal, havayolu) */
  cyclical: boolean;
}

export interface Stock {
  /** Sembol, ör. "THYAO", "AAPL". Aynı piyasa içinde tekildir. */
  k: string;
  /** Şirket adı */
  ad: string;
  market: MarketId;
  cur: Currency;
  /** Sektör kimliği; MarketData.industries anahtarı */
  ind: string;
  /** Banka: ayrı yöntemle değerlendirilir */
  bank?: boolean;
  /** Sektör bayrağını hisse düzeyinde ezmek için */
  cyc?: boolean;

  /** Fiyat (price) */
  f: number | null;
  /** F/K (P/E). null: son 12 ayda zarar ya da veri yok */
  fk: number | null;
  /** PD/DD (P/B) */
  pd: number | null;
  /** FD/FAVÖK (EV/EBITDA) */
  fdf: number | null;
  /** PEG */
  peg: number | null;
  /** Net borç/FAVÖK (Net debt/EBITDA) */
  nb: number | null;
  /** Piyasa değeri (market cap), milyar, hissenin para biriminde */
  mv: number | null;
  /** FAVÖK büyümesi % (EBITDA growth, yıllık) */
  fg: number | null;
  /** Net kâr büyümesi % (net income growth, yıllık) */
  ng: number | null;
  /** fg hesaplanamıyorsa açıklama, ör. "eksiden artıya" */
  fgT?: string;
  /** ng hesaplanamıyorsa açıklama, ör. "zarardan kâra" */
  ngT?: string;
  /** Analistlerin ortalama 12 aylık hedef fiyatı */
  h: number | null;

  /** Basit hareketli ortalamalar (simple moving averages), günlük kapanıştan */
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;

  /** Fonksiyonel para birimi notu (BIST), ör. "USD" */
  usd?: string;
  /** Elle yazılmış yorum ve yazıldığı tarih (ISO gün) */
  not?: string;
  notAsOf?: string;

  /** Yalnızca bankalar: takipteki kredi oranı %, sermaye yeterliliği %, net faiz marjı % */
  npl?: number | null;
  car?: number | null;
  nim?: number | null;
}

export interface MarketData {
  schema: 1;
  /** Verinin tarihi (ISO 8601) */
  asOf: string;
  /** Ekranda gösterilecek kaynak adı */
  source: string;
  /** Piyasa başına bilanço dönemi, ör. { BIST: "2026/6" } */
  period: Partial<Record<MarketId, string>>;
  industries: Record<string, Industry>;
  stocks: Stock[];
}

/** public/data/prices/<MARKET>-<SEMBOL>.json: günlük kapanışlar, eskiden yeniye */
export interface PriceSeries {
  k: string;
  market: MarketId;
  cur: Currency;
  /** ISO günler (YYYY-MM-DD) */
  t: string[];
  /** Kapanış fiyatları; t ile aynı uzunlukta */
  c: number[];
}

/** Stock + türetilmiş alanlar; ekranlar bununla çalışır */
export interface StockView extends Stock {
  /** Yaklaşık özkaynak kârlılığı % = PD/DD ÷ F/K × 100 */
  roe: number | null;
  /** Sektörün Türkçe adı */
  sek: string;
  /** Sektörün İngilizce adı */
  sekEn: string;
  /** Döngüsel mi (hisse bayrağı yoksa sektörden) */
  cyclical: boolean;
  /** Fiyatı ve en az bir çarpanı var mı */
  hasData: boolean;
}

export interface Thresholds {
  /** En yüksek F/K */
  fk: number;
  /** En yüksek PEG */
  peg: number;
  /** En yüksek Net borç/FAVÖK */
  nb: number;
  /** En düşük FAVÖK büyümesi % */
  fg: number;
  /** Döngüsel sektörleri uyar */
  cyc: boolean;
  /** Bankaları listede göster */
  bank: boolean;
}

export interface Check {
  /** Ölçütün adı, ör. "F/K" */
  n: string;
  st: Verdict;
  /** Kısa gerekçe (tablo) */
  s: string;
  /** Uzun gerekçe (açılan satır) */
  t: string;
}

export interface Evaluation {
  checks: Check[];
  verdict: Verdict;
  warns: number;
}

/** Bir sektördeki hisselerin ortanca (median) değerleri */
export interface IndustryMedian {
  /** Ortancaya giren hisse sayısı (verisi olanlar) */
  n: number;
  fk: number | null;
  pd: number | null;
  fdf: number | null;
  peg: number | null;
  nb: number | null;
  fg: number | null;
  ng: number | null;
  roe: number | null;
}
