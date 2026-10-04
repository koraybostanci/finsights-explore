/**
 * Tarama mantığı: bir hisseyi eşiklere göre ölçüt ölçüt değerlendirir.
 * Kurallar ve metinler ilk sürümle (BIST 30 Çarpan Rehberi) aynıdır;
 * eklenenler: verisi olmayan hisse, eksik borç verisi ve F/K'nın zarar yüzünden mi
 * yoksa veri eksikliğinden mi boş olduğunun ayrılması (Stock.loss).
 */

import type { Check, CheckId, Evaluation, StockView, Thresholds, Verdict } from '../types.ts';
import { nf, pct } from './format.ts';

export const DEF: Thresholds = {
  maxPe: 30,
  maxPeg: 1,
  maxNetDebtEbitda: 2.5,
  minEbitdaGrowth: 0,
  warnCyclical: true,
  showBanks: false,
};

/** Ölçüt kimliğinin ekranda görünen adı */
export const CHECK_LABEL: Record<CheckId, string> = {
  data: 'Veri',
  bank: 'Banka',
  roe: 'ÖK kârlılığı',
  profit: 'Kâr',
  pe: 'F/K',
  peg: 'PEG',
  growthQuality: 'Büyüme kalitesi',
  debt: 'Borç',
  cyclical: 'Döngüsellik',
};

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
      id: 'data',
      label: CHECK_LABEL.data,
      status: 'na',
      short: 'Veri bekliyor',
      long: 'Bu hissenin verisi henüz gelmedi; bir sonraki veri güncellemesinde dolar.',
    });
    return { checks: C, verdict: 'na', warns: 0 };
  }

  if (s.bank) {
    C.push({
      id: 'bank',
      label: CHECK_LABEL.bank,
      status: 'na',
      short: 'Banka: ayrı yöntemle değerlendirilir',
      long: "Bankalar FAVÖK, borç ve PEG ile değerlendirilmez. 'Bankalar' sekmesinde PD/DD ile özkaynak kârlılığına bakın.",
    });
    if (s.roe != null)
      C.push({
        id: 'roe',
        label: CHECK_LABEL.roe,
        status: s.roe >= 20 ? 'good' : s.roe >= 12 ? 'warn' : 'bad',
        short: `ÖK kârlılığı ≈ %${nf(s.roe, 1)}`,
        long: `Yaklaşık özkaynak kârlılığı %${nf(s.roe, 1)} (PD/DD ${nf(s.pb)} ÷ F/K ${nf(s.pe)}).`,
      });
    return { checks: C, verdict: 'na', warns: 0 };
  }

  if (s.pe != null)
    C.push({
      id: 'profit',
      label: CHECK_LABEL.profit,
      status: 'good',
      short: 'Kârlı',
      long: `Son 12 ayda kârlı. Kazanç verimi %${nf(100 / s.pe, 1)}.`,
    });
  else if (s.loss)
    C.push({
      id: 'profit',
      label: CHECK_LABEL.profit,
      status: 'bad',
      short: 'Zarar ediyor (son 12 ay)',
      long: 'Son 12 ayda zarar ediyor; F/K ve PEG hesaplanamaz.',
    });
  else
    C.push({
      id: 'profit',
      label: CHECK_LABEL.profit,
      status: 'warn',
      short: 'F/K verisi yok',
      long: 'Kaynakta F/K yok; son 12 ayın kârı buradan okunamıyor. Zarar da olabilir, veri eksik de.',
    });

  if (s.pe != null)
    C.push(
      s.pe <= th.maxPe
        ? {
            id: 'pe',
            label: CHECK_LABEL.pe,
            status: 'good',
            short: `F/K ${nf(s.pe, 1)} ≤ ${nf(th.maxPe, 0)}`,
            long: `F/K ${nf(s.pe)}, eşiğin (${nf(th.maxPe, 0)}) altında. Kâr sabit kalsa fiyatı yaklaşık ${nf(s.pe, 0)} yılda geri öder.`,
          }
        : {
            id: 'pe',
            label: CHECK_LABEL.pe,
            status: 'bad',
            short: `F/K ${nf(s.pe, 1)} > ${nf(th.maxPe, 0)}: pahalı`,
            long: `F/K ${nf(s.pe)}, eşiğin (${nf(th.maxPe, 0)}) üzerinde. Piyasa yüksek büyüme fiyatlıyor.`,
          },
    );

  if (s.pe != null) {
    if (s.peg == null)
      C.push({
        id: 'peg',
        label: CHECK_LABEL.peg,
        status: 'warn',
        short: 'PEG hesaplanamıyor',
        long: 'PEG hesaplanamıyor; büyüme oranı anlamlı değil (zarardan kâra geçiş veya veri yok).',
      });
    else if (s.peg < 0)
      C.push({
        id: 'peg',
        label: CHECK_LABEL.peg,
        status: 'bad',
        short: `PEG ${nf(s.peg)}: kâr düşüyor`,
        long: `PEG ${nf(s.peg)}: eksi değer kârın düştüğünü gösterir.`,
      });
    else if (s.peg <= 0.15)
      C.push({
        id: 'peg',
        label: CHECK_LABEL.peg,
        status: 'warn',
        short: `PEG ${nf(s.peg)}: şüpheli derecede düşük`,
        long: `PEG ${nf(s.peg)} olağandışı düşük; büyüme büyük olasılıkla baz etkisi veya tek seferlik kalemlerden.`,
      });
    else if (s.peg <= th.maxPeg)
      C.push({
        id: 'peg',
        label: CHECK_LABEL.peg,
        status: 'good',
        short: `PEG ${nf(s.peg)} ≤ ${nf(th.maxPeg, 1)}`,
        long: `PEG ${nf(s.peg)}, eşiğin (${nf(th.maxPeg, 1)}) altında: F/K büyümesine göre makul.`,
      });
    else
      C.push({
        id: 'peg',
        label: CHECK_LABEL.peg,
        status: 'bad',
        short: `PEG ${nf(s.peg)} > ${nf(th.maxPeg, 1)}: büyümeye göre pahalı`,
        long: `PEG ${nf(s.peg)}, eşiğin (${nf(th.maxPeg, 1)}) üzerinde: büyümeye göre pahalı.`,
      });
  }

  if (s.ebitdaGrowth == null)
    C.push({
      id: 'growthQuality',
      label: CHECK_LABEL.growthQuality,
      status: 'warn',
      short: `FAVÖK ${s.ebitdaGrowthNote || 'karşılaştırılamıyor'}`,
      long: `FAVÖK ${s.ebitdaGrowthNote || 'karşılaştırılamıyor'}; faaliyet büyümesi ölçülemiyor.`,
    });
  else if (s.ebitdaGrowth < th.minEbitdaGrowth)
    C.push({
      id: 'growthQuality',
      label: CHECK_LABEL.growthQuality,
      status: 'bad',
      short: `FAVÖK ${pct(s.ebitdaGrowth)}: faaliyet büyümüyor`,
      long: `FAVÖK büyümesi ${pct(s.ebitdaGrowth)}, eşiğin (${pct(th.minEbitdaGrowth)}) altında: faaliyetler büyümüyor.`,
    });
  else if (s.netIncomeGrowth == null)
    C.push({
      id: 'growthQuality',
      label: CHECK_LABEL.growthQuality,
      status: 'warn',
      short: `Net kâr ${s.netIncomeGrowthNote || 'karşılaştırılamıyor'}: baz etkisi`,
      long: `FAVÖK ${pct(s.ebitdaGrowth)} büyümüş; net kâr ${s.netIncomeGrowthNote || 'karşılaştırılamıyor'}, bu yüzden baz etkisi var.`,
    });
  else if (s.netIncomeGrowth > s.ebitdaGrowth + 50)
    C.push({
      id: 'growthQuality',
      label: CHECK_LABEL.growthQuality,
      status: 'warn',
      short: `Net kâr ${pct(s.netIncomeGrowth)}, FAVÖK ${pct(s.ebitdaGrowth)}: fark faaliyet dışı`,
      long: `Net kâr ${pct(s.netIncomeGrowth)}, FAVÖK ise ${pct(s.ebitdaGrowth)} büyümüş. Aradaki fark faaliyet dışı kalemlerden; kalıcı olmayabilir.`,
    });
  else
    C.push({
      id: 'growthQuality',
      label: CHECK_LABEL.growthQuality,
      status: 'good',
      short: `Büyüme faaliyetten (FAVÖK ${pct(s.ebitdaGrowth)})`,
      long: `FAVÖK ${pct(s.ebitdaGrowth)}, net kâr ${pct(s.netIncomeGrowth)}: büyüme faaliyetlerle uyumlu.`,
    });

  if (s.netDebtEbitda == null)
    C.push({
      id: 'debt',
      label: CHECK_LABEL.debt,
      status: 'warn',
      short: 'Borç verisi yok',
      long: 'Net borç/FAVÖK verisi yok; borç yükü bu kaynaktan ölçülemiyor.',
    });
  else if (s.netDebtEbitda <= th.maxNetDebtEbitda)
    C.push({
      id: 'debt',
      label: CHECK_LABEL.debt,
      status: 'good',
      short: s.netDebtEbitda < 0 ? 'Net nakit' : `Borç makul (${nf(s.netDebtEbitda, 1)}x)`,
      long:
        s.netDebtEbitda < 0
          ? `Net nakit pozisyonunda (Net borç/FAVÖK ${nf(s.netDebtEbitda)}).`
          : `Net borç/FAVÖK ${nf(s.netDebtEbitda)}, eşiğin (${nf(th.maxNetDebtEbitda, 1)}) altında.`,
    });
  else
    C.push({
      id: 'debt',
      label: CHECK_LABEL.debt,
      status: 'bad',
      short: `Borç yüksek (${nf(s.netDebtEbitda, 1)}x > ${nf(th.maxNetDebtEbitda, 1)})`,
      long: `Net borç/FAVÖK ${nf(s.netDebtEbitda)}, eşiğin (${nf(th.maxNetDebtEbitda, 1)}) üzerinde: borç yükü yüksek.`,
    });

  if (th.warnCyclical && s.cyclical)
    C.push({
      id: 'cyclical',
      label: CHECK_LABEL.cyclical,
      status: 'warn',
      short: 'Döngüsel sektör',
      long: `${s.industryTr} döngüsel bir sektör; bugünkü kâr ortalamanın üstünde veya altında olabilir.`,
    });

  const bad = C.some((c) => c.status === 'bad');
  const warn = C.filter((c) => c.status === 'warn').length;
  return { checks: C, verdict: bad ? 'bad' : warn ? 'warn' : 'good', warns: warn };
}

/** Tablo hücresi rengi: "v-good" | "v-warn" | "v-bad" | "" */
export function cellColor(
  key: 'pe' | 'peg' | 'netDebtEbitda' | 'ebitdaGrowth' | 'pb',
  val: number | null,
  th: Thresholds,
): string {
  if (val == null) return '';
  if (key === 'pe') return val <= th.maxPe ? 'v-good' : 'v-bad';
  if (key === 'peg') return val < 0 ? 'v-bad' : val <= 0.15 ? 'v-warn' : val <= th.maxPeg ? 'v-good' : 'v-bad';
  if (key === 'netDebtEbitda') return val <= th.maxNetDebtEbitda ? 'v-good' : 'v-bad';
  if (key === 'ebitdaGrowth') return val >= th.minEbitdaGrowth ? 'v-good' : 'v-bad';
  if (key === 'pb') return val < 1 ? 'v-good' : '';
  return '';
}
