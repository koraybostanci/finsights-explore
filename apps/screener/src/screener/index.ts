/**
 * Screener tab: tests the watchlist of one market (BIST or US) against six checks.
 * There are two views:
 *   - Industry comparison: the stocks of the selected industry, the industry median,
 *     a strip chart and an optional AI comparison.
 *   - Full list: the table from the first release (with the reasons column).
 * BIST and US stocks never meet in the same table, chart or median.
 */

import './screener.css';

import { aiErrorMessage, aiStatus, commentStock, compareIndustry } from '../ai/index.ts';
import type { AiText } from '../ai/index.ts';
import { MARKET_LABEL, industry, loadPrices, lsGet, lsSet, marketAsOf, on, sid, stocks } from '../data/store.ts';
import { cw } from '@fintools/shared/dom';
import { DEF } from '../lib/evaluate.ts';
import { esc, fmtDate } from '@fintools/shared/format';
import { groupByIndustry, industryMedian } from '../lib/stats.ts';
import type { IndustryMedian, MarketId, PriceSeries, StockView, Thresholds } from '../types.ts';
import { commentBlockHtml, compareBlockHtml } from './ai-ui.ts';
import type { AiSlot } from './ai-ui.ts';
import { detailHtml, smaBlockHtml } from './detail.ts';
import {
  PEER_COLS,
  buildRows,
  countVerdicts,
  filterRows,
  listCols,
  nextSort,
  orderGroups,
  pickIndustry,
  sortRows,
} from './logic.ts';
import type { IndustryGroup, Row, SortKey, SortState } from './logic.ts';
import { seriesUsable, smaChartSvg } from './smachart.ts';
import { buildStripDefs, layoutStrips, markerFor, markerIcon, stripSvg } from './strip.ts';
import type { Marker } from './strip.ts';
import {
  detailRowHtml,
  headHtml,
  listRowHtml,
  medianRowHtml,
  messageRowHtml,
  peerRowHtml,
  summaryHtml,
} from './table.ts';
import {
  getThresholds,
  parseThreshold,
  resetThresholds,
  setThresholds,
  subscribeThresholds,
} from './thresholds.ts';

type ViewId = 'peers' | 'list';

/* ---------- State ---------- */

const isMarket = (v: unknown): v is MarketId => v === 'BIST' || v === 'US';
const isView = (v: unknown): v is ViewId => v === 'peers' || v === 'list';

const savedMarket = lsGet<unknown>('screener.market', 'BIST');
const savedView = lsGet<unknown>('screener.view', 'peers');
const savedInd = lsGet<unknown>('screener.industry', {});

const state = {
  market: (isMarket(savedMarket) ? savedMarket : 'BIST') as MarketId,
  view: (isView(savedView) ? savedView : 'peers') as ViewId,
  /** Last selected industry per market */
  industry: (savedInd && typeof savedInd === 'object' ? { ...savedInd } : {}) as Partial<Record<MarketId, string>>,
  /** Only stocks priced above the 200-day average */
  aboveSma: lsGet<unknown>('screener.aboveSma', false) === true,
  sort: { peers: { key: 'verdict', dir: 1 }, list: { key: 'verdict', dir: 1 } } as Record<ViewId, SortState>,
  /** Stock id of the open row, e.g. "BIST-THYAO" */
  open: null as string | null,
};

/** Loaded price series: null means no file; no entry means not requested yet or still loading */
const prices = new Map<string, PriceSeries | null>();
const pricesPending = new Set<string>();

/** In-session state of the AI boxes */
const comments = new Map<string, AiSlot>();
const compares = new Map<string, AiSlot>();
/** Stocks whose comment the user asked for in this session */
const requested = new Set<string>();
let tokenSeq = 0;

/** Rows of the table on screen (to find the open row and the AI input) */
let shown: Row[] = [];

let root: HTMLElement | null = null;
let ctl: HTMLElement | null = null;
let body: HTMLElement | null = null;

/* ---------- Small helpers ---------- */

const q = <T extends HTMLElement = HTMLElement>(sel: string): T | null => (root ? root.querySelector<T>(sel) : null);

