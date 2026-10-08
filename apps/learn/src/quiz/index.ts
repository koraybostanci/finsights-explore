/**
 * Quiz tab. Builds a round from the fixed question bank; needs no key, data or network.
 */

import './quiz.css';

import { esc } from '@fintools/shared/format';

import { lsGet, lsSet } from '../storage.ts';
import { BANK } from './bank.ts';
import { ROUND_SIZE, buildRound, score } from './logic.ts';
import type { QuizQuestion } from './types.ts';

type Phase = 'intro' | 'play' | 'done';

interface Best {
  correct: number;
  total: number;
}

let root: HTMLElement | null = null;
let phase: Phase = 'intro';
let round: QuizQuestion[] = [];
let answers: Array<number | null> = [];
let at = 0;

const LETTERS = ['A', 'B', 'C', 'D'];

function start(): void {
  round = buildRound(BANK);
  answers = round.map(() => null);
  at = 0;
  phase = round.length ? 'play' : 'intro';
  render();
}

/* ---------- View ---------- */

function introHtml(): string {
  const best = lsGet<Best | null>('quiz.best', null);
  return `
    <div class="box qz-card">
      <p style="font-family:var(--body)">Her tur ${Math.min(ROUND_SIZE, BANK.length)} sorudur: hikâyelerdeki kavramlar ve tarayıcı uygulamasının (screener app) kuralları. Her sorudan sonra doğru yanıtın nedeni ve dönüp bakılacak yer gösterilir.</p>
      <div class="toolbar">
        <button type="button" class="btn primary" data-act="start">Başla</button>
      </div>
      ${
        best && best.total && best.correct > 0
          ? `<p class="muted small">En iyi sonucunuz: ${best.total} soruda ${best.correct} doğru.</p>`
          : ''
      }
    </div>`;
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
      <div class="qz-top"><span>Soru ${at + 1} / ${round.length}</span><span class="pill na">Kavram sorusu · ${esc(
        q.topic,
      )}</span></div>
      <div class="qz-bar" aria-hidden="true"><i style="width:${pctDone}%"></i></div>
      <h3 class="qz-q" id="qz-q" tabindex="-1">${esc(q.q)}</h3>
      <div class="qz-opts" role="group" aria-labelledby="qz-q">${opts}</div>
      ${feedback}
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
        esc(q.q)
      }${
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
      </div>
      ${
        best && best.total && best.correct > 0
          ? `<p class="muted small">En iyi sonucunuz: ${best.total} soruda ${best.correct} doğru.</p>`
          : ''
      }
    </div>`;
}

function render(): void {
  if (!root) return;
  const body = phase === 'play' && round.length ? playHtml() : phase === 'done' ? doneHtml() : introHtml();
  root.innerHTML = `
    <h2>Kendini sına</h2>
    <p class="read">Öğrendiklerinizi kavram sorularıyla sınayın.</p>
    ${body}`;
}

function finish(): void {
  phase = 'done';
  const r = score(round, answers);
  const best = lsGet<Best | null>('quiz.best', null);
  if (!best || !best.total || r.correct / r.total > best.correct / best.total) lsSet('quiz.best', r);
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
  if (b.dataset.act === 'start') {
    start();
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
  el.addEventListener('click', onClick);
  render();
}

export function refresh(): void {
  /* nothing to draw */
}
