/** Kendini sına: soru biçimi. Metinler düz metindir; ekrana esc() ile yazılır. */

import type { MarketId } from '../types.ts';

/** concept: hazır soru bankası · data: güncel veriden üretilen · ai: yapay zekânın yazdığı */
export type QuizKind = 'concept' | 'data' | 'ai';

/** Yanlış yanıttan sonra okurun dönüp bakacağı yer */
export interface QuizRef {
  /** Sekme kimliği, ör. "senaryo" */
  tab: string;
  /** Sekme içindeki öğe kimliği, ör. "case4" (isteğe bağlı) */
  anchor?: string;
  /** Bağlantı metni, ör. "Senaryolar · Hikâye 4: Aynı fiyat, üç farklı kahveci" */
  label: string;
}

/** Sorunun üstünde kutucuk olarak gösterilen rakam */
export interface QuizFact {
  /** Türkçe ad, ör. "F/K" */
  k: string;
  /** İngilizce karşılık, ör. "P/E" */
  en?: string;
  /** Biçimlenmiş değer, ör. "40,66" */
  v: string;
  /** Küçük açıklama, ör. "Eşik: en çok 30" */
  d?: string;
}

export interface QuizQuestion {
  /** Tekil kimlik, ör. "peg-film-seti", "data-verdict-BIST-THYAO" */
  id: string;
  kind: QuizKind;
  /** Konu başlığı, ör. "Büyüme ve PEG" */
  topic: string;
  /** Sorunun üstündeki satır, ör. "THYAO · Türk Hava Yolları · Havayolu" */
  lead?: string;
  facts?: QuizFact[];
  q: string;
  /** Sorunun altındaki küçük hatırlatma (ör. kullanılan kural) */
  note?: string;
  /** Tam 4 seçenek */
  options: string[];
  /** Doğru seçeneğin sırası (0–3) */
  correct: number;
  /** Doğru yanıtın açıklaması */
  why: string;
  ref: QuizRef;
  ticker?: string;
  market?: MarketId;
  /** Seçenekler sıralıysa (ör. sonuç basamakları) karıştırılmaz */
  keepOrder?: boolean;
}
