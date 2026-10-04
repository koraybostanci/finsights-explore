/**
 * Ayarlar sekmesi: yapay zekâ sağlayıcısı (kendi API anahtarınızla) ve
 * Hisselerim (BIST ve ABD listeleri ayrı).
 *
 * Anahtar yalnızca bu tarayıcıda saklanır; ekrana yazdırılmaz, adrese eklenmez.
 */

import './settings.css';

import { MARKETS, MARKET_LABEL, lsGet, lsSet, on, resetWatchlist, setWatchlist, universe, watchlist } from '../data/store.ts';
import { esc } from '@fintools/shared/format';
import { groupByIndustry } from '../lib/stats.ts';
import { term } from '@fintools/shared/terms';
import type { MarketId } from '../types.ts';

import { aiErrorMessage } from '../ai/index.ts';
import { listModels, testConnection } from '../ai/client.ts';
import {
  clearKey,
  getBaseUrl,
  getKey,
  getModel,
  getModelList,
  getProvider,
  setBaseUrl,
  setKey,
  setModel,
  setProvider,
  status as aiStatus,
} from '../ai/config.ts';
import { PROVIDERS, checkBaseUrl, isProviderId, providerDef } from '../ai/providers.ts';

import { addTicker, notInList, removeTicker, searchUniverse } from './logic.ts';

let root: HTMLElement | null = null;

/* ---------- Yapay zekâ bölümü ---------- */

type Note = { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'ok'; text: string } | { kind: 'err'; text: string };

let note: Note = { kind: 'idle' };
let showKey = false;
let manualModel = false;
const MANUAL = '__manual__';

function noteHtml(): string {
  if (note.kind === 'idle') return '';
  if (note.kind === 'busy') return `<span class="spin" aria-hidden="true"></span><span>${esc(note.text)}</span>`;
  if (note.kind === 'ok') return `<span class="pill good">✓ ${esc(note.text)}</span>`;
  return `<span class="pill bad">✕ Olmadı</span><span>${esc(note.text)}</span>`;
}

function modelControl(): string {
  const p = getProvider();
  const current = getModel(p);
  const list = getModelList(p);
  if (!list.length || manualModel) {
    const back = list.length
      ? ` <button type="button" class="st-link" id="st-model-list">Listeden seç</button>`
      : '';
    return `<input type="text" id="st-model" value="${esc(current)}" placeholder="Model kimliğini yazın" autocomplete="off" spellcheck="false">
      <small>${list.length ? 'Model kimliğini elle yazıyorsunuz.' : 'Liste, anahtar girilince sağlayıcıdan alınır; model kimliğini elle de yazabilirsiniz.'}${back}</small>`;
  }
  const all = current && !list.includes(current) ? [current, ...list] : list;
  const opts = [
    `<option value=""${current ? '' : ' selected'}>Model seçin…</option>`,
    ...all.map((m) => `<option value="${esc(m)}"${m === current ? ' selected' : ''}>${esc(m)}</option>`),
    `<option value="${MANUAL}">Elle yaz…</option>`,
  ].join('');
  return `<select id="st-model">${opts}</select><small>${all.length} model listelendi. Listede yoksa "Elle yaz" ile kimliğini girebilirsiniz.</small>`;
}