const attr = (name: string, value: string): string => `[${name}="${CSS.escape(value)}"]`;

const priceDate = (): string => {
  const d = marketAsOf(state.market);
  return d ? fmtDate(d, false) : '';
};

const smaChartId = (id: string): string => `sc-sma-${id}`;

const showBanks = (th: Thresholds): boolean => th.showBanks && state.market === 'BIST' && state.view === 'list';

const compareKey = (ind: string): string => `${state.market}:${ind}`;

/** A stock's industry peers in its own market (itself included) */
function peersOf(s: StockView): StockView[] {
  return stocks(s.market, { banks: s.bank ? 'only' : 'exclude' }).filter((x) => x.industry === s.industry);
}

/* ---------- Static skeleton ---------- */

const INTRO: Record<ViewId, string> = {
  peers:
    'Önce piyasayı, sonra bir sektörü seçin; o piyasadaki sektör hisseleri aynı tabloda, sektör ortancasıyla <span class="en">(median)</span> birlikte yan yana gelir. BIST ve ABD hisseleri aynı tabloda karışmaz. Bir satıra dokunursanız uzun açıklama açılır.',
  list:
    'Eşikleri kendi bakışınıza göre değiştirin. Her hisse altı ölçütle sınanır ve "Gerekçe" sütunu hangi ölçütten geçtiğini ya da kaldığını gösterir. Bir satıra dokunursanız uzun açıklama açılır.',
};

function shellHtml(): string {
  const th = getThresholds();
  const seg = (attrName: string, items: Array<[string, string]>, label: string): string =>
    `<div class="seg" role="group" aria-label="${label}">${items
      .map(([id, text]) => `<button type="button" ${attrName}="${id}" aria-pressed="false">${esc(text)}</button>`)
      .join('')}</div>`;
  return `<div class="headrow">
<h2>Tarayıcı</h2>
<div class="toolbar">
${seg('data-market', [['BIST', MARKET_LABEL.BIST], ['US', MARKET_LABEL.US]], 'Piyasa')}
${seg('data-view', [['peers', 'Sektör kıyası'], ['list', 'Tüm liste']], 'Görünüm')}
</div>
</div>
<p class="read" id="sc-intro"></p>
<div class="controls" id="sc-ctl">
<div class="ctl"><label for="sc-max-pe">En yüksek F/K <span class="en">(P/E)</span></label><input type="number" id="sc-max-pe" step="1" min="1" value="${th.maxPe}"><small>Kârın kaç yılda fiyatı geri ödediği.</small></div>
<div class="ctl"><label for="sc-max-peg">En yüksek PEG</label><input type="number" id="sc-max-peg" step="0.1" min="0.1" value="${th.maxPeg}"><small>1'in altı: büyümesine göre ucuz.</small></div>
<div class="ctl"><label for="sc-max-net-debt-ebitda">En yüksek Net borç/FAVÖK <span class="en">(Net debt/EBITDA)</span></label><input type="number" id="sc-max-net-debt-ebitda" step="0.5" min="0" value="${th.maxNetDebtEbitda}"><small>Borcu kaç yıllık faaliyet kârıyla öder.</small></div>
<div class="ctl"><label for="sc-min-ebitda-growth">En düşük FAVÖK büy.&nbsp;% <span class="en">(EBITDA growth)</span></label><input type="number" id="sc-min-ebitda-growth" step="5" value="${th.minEbitdaGrowth}"><small>Faaliyetten gelen büyüme.</small></div>
<div class="ctl check"><input type="checkbox" id="sc-warn-cyclical"${th.warnCyclical ? ' checked' : ''}><label for="sc-warn-cyclical">Döngüsel sektörleri uyar<br><small>Emtia, rafineri, metal, havayolu.</small></label></div>
<div class="ctl check" id="sc-show-banks-ctl"><input type="checkbox" id="sc-show-banks"${th.showBanks ? ' checked' : ''}><label for="sc-show-banks">Bankaları listede göster<br><small>Ayrı yöntemle değerlendirilir.</small></label></div>
<div class="ctl check"><input type="checkbox" id="sc-sma"${state.aboveSma ? ' checked' : ''}><label for="sc-sma">200 günlük ortalamanın üstünde <span class="en">(Above SMA 200)</span><small>Fiyat uzun vadeli ortalamasının üzerinde.</small></label></div>
<div class="ctl"><button class="btn" id="sc-reset" type="button">Varsayılan eşikler</button></div>
</div>
<div class="stack-lg" id="sc-body"></div>`;
}

