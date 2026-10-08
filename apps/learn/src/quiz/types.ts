/** Quiz question shape. Texts are plain text; they are written to the page through esc(). */

/** Where the reader can go back to look after a wrong answer */
export interface QuizRef {
  /** Tab id, e.g. "stories" */
  tab: string;
  /** Id of an item inside the tab, e.g. "case4" (optional) */
  anchor?: string;
  /** Link text, e.g. "Senaryolar · Hikâye 4: Aynı fiyat, üç farklı kahveci" */
  label: string;
}

export interface QuizQuestion {
  /** Unique id, e.g. "peg-film-set" */
  id: string;
  /** Topic title, e.g. "Büyüme ve PEG" */
  topic: string;
  q: string;
  /** Exactly 4 options */
  options: string[];
  /** Index of the correct option (0-3) */
  correct: number;
  /** Explanation of the correct answer */
  why: string;
  ref: QuizRef;
}