function aiHtml(): string {
  const p = getProvider();
  const def = providerDef(p);
  const key = getKey(p);
  const radios = PROVIDERS.map(
    (d) =>
      `<label class="opt${d.id === p ? ' sel' : ''}"><input type="radio" name="st-prov" value="${d.id}"${
        d.id === p ? ' checked' : ''
      }><span>${esc(d.label)}<small>${esc(d.vendor)}</small></span></label>`,
  ).join('');

  const baseField =
    p === 'custom'
      ? `<div class="ctl"><label for="st-base">Adres <span class="en">(Base URL)</span></label>
          <input type="url" id="st-base" value="${esc(getBaseUrl())}" placeholder="https://ornek.com/v1" autocomplete="off" spellcheck="false">
          <small id="st-base-msg">OpenAI uyumlu bir uç nokta. Yerel modeller için http://localhost da olur.</small></div>`
      : '';

  const keyLabel = def.keyRequired ? '' : ' <span class="en">isteğe bağlı</span>';
  const corsNote = def.corsVerified
    ? ''
    : `<p class="muted small">${esc(def.label)} için tarayıcıdan doğrudan çağrı (CORS) doğrulanmadı. "Bağlantıyı sına" ağ hatası verirse sağlayıcı tarayıcı isteklerine izin vermiyor olabilir.</p>`;

  return `
    <h3>${term('aiProvider')}</h3>
    <p class="read">Kendi API anahtarınızı <span class="en">(API key)</span> girin; aşağıdaki üç özellik bu sağlayıcıyı ve seçtiğiniz modeli kullanır. Anahtar olmadan da tüm rakamlar, kural tabanlı gerekçeler ve hazır sorular çalışır.</p>
    <div class="box">
      <div class="opts" role="radiogroup" aria-label="Sağlayıcı">${radios}</div>
      <div class="fields">
        ${baseField}
        <div class="ctl"><label for="st-key">${term('apiKey')}${keyLabel}</label>
          <div class="st-keyrow">
            <input type="${showKey ? 'text' : 'password'}" id="st-key" value="${esc(key)}" placeholder="Anahtarınızı yapıştırın" autocomplete="off" spellcheck="false">
            <button type="button" class="btn" id="st-key-show" aria-pressed="${showKey}">${showKey ? 'Gizle' : 'Göster'}</button>
          </div>
          <small>Yalnızca bu tarayıcıda saklanır.</small></div>
        <div class="ctl"><label for="st-model">Model</label>${modelControl()}</div>
      </div>
      <div class="toolbar">
        <button type="button" class="btn primary" id="st-test">Bağlantıyı sına</button>
        <button type="button" class="btn" id="st-models">Modelleri getir</button>
        <button type="button" class="btn" id="st-key-del"${key ? '' : ' disabled'}>Anahtarı sil</button>
        <div class="st-status" id="st-status" role="status" aria-live="polite">${noteHtml()}</div>
      </div>
      ${corsNote}
    </div>
    <p class="note">Anahtar depoya ya da bir sunucuya gönderilmez; istekler tarayıcınızdan doğrudan sağlayıcıya gider. Bir github.io adresinde aynı hesabın bütün projeleri tarayıcı belleğini paylaşır; bu yüzden anahtara harcama sınırı koymak ya da siteyi kendi alan adınızdan yayınlamak daha güvenlidir.</p>
    <div class="howto">
      <div><b>Hisse yorumu</b>Tarayıcıda açtığınız hissenin çarpanlarını ve hareketli ortalamalarını hikâyelerin diliyle açıklar.</div>
      <div><b>Sektör karşılaştırması</b>Aynı piyasada aynı sektördeki hisseleri yan yana okur, farkların ne anlama gelebileceğini söyler.</div>
      <div><b>Kendini sına</b>Öğrendiklerinizi listenizdeki gerçek hisselere uygulatan yeni sorular üretir.</div>
    </div>`;
}

function renderAi(): void {
  const el = root?.querySelector<HTMLElement>('#st-ai');
  if (el) el.innerHTML = aiHtml();
}

function setNote(n: Note): void {
  note = n;
  const el = root?.querySelector<HTMLElement>('#st-status');
  if (el) el.innerHTML = noteHtml();
}

/** Alanlardaki son değerleri kaydeder (düğmeye basılmadan önce yazılmış olabilir). */
function saveFields(): void {
  const p = getProvider();
  const key = root?.querySelector<HTMLInputElement>('#st-key');
  if (key && key.value.trim() !== getKey(p)) setKey(p, key.value);
  const base = root?.querySelector<HTMLInputElement>('#st-base');
  if (base && base.value.trim() !== getBaseUrl()) setBaseUrl(base.value);
  const model = root?.querySelector<HTMLInputElement | HTMLSelectElement>('#st-model');
  if (model && model.value !== MANUAL && model.value.trim() !== getModel(p)) setModel(p, model.value);
}