/** Pressed state of the buttons, the intro text and the visibility of the "show banks" box */
function syncChrome(): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-market]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.market === state.market)),
  );
  root.querySelectorAll<HTMLElement>('[data-view]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.view === state.view)),
  );
  const intro = q('#sc-intro');
  if (intro && intro.dataset.view !== state.view) {
    intro.innerHTML = INTRO[state.view];
    intro.dataset.view = state.view;
  }
  const bank = q('#sc-show-banks-ctl');
  if (bank) bank.hidden = !(state.market === 'BIST' && state.view === 'list');
}

/**
 * Syncs the inputs when the thresholds changed elsewhere; leaves text being typed alone
 * (an empty input counts as the default threshold and stays empty). force: on "reset to
 * default thresholds" every input is rewritten with its value, empty ones included.
 */
function syncControls(force = false): void {
  const th = getThresholds();
  const num = (id: string, v: number, def: number): void => {
    const el = q<HTMLInputElement>('#' + id);
    if (el && (force || parseThreshold(el.value, def) !== v)) el.value = String(v);
  };
  const chk = (id: string, v: boolean): void => {
    const el = q<HTMLInputElement>('#' + id);
    if (el && el.checked !== v) el.checked = v;
  };
  num('sc-max-pe', th.maxPe, DEF.maxPe);
  num('sc-max-peg', th.maxPeg, DEF.maxPeg);
  num('sc-max-net-debt-ebitda', th.maxNetDebtEbitda, DEF.maxNetDebtEbitda);
  num('sc-min-ebitda-growth', th.minEbitdaGrowth, DEF.minEbitdaGrowth);
  chk('sc-warn-cyclical', th.warnCyclical);
  chk('sc-show-banks', th.showBanks);
  chk('sc-sma', state.aboveSma);
}

/* ---------- View models ---------- */

interface PeersModel {
  groups: IndustryGroup[];
  sel: IndustryGroup | null;
  /** All rows of the selected industry (before filtering) */
  all: Row[];
  /** Rows that passed the filter, sorted */
  rows: Row[];
  /** Industry median: independent of the filter, covers every stock of the industry that has data */
  med: IndustryMedian;
}

function peersModel(th: Thresholds): PeersModel {
  const groups = orderGroups(groupByIndustry(stocks(state.market)));
  const ind = pickIndustry(groups, state.industry[state.market]);
  const sel = groups.find((g) => g.industry === ind) ?? null;
  const list = sel ? sel.stocks : [];
  const all = buildRows(list, th);
  const s = state.sort.peers;
  const rows = sortRows(filterRows(all, { aboveSma: state.aboveSma }), s.key, s.dir);
  return { groups, sel, all, rows, med: industryMedian(list) };
}

interface ListModel {
  all: Row[];
  rows: Row[];
}

function listModel(th: Thresholds): ListModel {
  const all = buildRows(stocks(state.market, { banks: showBanks(th) ? 'include' : 'exclude' }), th);
  const s = state.sort.list;
  return { all, rows: sortRows(filterRows(all, { aboveSma: state.aboveSma }), s.key, s.dir) };
}

/* ---------- HTML ---------- */

const FILTER_EMPTY =
  'Bu süzgeçle eşleşen hisse yok. 200 günlük ortalaması henüz hesaplanmamış hisseler de gizlenir.';

function emptyWatchlistHtml(): string {
  return `<div class="stack read">
<p>${esc(MARKET_LABEL[state.market])} için Hisselerim <span class="en">(Watchlist)</span> listeniz boş. Ayarlar sekmesindeki Hisselerim bölümünden bu piyasaya hisse ekleyin; seçtikleriniz burada sınanır.</p>
<div><button class="btn" type="button" data-act="goto-settings" data-key="watchlist">Ayarlar'da hisse seç</button></div>
</div>`;
}

