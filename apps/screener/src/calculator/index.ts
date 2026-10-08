/**
 * Calculator tab ("Kendi hesabın"): computes the multiples and the screener's checks
 * instantly from a few balance-sheet figures. The thresholds are shared with the
 * screener (screener/thresholds.ts).
 */

import './calculator.css';

import { ICON, VLABEL } from '../lib/evaluate.ts';
import { esc, nf } from '@fintools/shared/format';
import { getThresholds, subscribeThresholds } from '../screener/thresholds.ts';
import { BIM_EXAMPLE, calcEvaluate, isLoss } from './logic.ts';
import type { CalcInput } from './logic.ts';

let root: HTMLElement | null = null;

const E = BIM_EXAMPLE;

function shellHtml(): string {
  return `<div class="stack read">
<h2>Kendi hesabın</h2>
<p>Herhangi bir hissenin bilanço <span class="en">(balance sheet)</span> ve gelir tablosundan <span class="en">(income statement)</span> birkaç rakam girin; çarpanlar <span class="en">(multiples)</span> ve tarayıcıdaki ölçütler anında hesaplanır. Rakamları KAP'taki finansal tablolardan ya da bir veri sitesinden alabilirsiniz. Tüm tutarları aynı birimde girin (örneğin milyar TL).</p>
<p class="note">Örnek olarak BİM'in yaklaşık rakamları dolu geliyor. Kendi hissenizin rakamlarıyla değiştirin.</p>
</div>
<div class="calc">
<div class="controls" id="calcin">
<div class="ctl"><label for="calc-market-cap">Piyasa değeri <span class="en">(Market cap)</span></label><input type="number" id="calc-market-cap" step="any" value="${E.marketCap}"><small>Hisse fiyatı × pay sayısı</small></div>
<div class="ctl"><label for="calc-net-income">Yıllık net kâr <span class="en">(Net income, TTM)</span></label><input type="number" id="calc-net-income" step="any" value="${E.netIncome}"><small>Son 12 ay, ana ortaklık payı</small></div>
<div class="ctl"><label for="calc-equity">Özkaynak <span class="en">(Equity)</span></label><input type="number" id="calc-equity" step="any" value="${E.equity}"><small>Bilançodaki toplam özkaynak</small></div>
<div class="ctl"><label for="calc-ebitda">Yıllık FAVÖK <span class="en">(EBITDA)</span></label><input type="number" id="calc-ebitda" step="any" value="${E.ebitda}"><small>Faiz, vergi, amortisman öncesi kâr</small></div>
<div class="ctl"><label for="calc-net-debt">Net borç <span class="en">(Net debt)</span></label><input type="number" id="calc-net-debt" step="any" value="${E.netDebt}"><small>Finansal borç − nakit (eksi olabilir)</small></div>
<div class="ctl"><label for="calc-net-income-growth">Net kâr büyümesi % <span class="en">(Net income growth)</span></label><input type="number" id="calc-net-income-growth" step="any" value="${E.netIncomeGrowth}"><small>PEG için kullanılır</small></div>
<div class="ctl"><label for="calc-ebitda-growth">FAVÖK büyümesi % <span class="en">(EBITDA growth)</span></label><input type="number" id="calc-ebitda-growth" step="any" value="${E.ebitdaGrowth}"><small>Büyümenin kalitesi için</small></div>
<div class="ctl check"><input type="checkbox" id="calc-cyc"${E.cyc ? ' checked' : ''}><label for="calc-cyc">Döngüsel sektör <span class="en">(Cyclical)</span><small>Emtia, metal, rafineri vb.</small></label></div>
</div>
<div class="out" id="calcout" aria-live="polite"></div>
</div>`;
}

function readInput(): CalcInput {
  const num = (id: string): number => {
    const el = root?.querySelector<HTMLInputElement>('#' + id);
    return el ? parseFloat(el.value) : NaN;
  };
  return {
    marketCap: num('calc-market-cap'),
    netIncome: num('calc-net-income'),
    equity: num('calc-equity'),
    ebitda: num('calc-ebitda'),
    netDebt: num('calc-net-debt'),
    netIncomeGrowth: num('calc-net-income-growth'),
    ebitdaGrowth: num('calc-ebitda-growth'),
    cyc: !!root?.querySelector<HTMLInputElement>('#calc-cyc')?.checked,
  };
}

function render(): void {
  const out = root?.querySelector<HTMLElement>('#calcout');
  if (!out) return;
  const input = readInput();
  const { m, ev } = calcEvaluate(input, getThresholds());
  const tile = (k: string, en: string, v: string): string =>
    `<div><div class="k">${esc(k)}<span class="en">${esc(en)}</span></div><div class="v">${esc(v)}</div></div>`;
  out.innerHTML = `<div class="tiles">
${tile('F/K', 'P/E', m.pe == null ? (isLoss(input) ? 'zarar' : '–') : nf(m.pe))}
${tile('PD/DD', 'P/B', nf(m.pb))}
${tile('FD/FAVÖK', 'EV/EBITDA', nf(m.evEbitda))}
${tile('PEG', 'PEG ratio', nf(m.peg))}
${tile('ÖK kârlılığı', 'ROE', m.roe == null ? '–' : '%' + nf(m.roe, 1))}
${tile('Net borç/FAVÖK', 'Net debt/EBITDA', nf(m.netDebtEbitda))}
</div>
<div><span class="pill ${ev.verdict}">${ICON[ev.verdict]} ${esc(VLABEL[ev.verdict])}${
    ev.verdict === 'warn' ? ` (${ev.warns})` : ''
  }</span> <span class="muted small">Tarayıcıdaki eşiklere göre</span></div>
<ul class="calc-checks">${ev.checks
    .map(
      (c) =>
        `<li><span class="ico ${c.status}" aria-hidden="true">${ICON[c.status]}</span><span><b>${esc(c.label)}:</b> ${esc(c.long)}</span></li>`,
    )
    .join('')}</ul>
<p class="muted small">Örnekteki rakamlar 2 Ekim 2026 verisindendir. Fintables o tarihte BİM için PEG'i 0,38 gösteriyordu; bu da yaklaşık %44 net kâr büyümesine denk gelir. 2026/6 dönem karşılaştırmasında artış %103'tür. Kaynaklar farklı dönemler kullanabilir; PEG'e bakarken hangi büyümenin kullanıldığını sorun.</p>`;
}

export function mount(el: HTMLElement): void {
  root = el;
  el.innerHTML = shellHtml();
  el.querySelector('#calcin')?.addEventListener('input', render);
  subscribeThresholds(render);
  render();
}

export function refresh(): void {
  render();
}
