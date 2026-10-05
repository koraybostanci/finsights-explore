/**
 * Uygulama: sekme listesi ve veri şeridi. Kabuk (sekmeler, adres, son sekme) @fintools/shared/shell'dedir.
 * Her sekme bir modüldür: mount(root) bir kez, refresh() sekme görünür olunca
 * ve sayfa genişliği değişince çağrılır.
 */

import '@fintools/shared/styles/tokens.css';
import '@fintools/shared/styles/layout.css';
import '@fintools/shared/styles/components.css';
import './styles/app.css';
import './styles/shared.css';

import { MARKETS, MARKET_LABEL, data, dataError, loadData, marketAsOf, marketHasData, on, storage } from './data/store.ts';
import { esc, fmtDate } from '@fintools/shared/format';
import { must } from '@fintools/shared/dom';
import { createApp, type TabDef } from '@fintools/shared/shell';

import * as screener from './screener/index.ts';
import * as banks from './banks/index.ts';
import * as calc from './calc/index.ts';
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
  // BIST ve ABD ayrı zamanlarda güncellenir; her piyasanın tarihi ve bilanço dönemi ayrı yazılır.
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