function detailFor(r: Row): string {
  const id = sid(r.s);
  return detailHtml(r.s, r.ev, {
    id,
    asOf: marketAsOf(r.s.market),
    ai: commentBlockHtml(id, comments.get(id), aiStatus()),
    sma: smaBlockHtml(r.s, prices.has(id) ? prices.get(id) : undefined, priceDate(), smaChartId(id)),
  });
}

function bodyRows(rows: Row[], th: Thresholds, colspan: number, rowHtml: (r: Row, th: Thresholds, open: boolean) => string): string {
  return rows
    .map((r) => {
      const open = state.open === sid(r.s);
      return rowHtml(r, th, open) + (open ? detailRowHtml(colspan, detailFor(r)) : '');
    })
    .join('');
}

/** Colours and shapes are fixed per ticker; they do not change when the table order changes. */
function markersFor(rows: Row[]): Map<string, Marker> {
  const ks = rows
    .filter((r) => r.s.hasData)
    .map((r) => r.s.symbol)
    .sort((a, b) => a.localeCompare(b, 'tr'));
  return new Map(ks.map((k, i) => [k, markerFor(i)]));
}

function compareHtml(m: PeersModel): string {
  if (!m.sel) return '';
  return compareBlockHtml(compareKey(m.sel.industry), compares.get(compareKey(m.sel.industry)), aiStatus(), {
    industryTr: m.sel.industryTr,
    withData: m.rows.filter((r) => r.s.hasData).length,
  });
}

function peersHtml(th: Thresholds, m: PeersModel): string {
  if (!m.sel) return emptyWatchlistHtml();
  const sel = m.sel;
  const chips = m.groups
    .map(
      (g) =>
        `<button class="chip" type="button" data-industry="${esc(g.industry)}" aria-pressed="${g.industry === sel.industry}">${esc(g.industryTr)} <span class="en">${esc(g.industryEn)}</span></button>`,
    )
    .join('');
  const cols = PEER_COLS.length;
  const hidden = m.all.length - m.rows.length;
  const tbody =
    (m.rows.length ? bodyRows(m.rows, th, cols, peerRowHtml) : messageRowHtml(cols, FILTER_EMPTY)) +
    medianRowHtml(m.med);
  const other = state.market === 'BIST' ? MARKET_LABEL.US : MARKET_LABEL.BIST;
  const markers = markersFor(m.rows);
  const legend = [...markers].map(([k, mk]) => `<span>${markerIcon(mk)}${esc(k)}</span>`).join('');
  const notes: string[] = [];
  if (hidden > 0)
    notes.push(
      `"200 günlük ortalamanın üstünde" süzgeci bu sektörde ${hidden} hisseyi gizliyor; sektör ortancası gizlenenleri de içerir.`,
    );
  if (m.med.n === 1) notes.push('Bu sektörde verisi olan tek hisse var; ortanca o hissenin kendi değeridir.');
  return `<div class="chips" role="group" aria-label="Sektör">${chips}</div>
<div class="stack">
<div class="tablebox"><table id="sc-tbl" class="sc-peers"><thead>${headHtml(PEER_COLS, state.sort.peers)}</thead><tbody>${tbody}</tbody></table></div>
<p class="muted small">${esc(sel.industryTr)} · ${esc(MARKET_LABEL[state.market])}. "50g ort." ve "200g ort." fiyatın o hareketli ortalamaya <span class="en">(SMA)</span> uzaklığını gösterir. "ÖK kârl." özkaynak kârlılığının yaklaşık değeridir (PD/DD ÷ F/K). Sütun başlıklarına dokunarak sıralayın.${
    notes.length ? ' ' + esc(notes.join(' ')) : ''
  }</p>
</div>
<div class="two">
<div class="stack">
<div class="lbl">Ortancaya göre konum</div>
<div class="chartbox" id="sc-strip"></div>
${legend ? `<div class="legend">${legend}</div>` : ''}
<p class="note">Aynı sektörün ${esc(other)} hisseleri ayrı tabloda durur: para birimi, enflasyon muhasebesi <span class="en">(inflation accounting)</span> ve ülke riski <span class="en">(country risk)</span> farklı olduğu için çarpanlar doğrudan kıyaslanmaz.</p>
</div>
<div class="stack" id="sc-compare">${compareHtml(m)}</div>
</div>`;
}

