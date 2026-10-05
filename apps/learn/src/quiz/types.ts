/** Kendini sına: soru biçimi. Metinler düz metindir; ekrana esc() ile yazılır. */

/** Yanlış yanıttan sonra okurun dönüp bakacağı yer */
export interface QuizRef {
  /** Sekme kimliği, ör. "stories" */
  tab: string;
  /** Sekme içindeki öğe kimliği, ör. "case4" (isteğe bağlı) */
  anchor?: string;
  /** Bağlantı metni, ör. "Senaryolar · Hikâye 4: Aynı fiyat, üç farklı kahveci" */
  label: string;
}

export interface QuizQuestion {
  /** Tekil kimlik, ör. "peg-film-set" */
  id: string;
  /** Konu başlığı, ör. "Büyüme ve PEG" */
  topic: string;
  q: string;
  /** Tam 4 seçenek */
  options: string[];
  /** Doğru seçeneğin sırası (0–3) */
  correct: number;
  /** Doğru yanıtın açıklaması */
  why: string;
  ref: QuizRef;
}
