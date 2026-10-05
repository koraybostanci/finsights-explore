/**
 * Yapay zekâ kutularının durumu ve HTML'i (hisse yorumu, sektör karşılaştırması).
 * İstek yalnızca kullanıcı düğmeye basınca gider; sonuç bu oturum boyunca
 * bellekte tutulur, böylece satır yeniden açıldığında yeni istek gerekmez.
 */

import { aiTextHtml } from '../ai/index.ts';
import type { AiStatus, AiText } from '../ai/index.ts';
import { esc } from '@fintools/shared/format';

export interface AiSlot {
  status: 'loading' | 'done' | 'error';
  result?: AiText;
  error?: string;
  /** Aynı kutu için en son başlatılan isteğin sırası; eski yanıtlar yok sayılır */
  token: number;
}

const metaLine = (r: AiText): string => {
  const who = r.model ? `${r.providerLabel} (${r.model})` : r.providerLabel;
  return `<span class="muted small">${esc(who)} ile yazıldı. Yatırım tavsiyesi değildir.</span>`;
};

interface BlockText {
  /** İlk kez: "Yorumla" */
  run: string;
  /** Yeniden: "Yeniden yorumla" */
  rerun: string;
  /** Beklerken: "Yorumlanıyor…" */
  busy: string;
  /** data-act değeri */
  act: string;
}

function actionRow(slot: AiSlot | undefined, status: AiStatus, t: BlockText, key: string, offLine: string): string {
  const loading = slot?.status === 'loading';
  const has = !!slot?.result;
  let btn = '';
  if (status.configured) {
    const label = loading ? `<span class="spin"></span> ${esc(t.busy)}` : esc(has ? t.rerun : t.run);
    btn = `<button class="btn${has || loading ? '' : ' primary'}" type="button" data-act="${t.act}" data-key="${esc(key)}" data-force="${
      has ? '1' : '0'
    }"${loading ? ' disabled' : ''}>${label}</button>`;
  }
  const meta = slot?.result ? metaLine(slot.result) : '';
  const off = status.configured ? '' : offLine;
  return btn || meta || off ? `<div class="ai-meta">${btn}${meta}${off}</div>` : '';
}

const errorHtml = (slot: AiSlot | undefined): string =>
  slot?.status === 'error' && slot.error ? `<p class="note" role="alert">${esc(slot.error)}</p>` : '';

/* ---------- Hisse yorumu (açılan satırda) ---------- */

export function commentBlockHtml(key: string, slot: AiSlot | undefined, status: AiStatus): string {
  const text = slot?.result ? `<div class="ai-text">${aiTextHtml(slot.result.text)}</div>` : '';
  const hint =
    status.configured && !slot
      ? `<p class="muted small">Çarpanları ve ortalamaları hikâyelerin diliyle açıklar. İstek yalnızca düğmeye bastığınızda, kendi API anahtarınızla gider.</p>`
      : '';
  const row = actionRow(
    slot,
    status,
    { run: 'Yorumla', rerun: 'Yeniden yorumla', busy: 'Yorumlanıyor…', act: 'ai-comment' },
    key,
    `<span class="muted small">Yapay zekâ yorumu kapalı. <a href="#settings">Ayarlar'da açabilirsiniz.</a></span>`,
  );
  return `<div class="lbl">Yapay zekâ yorumu · <span lang="en">AI commentary</span></div>${text}${hint}${errorHtml(slot)}${row}`;
}

/* ---------- Sektör karşılaştırması ---------- */

export interface CompareContext {
  /** Sektörün Türkçe adı */
  industryTr: string;
  /** Verisi olan (ve süzgeçten geçen) hisse sayısı */
  withData: number;
}

export function compareBlockHtml(key: string, slot: AiSlot | undefined, status: AiStatus, ctx: CompareContext): string {
  const lbl = `<div class="lbl">Sektör karşılaştırması · <span lang="en">AI comparison</span></div>`;
  if (!status.configured && !slot?.result)
    return `${lbl}
<p>Yapay zekâ bu sektördeki hisseleri yan yana okur ve farkların ne anlama gelebileceğini hikâyelerin diliyle anlatır. Sayılar yine tablodan gelir; yapay zekâ yalnızca açıklar.</p>
<p class="muted small">Kendi API anahtarınızla çalışır ve anahtar yalnızca bu tarayıcıda saklanır.</p>
<div class="ai-meta"><button class="btn" type="button" data-act="goto-settings">Ayarlar'da yapay zekâyı aç</button></div>`;

  const text = slot?.result
    ? `<div class="learn ai-text"><b>${esc(ctx.industryTr)}: ne görüyoruz?</b>${aiTextHtml(slot.result.text)}</div>`
    : '';
  if (ctx.withData < 2 && !slot?.result)
    return `${lbl}<p class="muted small">Karşılaştırma için bu sektörde verisi olan en az iki hisse gerekir.</p>`;

  const intro = !slot?.result
    ? `<p>Bu sektördeki hisseleri yan yana okutun: yapay zekâ farkların ne anlama gelebileceğini hikâyelerin diliyle anlatır. Sayılar yine tablodan gelir.</p>
<p class="muted small">İstek yalnızca düğmeye bastığınızda, kendi API anahtarınızla gider.</p>`
    : '';
  const row = actionRow(
    slot,
    status,
    { run: 'Karşılaştır', rerun: 'Yeniden karşılaştır', busy: 'Karşılaştırılıyor…', act: 'ai-compare' },
    key,
    `<button class="btn" type="button" data-act="goto-settings">Ayarlar'da yapay zekâyı aç</button>`,
  );
  return `${lbl}${intro}${text}${errorHtml(slot)}${row}`;
}