async function fetchModels(silent = false): Promise<void> {
  saveFields();
  const p = getProvider();
  setNote({ kind: 'busy', text: 'Modeller alınıyor…' });
  try {
    const models = await listModels();
    if (getProvider() !== p) return;
    manualModel = false;
    note = models.length
      ? { kind: 'ok', text: `${models.length} model bulundu${getModel(p) ? '' : '; birini seçin'}` }
      : { kind: 'err', text: 'Sağlayıcı model listesi döndürmedi. Model kimliğini elle yazabilirsiniz.' };
    renderAi();
  } catch (e) {
    if (getProvider() !== p) return;
    if (silent) setNote({ kind: 'idle' });
    else setNote({ kind: 'err', text: aiErrorMessage(e) });
  }
}

async function runTest(): Promise<void> {
  saveFields();
  const st = aiStatus();
  if (!st.configured) {
    const p = getProvider();
    const def = providerDef(p);
    const missing =
      p === 'custom' && !checkBaseUrl(getBaseUrl()).ok
        ? 'Önce geçerli bir adres girin.'
        : def.keyRequired && !getKey(p)
          ? 'Önce API anahtarını girin.'
          : 'Önce bir model seçin ya da model kimliğini yazın.';
    setNote({ kind: 'err', text: missing });
    return;
  }
  setNote({ kind: 'busy', text: 'Sağlayıcıya kısa bir istek gönderiliyor…' });
  const btn = root?.querySelector<HTMLButtonElement>('#st-test');
  if (btn) btn.disabled = true;
  try {
    await testConnection();
    setNote({ kind: 'ok', text: `Bağlantı kuruldu: ${st.providerLabel} (${st.model})` });
  } catch (e) {
    setNote({ kind: 'err', text: aiErrorMessage(e) });
  } finally {
    if (btn) btn.disabled = false;
  }
}

function onAiChange(e: Event): void {
  const t = e.target as HTMLElement;
  if (t instanceof HTMLInputElement && t.name === 'st-prov') {
    if (isProviderId(t.value)) {
      setProvider(t.value);
      note = { kind: 'idle' };
      showKey = false;
      manualModel = false;
      renderAi();
    }
    return;
  }
  const p = getProvider();
  if (t.id === 'st-key' && t instanceof HTMLInputElement) {
    setKey(p, t.value);
    const del = root?.querySelector<HTMLButtonElement>('#st-key-del');
    if (del) del.disabled = !t.value.trim();
    if (t.value.trim() && !getModelList(p).length) void fetchModels(true);
    return;
  }
  if (t.id === 'st-base' && t instanceof HTMLInputElement) {
    const msg = root?.querySelector<HTMLElement>('#st-base-msg');
    const check = checkBaseUrl(t.value);
    if (!t.value.trim()) {
      setBaseUrl('');
      if (msg) msg.textContent = 'OpenAI uyumlu bir uç nokta. Yerel modeller için http://localhost da olur.';
    } else if (check.ok) {
      setBaseUrl(check.url);
      t.value = check.url;
      if (msg) msg.textContent = 'Adres kaydedildi.';
    } else if (msg) {
      msg.textContent = check.reason;
    }
    return;
  }
  if (t.id === 'st-model' && (t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) {
    if (t.value === MANUAL) {
      manualModel = true;
      renderAi();
      root?.querySelector<HTMLInputElement>('#st-model')?.focus();
      return;
    }
    setModel(p, t.value);
    if (note.kind !== 'idle') setNote({ kind: 'idle' });
  }
}

function onAiClick(e: Event): void {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b) return;
  if (b.id === 'st-key-show') {
    saveFields();
    showKey = !showKey;
    renderAi();
    root?.querySelector<HTMLInputElement>('#st-key')?.focus();
  } else if (b.id === 'st-test') {
    void runTest();
  } else if (b.id === 'st-models') {
    void fetchModels();
  } else if (b.id === 'st-key-del') {
    clearKey(getProvider());
    note = { kind: 'ok', text: 'Anahtar silindi' };
    showKey = false;
    renderAi();
  } else if (b.id === 'st-model-list') {
    manualModel = false;
    renderAi();
  }
}