function listHtml(th: Thresholds, m: ListModel): string {
  if (!m.all.length) return emptyWatchlistHtml();
  const cols = listCols(state.market);
  const tbody = m.rows.length ? bodyRows(m.rows, th, cols.length, listRowHtml) : messageRowHtml(cols.length, FILTER_EMPTY);
  return `<div class="summary" id="sc-summary">${summaryHtml(countVerdicts(m.rows), showBanks(th))}</div>
<div class="stack">
<div class="tablebox"><table id="sc-tbl"><thead>${headHtml(cols, state.sort.list)}</thead><tbody>${tbody}</tbody></table></div>
<p class="muted small">Büyüme sütunları son bilanço dönemini geçen yılın aynı dönemiyle karşılaştırır. PEG kaynağın kendi hesabıdır ve farklı bir dönem büyümesi kullanabilir. "ÖK kârl." özkaynak kârlılığının yaklaşık değeridir (PD/DD ÷ F/K). "200g ort." fiyatın 200 günlük ortalamaya <span class="en">(SMA 200)</span> uzaklığıdır. Sütun başlıklarına dokunarak sıralayın.</p>
</div>`;
}

/* ---------- Rendering ---------- */

/** Selector to find the focused element again after a re-render */
function focusSelector(): string | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !body || !body.contains(el)) return null;
  if (el.dataset.f) return attr('data-f', el.dataset.f);
  if (el.dataset.industry) return attr('data-industry', el.dataset.industry);
  if (el.dataset.act) return attr('data-act', el.dataset.act) + (el.dataset.key ? attr('data-key', el.dataset.key) : '');
  return null;
}

function restoreFocus(sel: string | null): void {
  if (sel && body) body.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
}

function renderBody(): void {
  if (!body) return;
  const keep = focusSelector();
  const th = getThresholds();
  syncChrome();
  if (state.view === 'peers') {
    const m = peersModel(th);
    shown = m.rows;
    body.innerHTML = peersHtml(th, m);
  } else {
    const m = listModel(th);
    shown = m.rows;
    body.innerHTML = listHtml(th, m);
  }
  restoreFocus(keep);

  const open = shown.find((r) => sid(r.s) === state.open);
  if (open && open.s.hasData) {
    ensurePrices(open.s);
    // Refreshes on its own only if the user already asked for this stock's comment in this session.
    const id = sid(open.s);
    if (requested.has(id) && !comments.has(id) && aiStatus().configured) void runComment(id, false);
  }
  drawCharts();
}

function drawStrip(): void {
  const box = q('#sc-strip');
  if (!box || state.view !== 'peers') return;
  const th = getThresholds();
  const m = peersModel(th);
  const withData = m.rows.filter((r) => r.s.hasData);
  if (!m.all.some((r) => r.s.hasData)) {
    box.innerHTML = `<p class="muted small">Bu sektörün verisi henüz gelmedi; grafik ilk veri güncellemesiyle çizilir.</p>`;
    return;
  }
  const defs = buildStripDefs(
    withData.map((r) => r.s),
    m.med,
    th.maxNetDebtEbitda,
  );
  if (!defs.length) {
    box.innerHTML = `<p class="muted small">Süzgeçten geçen hisse olmadığı için grafik boş.</p>`;
    return;
  }
  const W = cw(box) - 28;
  if (W <= 0) return;
  const tickers = withData.map((r) => r.s.symbol).join(', ');
  box.innerHTML = stripSvg(
    layoutStrips(defs, W, markersFor(m.rows)),
    `${tickers}: çarpanların ${m.sel ? m.sel.industryTr : ''} sektör ortancasına göre konumu`,
  );
}

