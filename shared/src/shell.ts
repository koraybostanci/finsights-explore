/**
 * App shell: tab row, panels, hash routing and the last open tab.
 *
 * Each tab is a module: mount(root) is called once, refresh() when the tab becomes
 * visible and when the page width changes. The page provides #tabrow, #panels and .wrap.
 * Other modules switch tabs with a plain link or `location.hash = '#settings'`.
 */

import { esc } from './format.ts';
import { must } from './dom.ts';
import type { AppStorage } from './storage.ts';

export interface TabModule {
  mount(root: HTMLElement): void;
  refresh?(): void;
}

export interface TabDef {
  id: string;
  label: string;
  mod: TabModule;
}

export interface AppOptions {
  tabs: TabDef[];
  /** Opened when neither the URL hash nor storage names a tab. */
  defaultTab: string;
  /** Remembers the last open tab under the key `tab`. */
  storage: Pick<AppStorage, 'lsGet' | 'lsSet'>;
  /** Runs after the tab row is built and before the tabs mount, e.g. to load data. */
  beforeMount?: () => void | Promise<void>;
}

/** Builds the shell, runs beforeMount, mounts every tab and opens the first one. */
export async function createApp({ tabs, defaultTab, storage, beforeMount }: AppOptions): Promise<void> {
  let current = defaultTab;

  function buildShell(): void {
    const row = must('tabrow');
    const panels = must('panels');
    row.innerHTML = tabs
      .map(
        (t) =>
          `<button class="tab" role="tab" type="button" data-tab="${t.id}" id="t-${t.id}" aria-controls="${t.id}" aria-selected="false">${esc(t.label)}</button>`,
      )
      .join('');
    panels.innerHTML = tabs
      .map((t) => `<section class="panel stack-lg" id="${t.id}" role="tabpanel" aria-labelledby="t-${t.id}" hidden></section>`)
      .join('');
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

  /** Bir sekmeyi gösterir. Başka modüller de çağırabilir: location.hash = '#settings' yeterlidir. */
  function show(id: string): void {
    const tab = tabs.find((t) => t.id === id) ?? tabs[0];
    current = tab.id;
    for (const t of tabs) {
      must(t.id).hidden = t.id !== current;
      must('t-' + t.id).setAttribute('aria-selected', String(t.id === current));
    }
    storage.lsSet('tab', current);
    refreshCurrent();
  }

  function refreshCurrent(): void {
    const tab = tabs.find((t) => t.id === current);
    try {
      tab?.mod.refresh?.();
    } catch (e) {
      console.error(e);
    }
  }

  function mountAll(): void {
    for (const t of tabs) {
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

  buildShell();
  await beforeMount?.();
  mountAll();

  const fromHash = (location.hash || '').slice(1);
  const initial = tabs.some((t) => t.id === fromHash) ? fromHash : storage.lsGet<string>('tab', defaultTab);
  show(initial);

  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').slice(1);
    if (tabs.some((t) => t.id === id) && id !== current) {
      show(id);
      // Sayfa içi bağlantıyla gelindi (ör. "Ayarlar'da açabilirsiniz"): yeni sekme baştan okunur.
      window.scrollTo({ top: 0 });
    }
  });
  watchResize();
}
