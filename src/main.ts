/**
 * Uygulama kabuğu: başlık, veri şeridi, sekmeler.
 * Her sekme bir modüldür: mount(root) bir kez, refresh() sekme görünür olunca
 * ve sayfa genişliği değişince çağrılır.
 */

import './styles/app.css';
import './styles/shared.css';

import { data, dataError, loadData, lsGet, lsSet, on } from './data/store.ts';
import { esc, fmtDate } from './lib/format.ts';
import { must } from './lib/dom.ts';

import * as stories from './learn/stories.ts';
import * as multiples from './learn/multiples.ts';
import * as glossary from './learn/glossary.ts';
import * as steps from './learn/steps.ts';
import * as screener from './screener/index.ts';
import * as banks from './banks/index.ts';
import * as calc from './calc/index.ts';
import * as quiz from './quiz/index.ts';
import * as settings from './settings/index.ts';

interface TabModule {
  mount(root: HTMLElement): void;
  refresh?(): void;
}

interface TabDef {
  id: string;
  label: string;
  mod: TabModule;
}

const TABS: TabDef[] = [
  { id: 'senaryo', label: 'Senaryolar', mod: stories },
  { id: 'kavramlar', label: 'Çarpanlar', mod: multiples },
  { id: 'sozluk', label: 'Sözlük', mod: glossary },
  { id: 'adimlar', label: 'Karar adımları', mod: steps },
  { id: 'tarayici', label: 'Tarayıcı', mod: screener },
  { id: 'bankalar', label: 'Bankalar', mod: banks },
  { id: 'hesap', label: 'Kendi hesabın', mod: calc },
  { id: 'sina', label: 'Kendini sına', mod: quiz },
  { id: 'ayarlar', label: 'Ayarlar', mod: settings },
];

const DEFAULT_TAB = 'senaryo';
let current = DEFAULT_TAB;

function buildShell(): void {
  const row = must('tabrow');
  const panels = must('panels');
  row.innerHTML = TABS.map(
    (t) =>
      `<button class="tab" role="tab" type="button" data-tab="${t.id}" id="t-${t.id}" aria-controls="${t.id}" aria-selected="false">${esc(t.label)}</button>`,
  ).join('');
  panels.innerHTML = TABS.map(
    (t) => `<section class="panel stack-lg" id="${t.id}" role="tabpanel" aria-labelledby="t-${t.id}" hidden></section>`,
  ).join('');
  row.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.tab');
    if (!b?.dataset.tab) return;
    show(b.dataset.tab);
    try {
      history.replaceState(null, '', '#' + b.dataset.tab);
    } catch {
      /* dosyadan açılmışsa adres değişmeyebilir */
    }
    window.scrollTo({ top: 0 });
  });
}

/** Bir sekmeyi gösterir. Başka modüller de çağırabilir: location.hash = '#ayarlar' yeterlidir. */
function show(id: string): void {
  const tab = TABS.find((t) => t.id === id) ?? TABS[0];
  current = tab.id;
  for (const t of TABS) {
    must(t.id).hidden = t.id !== current;
    must('t-' + t.id).setAttribute('aria-selected', String(t.id === current));
  }
  lsSet('tab', current);
  refreshCurrent();
}

function refreshCurrent(): void {
  const tab = TABS.find((t) => t.id === current);
  try {
    tab?.mod.refresh?.();
  } catch (e) {
    console.error(e);
  }
}

function renderDataBar(): void {
  const d = data();
  const meta = must('datameta');
  const note = must('datanote');
  const err = dataError();
  if (err || !d.asOf) {
    meta.innerHTML = `<span class="pill bad">✕ Veri yüklenemedi</span>`;
    note.textContent = err
      ? `Veri dosyası okunamadı (${err}). Hikâyeler ve hesaplayıcı çalışır; tarayıcı boş kalır.`
      : 'Veri dosyası boş.';
    must('footsrc').textContent = '';
    return;
  }
  const period = d.period.BIST ? `<span>Bilanço dönemi: <b>${esc(d.period.BIST)}</b></span>` : '';
  meta.innerHTML = `<span>Veri: <b>${esc(fmtDate(d.asOf))}</b></span><span>Kaynak: <b>${esc(d.source)}</b></span>${period}`;
  note.textContent = 'Veriler her iş günü kapanıştan sonra kendiliğinden güncellenir.';
  must('footsrc').textContent = `Veri kaynağı: ${d.source}.`;
}

function mountAll(): void {
  for (const t of TABS) {
    try {
      t.mod.mount(must(t.id));
    } catch (e) {
      console.error(e);
      must(t.id).innerHTML = `<p class="note">Bu bölüm açılırken bir hata oluştu. Sayfayı yenilemeyi deneyin.</p>`;
    }
  }
}

function watchResize(): void {
  let timer: number | undefined;
  let lastW = 0;
  const wrap = document.querySelector('.wrap');
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(refreshCurrent, 120);
  };
  if (wrap && 'ResizeObserver' in window) {
    new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w === lastW) return;
      lastW = w;
      later();
    }).observe(wrap);
  } else {
    window.addEventListener('resize', later);
  }
}

async function start(): Promise<void> {
  buildShell();
  await loadData();
  renderDataBar();
  on('data', renderDataBar);
  mountAll();

  const fromHash = (location.hash || '').slice(1);
  const initial = TABS.some((t) => t.id === fromHash) ? fromHash : lsGet<string>('tab', DEFAULT_TAB);
  show(initial);

  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').slice(1);
    if (TABS.some((t) => t.id === id) && id !== current) show(id);
  });
  watchResize();
}

void start();