function drawSma(): void {
  if (!state.open || !body) return;
  const box = body.querySelector<HTMLElement>(attr('id', smaChartId(state.open)));
  const series = prices.get(state.open);
  if (!box || !seriesUsable(series)) return;
  const W = cw(box) - 28;
  if (W <= 0) return;
  box.innerHTML = smaChartSvg(series, W, `${series.symbol}: günlük kapanış ve 20, 50, 200 günlük hareketli ortalamalar`) ?? '';
}

function drawCharts(): void {
  drawStrip();
  drawSma();
}

/* ---------- Price series ---------- */

function ensurePrices(s: StockView): void {
  const id = sid(s);
  if (prices.has(id) || pricesPending.has(id)) return;
  pricesPending.add(id);
  void loadPrices(s).then((p) => {
    pricesPending.delete(id);
    prices.set(id, p);
    patchSma(id);
  });
}

function patchSma(id: string): void {
  if (!body) return;
  const el = body.querySelector<HTMLElement>(attr('data-sma-for', id));
  const r = shown.find((x) => sid(x.s) === id);
  if (!el || !r) return;
  el.innerHTML = smaBlockHtml(r.s, prices.has(id) ? prices.get(id) : undefined, priceDate(), smaChartId(id));
  drawSma();
}

/* ---------- AI ---------- */

/** Refreshes the box in place; focus stays on the button if it was there. */
function patch(el: HTMLElement | null, html: string): void {
  if (!el) return;
  const keep = focusSelector();
  el.innerHTML = html;
  restoreFocus(keep);
}

function patchComment(id: string): void {
  if (!body) return;
  patch(body.querySelector<HTMLElement>(attr('data-ai-for', id)), commentBlockHtml(id, comments.get(id), aiStatus()));
}

function patchCompare(key: string): void {
  if (state.view !== 'peers') return;
  const m = peersModel(getThresholds());
  if (!m.sel || compareKey(m.sel.industry) !== key) return;
  patch(q('#sc-compare'), compareHtml(m));
}

async function runSlot(
  map: Map<string, AiSlot>,
  key: string,
  call: () => Promise<AiText>,
  repaint: (key: string) => void,
): Promise<void> {
  const prev = map.get(key);
  if (prev?.status === 'loading') return;
  const token = ++tokenSeq;
  // While waiting the button is disabled and drops focus; focus is handed back when the work finishes.
  const hadFocus = focusSelector();
  map.set(key, { status: 'loading', result: prev?.result, token });
  repaint(key);
  try {
    const result = await call();
    if (map.get(key)?.token !== token) return;
    map.set(key, { status: 'done', result, token });
  } catch (e) {
    if (map.get(key)?.token !== token) return;
    map.set(key, { status: 'error', result: prev?.result, error: aiErrorMessage(e), token });
  }
  repaint(key);
  const active = document.activeElement;
  if (hadFocus && (!active || active === document.body)) restoreFocus(hadFocus);
}

function runComment(id: string, force: boolean): Promise<void> {
  const r = shown.find((x) => sid(x.s) === id);
  if (!r || !r.s.hasData) return Promise.resolve();
  requested.add(id);
  const { s, ev } = r;
  return runSlot(
    comments,
    id,
    async () => {
      const series = await loadPrices(s);
      const med = industryMedian(peersOf(s));
      return commentStock(
        { stock: s, evaluation: ev, median: med.n > 0 ? med : null, prices: seriesUsable(series) ? series : null },
        { force },
      );
    },
    patchComment,
  );
}

function runCompare(key: string, force: boolean): Promise<void> {
  if (state.view !== 'peers') return Promise.resolve();
  const m = peersModel(getThresholds());
  if (!m.sel || compareKey(m.sel.industry) !== key) return Promise.resolve();
  const input = {
    market: state.market,
    industry: industry(m.sel.industry),
    rows: m.rows.map((r) => ({ stock: r.s, evaluation: r.ev })),
    median: m.med,
  };
  return runSlot(compares, key, () => compareIndustry(input, { force }), patchCompare);
}

/* ---------- Events ---------- */

function toggleRow(k: string): void {
  const id = `${state.market}-${k}`;
  state.open = state.open === id ? null : id;
  renderBody();
}

function sortBy(key: SortKey): void {
  state.sort[state.view] = nextSort(state.sort[state.view], key);
  renderBody();
}