/* ---------- Hisselerim ---------- */

let addMarket: MarketId = 'BIST';
let query = '';

function hitsHtml(): string {
  const all = universe(addMarket);
  if (!all.length) return `<span class="muted">${esc(MARKET_LABEL[addMarket])} için evrende hisse yok.</span>`;
  const out = notInList(all, watchlist(addMarket));
  if (!out.length) return `<span class="muted">${esc(MARKET_LABEL[addMarket])} evrenindeki bütün hisseler listenizde.</span>`;
  if (!query.trim())
    return `<span class="muted">Listenizde olmayan ${out.length} hisse var. Eklemek için sembol ya da şirket adı yazın.</span>`;
  const hits = searchUniverse(out, query, 8);
  if (!hits.length) return `<span class="muted">Eşleşen hisse yok. Evrende olmayan bir hisse aşağıdaki notta anlatıldığı gibi eklenir.</span>`;
  return hits
    .map(
      (s) =>
        `<button type="button" class="btn st-hit" data-add="${esc(s.symbol)}"><b>${esc(s.symbol)}</b><span>${esc(s.name)}</span><i>Ekle</i></button>`,
    )
    .join('');
}

function marketHtml(m: MarketId): string {
  const all = universe(m);
  const mine = new Set(watchlist(m));
  const list = all.filter((s) => mine.has(s.symbol));
  const groups = groupByIndustry(list);
  const body = groups.length
    ? `<div class="tr-list">${groups
        .map(
          (g) =>
            `<div><b>${esc(g.industryTr)} <span class="en">${esc(g.industryEn)}</span></b><span class="chips">${g.stocks
              .map(
                (s) =>
                  `<span class="chip${s.hasData ? '' : ' wait'}" title="${esc(s.name)}${s.hasData ? '' : ' · veri bekliyor'}">${esc(
                    s.symbol,
                  )}<button type="button" data-rm="${esc(s.symbol)}" data-m="${m}" aria-label="${esc(s.symbol)} hissesini çıkar">✕</button></span>`,
              )
              .join('')}</span></div>`,
        )
        .join('')}</div>`
    : `<p class="muted small">${
        all.length ? 'Bu listede hisse yok. Yukarıdan arayıp ekleyin ya da "Tümünü seç" deyin.' : 'Bu piyasa için evrende hisse yok.'
      }</p>`;
  return `
    <div class="headrow">
      <div class="mktname">${esc(MARKET_LABEL[m])}<span class="en">${list.length} / ${all.length} hisse</span></div>
      <div class="toolbar">
        <button type="button" class="st-link" data-all="${m}">Tümünü seç</button>
        <button type="button" class="st-link" data-none="${m}">Listeyi boşalt</button>
      </div>
    </div>
    ${body}`;
}

