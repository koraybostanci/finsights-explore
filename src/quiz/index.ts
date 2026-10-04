/**
 * Kendini sına sekmesi. Anahtar olmadan çalışır: hazır soru bankası ve güncel
 * veriden üretilen sorular. Anahtar varsa yapay zekâdan yeni sorular istenebilir;
 * yanıt katı biçimde doğrulanır, olmazsa hazır sorulara dönülür.
 */

import './quiz.css';

import { MARKETS, MARKET_LABEL, lsGet, lsSet, on, stocks } from '../data/store.ts';
import { esc } from '../lib/format.ts';
import type { MarketId } from '../types.ts';

import { aiErrorMessage, aiStatus, generateQuiz } from '../ai/index.ts';

import { BANK } from './bank.ts';
import { dataCount, dataQuestions } from './datagen.ts';
import { buildRound, fromAi, score } from './logic.ts';
import type { QuizQuestion } from './types.ts';

type Phase = 'intro' | 'play' | 'done';

interface Best {
  correct: number;
  total: number;
}

let root: HTMLElement | null = null;
let market: MarketId = 'BIST';
let phase: Phase = 'intro';
let round: QuizQuestion[] = [];
let answers: Array<number | null> = [];
let at = 0;
let busy = false;
let message = '';
let roundKind: 'mixed' | 'ai' = 'mixed';

const LETTERS = ['A', 'B', 'C', 'D'];
const KIND_LABEL: Record<QuizQuestion['kind'], string> = {
  concept: 'Kavram sorusu',
  data: 'Güncel veriden',
  ai: 'Yapay zekâ yazdı',
};

const mine = () => stocks(market, { banks: 'exclude', watchlistOnly: true });

function start(): void {
  round = buildRound(BANK, dataQuestions(market, mine()));
  answers = round.map(() => null);
  at = 0;
  roundKind = 'mixed';
  phase = round.length ? 'play' : 'intro';
  message = '';
  render();
}

async function startAi(): Promise<void> {
  if (busy) return;
  busy = true;
  message = '';
  render();
  const m = market;
  try {
    const out = await generateQuiz({ market: m, stocks: mine() });
    round = fromAi(out.questions, m, Date.now());
    answers = round.map(() => null);
    at = 0;
    roundKind = 'ai';
    phase = 'play';
    message = out.rejected.length
      ? `Yapay zekânın ${out.rejected.length} sorusu doğrulamadan geçmedi ve atıldı; ${round.length} soru kaldı.`
      : '';
  } catch (e) {
    message = `${aiErrorMessage(e)} Hazır sorularla devam edebilirsiniz.`;
    phase = 'intro';
  } finally {
    busy = false;
    render();
  }
}

/* ---------- Görünüm ---------- */

function segHtml(): string {
  return `<div class="seg" role="group" aria-label="Piyasa">${MARKETS.map(
    (m) => `<button type="button" data-market="${m}" aria-pressed="${m === market}">${esc(MARKET_LABEL[m])}</button>`,
  ).join('')}</div>`;
}

function aiButton(label: string): string {
  const st = aiStatus();
  const n = dataCount(market, mine());
  if (!st.configured)
    return `<span class="muted small">Yapay zekâ ile yeni soru üretmek için <button type="button" class="qz-link" data-go="ayarlar">Ayarlar'da bir sağlayıcı seçin</button>.</span>`;
  if (n < 2)
    return `<span class="muted small">${esc(MARKET_LABEL[market])} listenizde verisi olan en az iki hisse olunca yapay zekâ soru üretebilir.</span>`;
  return `<button type="button" class="btn" data-act="ai"${busy ? ' disabled' : ''}>${
    busy ? '<span class="spin" aria-hidden="true"></span> Sorular yazılıyor…' : esc(label)
  }</button>`;
}

