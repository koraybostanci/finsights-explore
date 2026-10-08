/**
 * App entry: the tab list and the data bar. The shell (tabs, URL hash, last-tab memory)
 * lives in @fintools/shared/shell.
 * Each tab is a module: mount(root) is called once, refresh() whenever the tab becomes
 * visible or the page width changes.
 */

import '@fintools/shared/styles/tokens.css';
import '@fintools/shared/styles/layout.css';
import '@fintools/shared/styles/components.css';
import './styles/screener.css';

import { MARKETS, MARKET_LABEL, data, dataError, loadData, marketAsOf, marketHasData, on, storage } from './data/store.ts';
import { esc, fmtDate } from '@fintools/shared/format';
import { must } from '@fintools/shared/dom';
import { createApp, type TabDef } from '@fintools/shared/shell';
import { mountSiblingLink } from '@fintools/shared/sites';

import * as screener from './screener/index.ts';
import * as banks from './banks/index.ts';
import * as calc from './calculator/index.ts';
import * as settings from './settings/index.ts';

const TABS: TabDef[] = [
  { id: 'screener', label: 'Tarayıcı', mod: screener },
  { id: 'banks', label: 'Bankalar', mod: banks },
  { id: 'calculator', label: 'Kendi hesabın', mod: calc },
  { id: 'settings', label: 'Ayarlar', mod: settings },
];

function renderDataBar(): void {
  const d = data();
  const meta = must('datameta');
  const note = must('datanote');
  const err = dataError();
  if (err || !d.asOf) {
    meta.innerHTML = `<span class="pill bad">✕ Veri yüklenemedi</span>`;
    note.textContent = err
      ? `Veri dosyası okunamadı (${err}). Hesaplayıcı çalışır; tarayıcı boş kalır.`
      : 'Veri dosyası boş.';
    must('footsrc').textContent = '';
    return;
  }
  // BIST and US data are refreshed at different times, so each market shows its own date and reporting period.
  const live = MARKETS.filter(marketHasData);
  const one = live.length <= 1;
  const dates = live.length
    ? live.map((m) => `${one ? '' : esc(MARKET_LABEL[m]) + ' '}<b>${esc(fmtDate(marketAsOf(m)))}</b>`).join(', ')
    : `<b>${esc(fmtDate(d.asOf))}</b>`;
  const periods = live
    .filter((m) => d.period[m])
    .map((m) => `${one ? '' : esc(MARKET_LABEL[m]) + ' '}<b>${esc(d.period[m] ?? '')}</b>`)
    .join(', ');
  const waiting = MARKETS.filter((m) => !marketHasData(m) && d.stocks.some((s) => s.market === m));
  meta.innerHTML =
    `<span>Veri: ${dates}</span><span>Kaynak: <b>${esc(d.source)}</b></span>` +
    (periods ? `<span>Bilanço dönemi: ${periods}</span>` : '') +
    (waiting.length ? `<span>${esc(waiting.map((m) => MARKET_LABEL[m]).join(', '))}: veri bekliyor</span>` : '');
  note.textContent = 'Veriler her iş günü kapanıştan sonra kendiliğinden güncellenir.';
  must('footsrc').textContent = `Veri kaynağı: ${d.source}.`;
}

mountSiblingLink('learn', 'Hisse Değerleme Rehberi (Valuation Guide)');
void createApp({
  tabs: TABS,
  defaultTab: 'screener',
  storage,
  beforeMount: async () => {
    await loadData();
    renderDataBar();
    on('data', renderDataBar);
  },
});