function watchlistHtml(): string {
  const waiting = MARKETS.some((m) => universe(m).some((s) => !s.hasData));
  return `
    <h3>${term('watchlist')}</h3>
    <p class="read">Tarayıcıda ve Kendini sına'da kullanılacak hisseleri seçin. BIST ve ABD listeleri ayrı tutulur; her liste kendi içinde sektörlere göre gruplanır ve aynı sektördekiler yan yana kıyaslanır.</p>
    <div class="box">
      <div class="st-add">
        <div class="ctl" style="flex:0 0 140px"><label for="st-mkt">${term('market')}</label>
          <select id="st-mkt">${MARKETS.map(
            (m) => `<option value="${m}"${m === addMarket ? ' selected' : ''}>${esc(MARKET_LABEL[m])}</option>`,
          ).join('')}</select></div>
        <div class="ctl" style="flex:1 1 320px"><label for="st-q">Hisse ekle</label>
          <input type="search" id="st-q" value="${esc(query)}" placeholder="Sembol ya da şirket adı" autocomplete="off" spellcheck="false"></div>
      </div>
      <div class="st-hits" id="st-hits" role="status" aria-live="polite">${hitsHtml()}</div>
      <div id="st-lists" class="stack">${MARKETS.map(marketHtml).join('')}</div>
    </div>
    <p class="muted small">${
      waiting ? 'Kesikli çerçeveli hisselerin verisi henüz gelmedi; ilk veri güncellemesinde dolar. ' : ''
    }Aradığınız hisse evrende yoksa depodaki config/stocks.json dosyasına bir satır eklenir; bir sonraki veri güncellemesinde gelir.</p>`;
}

function renderWatchlist(keepFocus = false): void {
  const el = root?.querySelector<HTMLElement>('#st-wl');
  if (!el) return;
  if (keepFocus) {
    const hits = el.querySelector<HTMLElement>('#st-hits');
    const lists = el.querySelector<HTMLElement>('#st-lists');
    if (hits && lists) {
      hits.innerHTML = hitsHtml();
      lists.innerHTML = MARKETS.map(marketHtml).join('');
      return;
    }
  }
  el.innerHTML = watchlistHtml();
}

function onWlInput(e: Event): void {
  const t = e.target as HTMLElement;
  if (t.id === 'st-q' && t instanceof HTMLInputElement) {
    query = t.value;
    const hits = root?.querySelector<HTMLElement>('#st-hits');
    if (hits) hits.innerHTML = hitsHtml();
  } else if (t.id === 'st-mkt' && t instanceof HTMLSelectElement) {
    addMarket = t.value === 'US' ? 'US' : 'BIST';
    lsSet('settings.addMarket', addMarket);
    const hits = root?.querySelector<HTMLElement>('#st-hits');
    if (hits) hits.innerHTML = hitsHtml();
  }
}

function onWlClick(e: Event): void {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b) return;
  const add = b.dataset.add;
  const rm = b.dataset.rm;
  if (add) {
    setWatchlist(addMarket, addTicker(watchlist(addMarket), add));
  } else if (rm) {
    const m: MarketId = b.dataset.m === 'US' ? 'US' : 'BIST';
    setWatchlist(m, removeTicker(watchlist(m), rm));
  } else if (b.dataset.all) {
    resetWatchlist(b.dataset.all === 'US' ? 'US' : 'BIST');
  } else if (b.dataset.none) {
    setWatchlist(b.dataset.none === 'US' ? 'US' : 'BIST', []);
  }
}

/* ---------- Kurulum ---------- */

export function mount(el: HTMLElement): void {
  root = el;
  addMarket = lsGet<string>('settings.addMarket', 'BIST') === 'US' ? 'US' : 'BIST';
  el.innerHTML = `
    <h2>Ayarlar</h2>
    <div class="stack st-ai" id="st-ai"></div>
    <div class="stack st-wl" id="st-wl"></div>`;
  renderAi();
  renderWatchlist();

  const ai = el.querySelector<HTMLElement>('#st-ai');
  ai?.addEventListener('change', onAiChange);
  ai?.addEventListener('click', onAiClick);
  const wl = el.querySelector<HTMLElement>('#st-wl');
  wl?.addEventListener('input', onWlInput);
  wl?.addEventListener('click', onWlClick);

  on('data', () => renderWatchlist());
  on('watchlist', () => renderWatchlist(true));
}

export function refresh(): void {
  /* çizim yok; içerik olaylarla güncellenir */
}