function introHtml(): string {
  const n = dataCount(market, mine());
  const best = lsGet<Best | null>('quiz.best', null);
  const dataLine = n
    ? `Bu turda ${esc(MARKET_LABEL[market])} listenizdeki ${n} hissenin güncel rakamlarından üretilmiş sorular da olacak.`
    : `${esc(MARKET_LABEL[market])} listenizde verisi olan hisse yok; bu turda yalnızca kavram soruları sorulur.`;
  return `
    <div class="box qz-card">
      <p style="font-family:var(--body)">Her tur ${Math.min(8, BANK.length)} sorudur: hikâyelerdeki kavramlar ve Tarayıcı'nın kuralları. Her sorudan sonra doğru yanıtın nedeni ve dönüp bakılacak yer gösterilir. ${dataLine}</p>
      ${message ? `<p class="note">${esc(message)}</p>` : ''}
      <div class="toolbar">
        <button type="button" class="btn primary" data-act="start"${busy ? ' disabled' : ''}>Başla</button>
        ${aiButton('Yapay zekâ ile yeni sorular üret')}
      </div>
      ${
        best && best.total && best.correct > 0
          ? `<p class="muted small">En iyi sonucunuz: ${best.total} soruda ${best.correct} doğru.</p>`
          : ''
      }
    </div>`;
}

function factsHtml(q: QuizQuestion): string {
  if (!q.facts?.length) return '';
  return `<div class="tiles">${q.facts
    .map(
      (f) =>
        `<div><div class="k">${esc(f.k)}${f.en ? `<span class="en">${esc(f.en)}</span>` : ''}</div><div class="v">${esc(
          f.v,
        )}</div>${f.d ? `<div class="d">${esc(f.d)}</div>` : ''}</div>`,
    )
    .join('')}</div>`;
}