function onBodyClick(e: MouseEvent): void {
  const t = e.target as HTMLElement;
  const act = t.closest<HTMLElement>('[data-act]');
  if (act) {
    const key = act.dataset.key ?? '';
    const force = act.dataset.force === '1';
    if (act.dataset.act === 'goto-settings') location.hash = '#settings';
    else if (act.dataset.act === 'ai-comment') void runComment(key, force);
    else if (act.dataset.act === 'ai-compare') void runCompare(key, force);
    return;
  }
  const chip = t.closest<HTMLElement>('button.chip[data-industry]');
  if (chip?.dataset.industry) {
    state.industry[state.market] = chip.dataset.industry;
    lsSet('screener.industry', state.industry);
    renderBody();
    return;
  }
  const th = t.closest<HTMLElement>('th[data-sort]');
  if (th?.dataset.sort) {
    sortBy(th.dataset.sort as SortKey);
    return;
  }
  const tr = t.closest<HTMLElement>('tr.row');
  if (tr?.dataset.symbol) toggleRow(tr.dataset.symbol);
}

function onBodyKey(e: KeyboardEvent): void {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target as HTMLElement;
  if (t.matches('tr.row') && t.dataset.symbol) {
    e.preventDefault();
    toggleRow(t.dataset.symbol);
  } else if (t.matches('th[data-sort]') && t.dataset.sort) {
    e.preventDefault();
    sortBy(t.dataset.sort as SortKey);
  }
}

function onHeadClick(e: MouseEvent): void {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.seg button');
  if (!b) return;
  if (isMarket(b.dataset.market) && b.dataset.market !== state.market) {
    state.market = b.dataset.market;
    lsSet('screener.market', state.market);
    renderBody();
  } else if (isView(b.dataset.view) && b.dataset.view !== state.view) {
    state.view = b.dataset.view;
    lsSet('screener.view', state.view);
    renderBody();
  }
}

function onControlInput(e: Event): void {
  const el = e.target as HTMLInputElement;
  switch (el.id) {
    case 'sc-max-pe':
      setThresholds({ maxPe: parseThreshold(el.value, DEF.maxPe) });
      break;
    case 'sc-max-peg':
      setThresholds({ maxPeg: parseThreshold(el.value, DEF.maxPeg) });
      break;
    case 'sc-max-net-debt-ebitda':
      setThresholds({ maxNetDebtEbitda: parseThreshold(el.value, DEF.maxNetDebtEbitda) });
      break;
    case 'sc-min-ebitda-growth':
      setThresholds({ minEbitdaGrowth: parseThreshold(el.value, DEF.minEbitdaGrowth) });
      break;
    case 'sc-warn-cyclical':
      setThresholds({ warnCyclical: el.checked });
      break;
    case 'sc-show-banks':
      setThresholds({ showBanks: el.checked });
      break;
    case 'sc-sma':
      state.aboveSma = el.checked;
      lsSet('screener.aboveSma', state.aboveSma);
      renderBody();
      break;
    default:
  }
}

function onReset(): void {
  state.aboveSma = false;
  lsSet('screener.aboveSma', false);
  resetThresholds(); // subscribers (this tab and the calculator) re-render
  syncControls(true);
}

/* ---------- Public API ---------- */

export function mount(el: HTMLElement): void {
  root = el;
  el.innerHTML = shellHtml();
  ctl = q('#sc-ctl');
  body = q('#sc-body');

  q('.headrow')?.addEventListener('click', onHeadClick);
  ctl?.addEventListener('input', onControlInput);
  q('#sc-reset')?.addEventListener('click', onReset);
  body?.addEventListener('click', onBodyClick);
  body?.addEventListener('keydown', onBodyKey);

  subscribeThresholds(() => {
    syncControls();
    renderBody();
  });
  on('data', () => {
    // With new data, old comments and series are stale.
    comments.clear();
    compares.clear();
    prices.clear();
    renderBody();
  });
  on('watchlist', renderBody);
  on('ai', renderBody);

  renderBody();
}

/** When the tab becomes visible or the width changes: charts are redrawn at the new width. */
export function refresh(): void {
  drawCharts();
}
