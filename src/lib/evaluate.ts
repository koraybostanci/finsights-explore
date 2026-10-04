/**
 * Tarama mantığı: bir hisseyi eşiklere göre ölçüt ölçüt değerlendirir.
 * Kurallar ve metinler ilk sürümle (BIST 30 Çarpan Rehberi) aynıdır;
 * eklenenler: verisi olmayan hisse ve eksik borç verisi durumları.
 */

import type { Check, Evaluation, StockView, Thresholds, Verdict } from '../types.ts';
import { nf, pct } from './format.ts';

export const DEF: Thresholds = { fk: 30, peg: 1, nb: 2.5, fg: 0, cyc: true, bank: false };

export const VLABEL: Record<Verdict, string> = {
  good: 'Temiz aday',
  warn: 'Uyarılı aday',
  bad: 'Elendi',
  na: 'Ayrı değerlendir',
};

export const ICON: Record<Verdict, string> = { good: '✓', warn: '!', bad: '✕', na: '–' };

/** Sıralamada kullanılan sonuç sırası */
export const VORD: Record<Verdict, number> = { good: 0, warn: 1, bad: 2, na: 3 };

export function evaluate(s: StockView, th: Thresholds): Evaluation {
  const C: Check[] = [];

  if (!s.hasData) {
    C.push({
      n: 'Veri',
      st: 'na',
      s: 'Veri bekliyor',
      t: 'Bu hissenin verisi henüz gelmedi; bir sonraki veri güncellemesinde dolar.',
    });
    return { checks: C, verdict: 'na', warns: 0 };
  }

  if (s.bank) {
    C.push({
      n: 'Banka',
      st: 'na',
      s: 'Banka: ayrı yöntemle değerlendirilir',
      t: "Bankalar FAVÖK, borç ve PEG ile değerlendirilmez. 'Bankalar' sekmesinde PD/DD ile özkaynak kârlılığına bakın.",
    });
    if (s.roe != null)
      C.push({
        n: 'ÖK kârlılığı',
        st: s.roe >= 20 ? 'good' : s.roe >= 12 ? 'warn' : 'bad',
        s: `ÖK kârlılığı ≈ %${nf(s.roe, 1)}`,
        t: `Yaklaşık özkaynak kârlılığı %${nf(s.roe, 1)} (PD/DD ${nf(s.pd)} ÷ F/K ${nf(s.fk)}).`,
      });
    return { checks: C, verdict: 'na', warns: 0 };
  }

  C.push(
    s.fk == null
      ? { n: 'Kâr', st: 'bad', s: 'Zarar ediyor (son 12 ay)', t: 'Son 12 ayda zarar ediyor; F/K ve PEG hesaplanamaz.' }
      : { n: 'Kâr', st: 'good', s: 'Kârlı', t: `Son 12 ayda kârlı. Kazanç verimi %${nf(100 / s.fk, 1)}.` },
  );

  if (s.fk != null)
    C.push(
      s.fk <= th.fk
        ? {
            n: 'F/K',
            st: 'good',
            s: `F/K ${nf(s.fk, 1)} ≤ ${nf(th.fk, 0)}`,
            t: `F/K ${nf(s.fk)}, eşiğin (${nf(th.fk, 0)}) altında. Kâr sabit kalsa fiyatı yaklaşık ${nf(s.fk, 0)} yılda geri öder.`,
          }
        : {
            n: 'F/K',
            st: 'bad',
            s: `F/K ${nf(s.fk, 1)} > ${nf(th.fk, 0)}: pahalı`,
            t: `F/K ${nf(s.fk)}, eşiğin (${nf(th.fk, 0)}) üzerinde. Piyasa yüksek büyüme fiyatlıyor.`,
          },
    );

  if (s.fk != null) {
    if (s.peg == null)
      C.push({
        n: 'PEG',
        st: 'warn',
        s: 'PEG hesaplanamıyor',
        t: 'PEG hesaplanamıyor; büyüme oranı anlamlı değil (zarardan kâra geçiş veya veri yok).',
      });
    else if (s.peg < 0)
      C.push({
        n: 'PEG',
        st: 'bad',
        s: `PEG ${nf(s.peg)}: kâr düşüyor`,
        t: `PEG ${nf(s.peg)}: eksi değer kârın düştüğünü gösterir.`,
      });
    else if (s.peg <= 0.15)
      C.push({
        n: 'PEG',
        st: 'warn',
        s: `PEG ${nf(s.peg)}: şüpheli derecede düşük`,
        t: `PEG ${nf(s.peg)} olağandışı düşük; büyüme büyük olasılıkla baz etkisi veya tek seferlik kalemlerden.`,
      });
    else if (s.peg <= th.peg)
      C.push({
        n: 'PEG',
        st: 'good',
        s: `PEG ${nf(s.peg)} ≤ ${nf(th.peg, 1)}`,
        t: `PEG ${nf(s.peg)}, eşiğin (${nf(th.peg, 1)}) altında: F/K büyümesine göre makul.`,
      });
    else
      C.push({
        n: 'PEG',
        st: 'bad',
        s: `PEG ${nf(s.peg)} > ${nf(th.peg, 1)}: büyümeye göre pahalı`,
        t: `PEG ${nf(s.peg)}, eşiğin (${nf(th.peg, 1)}) üzerinde: büyümeye göre pahalı.`,
      });
  }

  if (s.fg == null)
    C.push({
      n: 'Büyüme kalitesi',
      st: 'warn',
      s: `FAVÖK ${s.fgT || 'karşılaştırılamıyor'}`,
      t: `FAVÖK ${s.fgT || 'karşılaştırılamıyor'}; faaliyet büyümesi ölçülemiyor.`,
    });
  else if (s.fg < th.fg)
    C.push({
      n: 'Büyüme kalitesi',
      st: 'bad',
      s: `FAVÖK ${pct(s.fg)}: faaliyet büyümüyor`,
      t: `FAVÖK büyümesi ${pct(s.fg)}, eşiğin (${pct(th.fg)}) altında: faaliyetler büyümüyor.`,
    });
  else if (s.ng == null)
    C.push({
      n: 'Büyüme kalitesi',
      st: 'warn',
      s: `Net kâr ${s.ngT || 'karşılaştırılamıyor'}: baz etkisi`,
      t: `FAVÖK ${pct(s.fg)} büyümüş; net kâr ${s.ngT || 'karşılaştırılamıyor'}, bu yüzden baz etkisi var.`,
    });
  else if (s.ng > s.fg + 50)
    C.push({
      n: 'Büyüme kalitesi',
      st: 'warn',
      s: `Net kâr ${pct(s.ng)}, FAVÖK ${pct(s.fg)}: fark faaliyet dışı`,
      t: `Net kâr ${pct(s.ng)}, FAVÖK ise ${pct(s.fg)} büyümüş. Aradaki fark faaliyet dışı kalemlerden; kalıcı olmayabilir.`,
    });
  else
    C.push({
      n: 'Büyüme kalitesi',
      st: 'good',
      s: `Büyüme faaliyetten (FAVÖK ${pct(s.fg)})`,
      t: `FAVÖK ${pct(s.fg)}, net kâr ${pct(s.ng)}: büyüme faaliyetlerle uyumlu.`,
    });

  if (s.nb == null)
    C.push({
      n: 'Borç',
      st: 'warn',
      s: 'Borç verisi yok',
      t: 'Net borç/FAVÖK verisi yok; borç yükü bu kaynaktan ölçülemiyor.',
    });
  else if (s.nb <= th.nb)
    C.push({
      n: 'Borç',
      st: 'good',
      s: s.nb < 0 ? 'Net nakit' : `Borç makul (${nf(s.nb, 1)}x)`,
      t:
        s.nb < 0
          ? `Net nakit pozisyonunda (Net borç/FAVÖK ${nf(s.nb)}).`
          : `Net borç/FAVÖK ${nf(s.nb)}, eşiğin (${nf(th.nb, 1)}) altında.`,
    });
  else
    C.push({
      n: 'Borç',
      st: 'bad',
      s: `Borç yüksek (${nf(s.nb, 1)}x > ${nf(th.nb, 1)})`,
      t: `Net borç/FAVÖK ${nf(s.nb)}, eşiğin (${nf(th.nb, 1)}) üzerinde: borç yükü yüksek.`,
    });

  if (th.cyc && s.cyclical)
    C.push({
      n: 'Döngüsellik',
      st: 'warn',
      s: 'Döngüsel sektör',
      t: `${s.sek} döngüsel bir sektör; bugünkü kâr ortalamanın üstünde veya altında olabilir.`,
    });

  const bad = C.some((c) => c.st === 'bad');
  const warn = C.filter((c) => c.st === 'warn').length;
  return { checks: C, verdict: bad ? 'bad' : warn ? 'warn' : 'good', warns: warn };
}

/** Tablo hücresi rengi: "v-good" | "v-warn" | "v-bad" | "" */
export function cellColor(key: 'fk' | 'peg' | 'nb' | 'fg' | 'pd', val: number | null, th: Thresholds): string {
  if (val == null) return '';
  if (key === 'fk') return val <= th.fk ? 'v-good' : 'v-bad';
  if (key === 'peg') return val < 0 ? 'v-bad' : val <= 0.15 ? 'v-warn' : val <= th.peg ? 'v-good' : 'v-bad';
  if (key === 'nb') return val <= th.nb ? 'v-good' : 'v-bad';
  if (key === 'fg') return val >= th.fg ? 'v-good' : 'v-bad';
  if (key === 'pd') return val < 1 ? 'v-good' : '';
  return '';
}