function playHtml(): string {
  const q = round[at];
  const picked = answers[at];
  const done = picked != null;
  const pctDone = Math.round(((at + (done ? 1 : 0)) / round.length) * 100);
  const opts = q.options
    .map((o, i) => {
      const cls = !done ? '' : i === q.correct ? ' right' : i === picked ? ' wrong' : '';
      return `<button type="button" class="qz-opt${cls}" data-pick="${i}"${done ? ' disabled' : ''}><b>${LETTERS[i] ?? i + 1}</b><span>${esc(
        o,
      )}</span></button>`;
    })
    .join('');
  const ok = picked === q.correct;
  const feedback = done
    ? `<div class="learn" role="status" aria-live="polite">
        <b>${ok ? 'Doğru.' : `Yanlış. Doğru yanıt: ${LETTERS[q.correct] ?? ''}`}</b>
        <span>${esc(q.why)}</span>
        <span class="small">Dönüp bakmak için: <button type="button" class="qz-link" data-go="${esc(q.ref.tab)}" data-anchor="${esc(
          q.ref.anchor ?? '',
        )}">${esc(q.ref.label)}</button></span>
      </div>
      <div class="toolbar"><button type="button" class="btn primary" data-act="next">${
        at + 1 < round.length ? 'Sonraki soru' : 'Sonucu gör'
      }</button></div>`
    : '';
  return `
    <div class="box qz-card">
      <div class="qz-top"><span>Soru ${at + 1} / ${round.length}</span><span class="pill na">${esc(KIND_LABEL[q.kind])} · ${esc(
        q.topic,
      )}</span></div>
      <div class="qz-bar" aria-hidden="true"><i style="width:${pctDone}%"></i></div>
      ${message && at === 0 && !done ? `<p class="note">${esc(message)}</p>` : ''}
      ${q.lead ? `<div class="qz-lead">${esc(q.lead)}</div>` : ''}
      ${factsHtml(q)}
      <h3 class="qz-q" id="qz-q" tabindex="-1">${esc(q.q)}</h3>
      ${q.note ? `<p class="muted small">${esc(q.note)}</p>` : ''}
      <div class="qz-opts" role="group" aria-labelledby="qz-q">${opts}</div>
      ${feedback}
      ${
        q.kind === 'ai'
          ? `<p class="muted small">Bu soruyu yapay zekâ yazdı; rakamlar Tarayıcı'daki veriden verildi. Yatırım tavsiyesi değildir.</p>`
          : ''
      }
    </div>`;
}

function doneHtml(): string {
  const r = score(round, answers);
  const best = lsGet<Best | null>('quiz.best', null);
  const verdict =
    r.correct === r.total
      ? 'Hepsi doğru.'
      : r.correct >= Math.ceil(r.total * 0.75)
        ? 'İyi gidiyor.'
        : 'Yanlış yaptıklarınızın yanındaki bağlantılar tekrar için iyi bir başlangıç.';
  const review = round
    .map((q, i) => {
      const ok = answers[i] === q.correct;
      return `<li><span class="ico ${ok ? 'good' : 'bad'}">${ok ? '✓' : '✕'}</span><span>${
        q.lead ? `<span class="muted small">${esc(q.lead)}:</span> ` : ''
      }${esc(q.q)}${
        ok
          ? ''
          : ` <span class="muted small">Doğrusu: ${esc(q.options[q.correct])}. <button type="button" class="qz-link" data-go="${esc(
              q.ref.tab,
            )}" data-anchor="${esc(q.ref.anchor ?? '')}">${esc(q.ref.label)}</button></span>`
      }</span></li>`;
    })
    .join('');
  return `
    <div class="box qz-card">
      <div>
        <div class="lbl">Sonuç</div>
        <div class="qz-score">${r.total} soruda ${r.correct} doğru</div>
      </div>
      <p style="font-family:var(--body)">${esc(verdict)}</p>
      <ul class="qz-review">${review}</ul>
      <div class="toolbar">
        <button type="button" class="btn primary" data-act="start">Yeniden başla</button>
        ${aiButton('Yapay zekâ ile yeni sorular üret')}
      </div>
      ${
        roundKind === 'mixed' && best && best.total && best.correct > 0
          ? `<p class="muted small">En iyi sonucunuz: ${best.total} soruda ${best.correct} doğru.</p>`
          : ''
      }
    </div>`;
}

function render(): void {
  if (!root) return;
  const body = phase === 'play' && round.length ? playHtml() : phase === 'done' ? doneHtml() : introHtml();
  root.innerHTML = `
    <div class="headrow">
      <h2>Kendini sına</h2>
      <div class="toolbar">${segHtml()}</div>
    </div>
    <p class="read">Öğrendiklerinizi önce kavram sorularıyla, sonra kendi listenizdeki gerçek hisselerle sınayın. BIST ve ABD hisseleri burada da ayrı sorulur.</p>
    ${body}`;
}

function finish(): void {
  phase = 'done';
  if (roundKind === 'mixed') {
    const r = score(round, answers);
    const best = lsGet<Best | null>('quiz.best', null);
    if (!best || !best.total || r.correct / r.total > best.correct / best.total) lsSet('quiz.best', r);
  }
  render();
}

function go(tab: string, anchor: string): void {
  location.hash = '#' + tab;
  if (anchor)
    window.setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
    }, 80);
}

function onClick(e: Event): void {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b || b.disabled) return;
  if (b.dataset.market) {
    market = b.dataset.market === 'US' ? 'US' : 'BIST';
    lsSet('quiz.market', market);
    phase = 'intro';
    message = '';
    render();
  } else if (b.dataset.act === 'start') {
    start();
  } else if (b.dataset.act === 'ai') {
    void startAi();
  } else if (b.dataset.act === 'next') {
    if (at + 1 < round.length) {
      at++;
      render();
      root?.querySelector<HTMLElement>('#qz-q')?.focus();
    } else finish();
  } else if (b.dataset.pick != null && phase === 'play' && answers[at] == null) {
    answers[at] = Number(b.dataset.pick);
    render();
    root?.querySelector<HTMLButtonElement>('[data-act="next"]')?.focus();
  } else if (b.dataset.go) {
    go(b.dataset.go, b.dataset.anchor ?? '');
  }
}

export function mount(el: HTMLElement): void {
  root = el;
  market = lsGet<string>('quiz.market', 'BIST') === 'US' ? 'US' : 'BIST';
  el.addEventListener('click', onClick);
  render();
  // Tur sürerken liste ya da veri değişirse soruları bozmayız; yalnızca giriş ve sonuç ekranı yenilenir.
  const soft = () => {
    if (phase !== 'play') render();
  };
  on('data', soft);
  on('watchlist', soft);
  on('ai', soft);
}

export function refresh(): void {
  /* çizim yok */
}
