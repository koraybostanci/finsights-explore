/**
 * Veri sözleşmesi (data contract), şema 2.
 *
 * public/data/market.json bu yapıdadır; scripts/ altındaki veri işi üretir,
 * uygulama okur. Alan adları İngilizcedir.
 */

export type MarketId = 'BIST' | 'US';
export type Currency = 'TRY' | 'USD';
export type Verdict = 'good' | 'warn' | 'bad' | 'na';

export interface Industry {
  /** Türkçe ad, ör. "Havayolu" */
  nameTr: string;
  /** İngilizce karşılık, ör. "Airlines" */
  nameEn: string;
  /** Döngüsel sektör mü (emtia, rafineri, metal, havayolu) */
  cyclical: boolean;
}

export interface Stock {
  /** Sembol, ör. "THYAO", "AAPL". Aynı piyasa içinde tekildir. */
  symbol: string;
  /** Şirket adı */
  name: string;
  market: MarketId;
  currency: Currency;
  /** Sektör kimliği; MarketData.industries anahtarı */
  industry: string;
  /** Banka: ayrı yöntemle değerlendirilir */
  bank?: boolean;
  /** Sektör bayrağını hisse düzeyinde ezmek için */
  cyc?: boolean;

  /** Fiyat (price) */
  price: number | null;
  /** F/K (P/E). null: son 12 ayda zarar (loss: true) ya da veri yok */
  pe: number | null;
  /** Son 12 ayda zarar etti (hisse başına kâr sıfır ya da eksi). Yoksa: zarar yok ya da bilinmiyor. */
  loss?: boolean;
  /** PD/DD (P/B) */
  pb: number | null;
  /** FD/FAVÖK (EV/EBITDA) */
  evEbitda: number | null;
  /** PEG */
  peg: number | null;
  /** Net borç/FAVÖK (Net debt/EBITDA) */
  netDebtEbitda: number | null;
  /** Piyasa değeri (market cap), milyar, hissenin para biriminde */
  marketCap: number | null;
  /** FAVÖK büyümesi % (EBITDA growth, yıllık) */
  ebitdaGrowth: number | null;
  /** Net kâr büyümesi % (net income growth, yıllık) */
  netIncomeGrowth: number | null;
  /** ebitdaGrowth hesaplanamıyorsa açıklama, ör. "eksiden artıya" */
  ebitdaGrowthNote?: string;
  /** netIncomeGrowth hesaplanamıyorsa açıklama, ör. "zarardan kâra" */
  netIncomeGrowthNote?: string;
  /** Analistlerin ortalama 12 aylık hedef fiyatı */
  targetPrice: number | null;

  /** Basit hareketli ortalamalar (simple moving averages), günlük kapanıştan */
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;

  /** Fonksiyonel para birimi notu (BIST), ör. "USD" */
  usd?: string;
  /** Elle yazılmış yorum ve yazıldığı tarih (ISO gün) */
  note?: string;
  noteAsOf?: string;

  /** Yalnızca bankalar: takipteki kredi oranı %, sermaye yeterliliği %, net faiz marjı % */
  npl?: number | null;
  car?: number | null;
  nim?: number | null;
}

export interface MarketData {
  schema: 2;
  /** En son veri güncellemesinin tarihi (ISO 8601) */
  asOf: string;
  /**
   * Piyasa başına verinin tarihi. Zamanlanmış iş her seferinde tek piyasayı çeker;
   * bu yüzden BIST ve ABD verisinin tarihi farklı olabilir. Yoksa asOf geçerlidir.
   */
  asOfBy?: Partial<Record<MarketId, string>>;
  /** Ekranda gösterilecek kaynak adı */
  source: string;
  /** Piyasa başına bilanço dönemi, ör. { BIST: "2026/6" } */
  period: Partial<Record<MarketId, string>>;
  industries: Record<string, Industry>;
  stocks: Stock[];
}

/** public/data/prices/<MARKET>-<SEMBOL>.json: günlük kapanışlar, eskiden yeniye */
export interface PriceSeries {
  symbol: string;
  market: MarketId;
  currency: Currency;
  /** ISO günler (YYYY-MM-DD) */
  dates: string[];
  /** Kapanış fiyatları; dates ile aynı uzunlukta */
  closes: number[];
}

/** Stock + türetilmiş alanlar; ekranlar bununla çalışır */
export interface StockView extends Stock {
  /** Yaklaşık özkaynak kârlılığı % = PD/DD ÷ F/K × 100 */
  roe: number | null;
  /** Sektörün Türkçe adı */
  industryTr: string;
  /** Sektörün İngilizce adı */
  industryEn: string;
  /** Döngüsel mi (hisse bayrağı yoksa sektörden) */
  cyclical: boolean;
  /** Fiyatı ve en az bir çarpanı var mı */
  hasData: boolean;
}

export interface Thresholds {
  /** En yüksek F/K */
  maxPe: number;
  /** En yüksek PEG */
  maxPeg: number;
  /** En yüksek Net borç/FAVÖK */
  maxNetDebtEbitda: number;
  /** En düşük FAVÖK büyümesi % */
  minEbitdaGrowth: number;
  /** Döngüsel sektörleri uyar */
  warnCyclical: boolean;
  /** Bankaları listede göster */
  showBanks: boolean;
}

/** Ölçüt kimlikleri; mantık bunlara bakar, ekranda CHECK_LABEL gösterilir */
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
  /** Ölçütün ekrandaki adı, ör. "F/K" */
  label: string;
  status: Verdict;
  /** Kısa gerekçe (tablo) */
  short: string;
  /** Uzun gerekçe (açılan satır) */
  long: string;
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
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  peg: number | null;
  netDebtEbitda: number | null;
  ebitdaGrowth: number | null;
  netIncomeGrowth: number | null;
  roe: number | null;
}
