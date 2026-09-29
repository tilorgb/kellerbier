import type { Locale } from '../../i18n/locale.js';
import { t } from '../../i18n/translate.js';
import { MAX_FEEDBACK_LENGTH } from '../telemetry/schema.js';
import type { PlaytestQuestion } from './questions.js';

/**
 * The playtest build's two screens — the welcome and the post-run question —
 * as a small DOM overlay rather than canvas art. The game's own UI has no
 * text-entry widget, and a free-text answer wants a real `<textarea>` (IME,
 * paste, mobile keyboards) far more than it wants the pixel font. The card
 * borrows the postcard's colours so it still reads as part of the game.
 *
 * **Keys stay out of the game.** The game listens for keys on `window`
 * (`app/input/keyboard.ts`, `main.ts`), so typing "wasd" into the answer
 * would walk Alois about. The overlay root stops `keydown`/`keyup`/
 * `keypress` from bubbling past it. Nothing here touches the sim.
 */

const STYLE_ID = 'playtest-overlay-style';

const CSS = `
.pt-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center;
  justify-content: center; padding: 16px; background: rgba(11, 10, 13, 0.82); }
.pt-card { box-sizing: border-box; width: min(560px, 100%); max-height: 100%; overflow: auto;
  padding: 24px 26px; background: #e8e2d0; color: #2a2118; border: 3px solid #8a5a2b;
  box-shadow: 0 0 0 3px #1a1410, 0 12px 40px rgba(0, 0, 0, 0.6);
  font: 16px/1.45 Georgia, 'Times New Roman', serif; }
.pt-card h2 { margin: 0 0 12px; font-size: 22px; letter-spacing: 0.02em; color: #5a3411; }
.pt-card p { margin: 0 0 12px; }
.pt-small { font-size: 14px; color: #5b4a38; }
.pt-question { font-weight: bold; }
.pt-card textarea { box-sizing: border-box; width: 100%; min-height: 96px; resize: vertical;
  padding: 8px 10px; font: inherit; color: #2a2118; background: #fbf8ee;
  border: 2px solid #8a5a2b; border-radius: 0; }
.pt-card textarea:focus { outline: 2px solid #c9a227; outline-offset: 1px; }
.pt-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.pt-btn { font: inherit; font-weight: bold; padding: 9px 16px; cursor: pointer; color: #2a2118;
  background: #f3d98a; border: 2px solid #8a5a2b; border-radius: 0; }
.pt-btn:hover:not(:disabled) { background: #f8e6ad; }
.pt-btn:focus-visible { outline: 3px solid #2a2118; outline-offset: 2px; }
.pt-btn:disabled { opacity: 0.55; cursor: default; }
.pt-btn.pt-secondary { background: transparent; }
.pt-status { min-height: 1.4em; margin-top: 10px; font-size: 14px; color: #5b4a38; }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID) !== null) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** A backdrop + card that swallows keyboard input, so the game underneath never sees it. */
function mount(): { backdrop: HTMLDivElement; card: HTMLDivElement } {
  ensureStyle();
  const backdrop = element('div', 'pt-backdrop');
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  const stop = (event: Event): void => {
    event.stopPropagation();
  };
  backdrop.addEventListener('keydown', stop);
  backdrop.addEventListener('keyup', stop);
  backdrop.addEventListener('keypress', stop);
  const card = element('div', 'pt-card');
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  return { backdrop, card };
}

export interface WelcomeDeps {
  readonly locale: Locale;
  /** `true` when the tester agreed to take part. Called once; the overlay is gone by then. */
  readonly onChoice: (joined: boolean) => void;
}

/** The first-launch welcome: what this is, what is recorded, yes or no. Deliberately says nothing about controls or mechanics — `docs/PLAYTEST_PROTOCOL.md` §3. */
export function showWelcome(deps: WelcomeDeps): void {
  const { backdrop, card } = mount();
  const { locale } = deps;
  card.appendChild(element('h2', undefined, t(locale, 'ui.playtest.welcome.title')));
  card.appendChild(element('p', undefined, t(locale, 'ui.playtest.welcome.body')));
  card.appendChild(element('p', 'pt-small', t(locale, 'ui.playtest.welcome.consent')));
  const row = element('div', 'pt-row');
  const choose = (joined: boolean): void => {
    backdrop.remove();
    deps.onChoice(joined);
  };
  const yes = element('button', 'pt-btn', t(locale, 'ui.playtest.welcome.yes'));
  yes.type = 'button';
  yes.addEventListener('click', () => {
    choose(true);
  });
  const no = element('button', 'pt-btn', t(locale, 'ui.playtest.welcome.no'));
  no.classList.add('pt-secondary');
  no.type = 'button';
  no.addEventListener('click', () => {
    choose(false);
  });
  row.append(yes, no);
  card.appendChild(row);
  yes.focus();
}

export interface FeedbackPromptDeps {
  readonly locale: Locale;
  readonly question: PlaytestQuestion;
  /**
   * Saves the answer and sends it with the run's stats; resolves to whether
   * it arrived. A blank answer is allowed — it sends the stats alone.
   */
  readonly onSubmit: (text: string) => Promise<boolean>;
  /** The prompt is gone, sent or skipped. */
  readonly onClose: () => void;
}

/** The post-run question. Returns a `close` for the caller to drop it early (the tester started another run). */
export function showFeedbackPrompt(deps: FeedbackPromptDeps): { close: () => void } {
  const { backdrop, card } = mount();
  const { locale, question } = deps;
  let closed = false;
  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    backdrop.remove();
    deps.onClose();
  };

  card.appendChild(element('h2', undefined, t(locale, 'ui.playtest.prompt.heading')));
  card.appendChild(element('p', 'pt-question', t(locale, question.textKey)));
  const box = element('textarea');
  box.maxLength = MAX_FEEDBACK_LENGTH;
  box.placeholder = t(locale, 'ui.playtest.prompt.placeholder');
  box.setAttribute('aria-label', t(locale, question.textKey));
  card.appendChild(box);
  card.appendChild(element('p', 'pt-small', t(locale, 'ui.playtest.prompt.hint')));

  const status = element('div', 'pt-status');
  status.setAttribute('role', 'status');
  const row = element('div', 'pt-row');
  const send = element('button', 'pt-btn', t(locale, 'ui.playtest.prompt.send'));
  send.type = 'button';
  const skip = element('button', 'pt-btn', t(locale, 'ui.playtest.prompt.skip'));
  skip.classList.add('pt-secondary');
  skip.type = 'button';
  row.append(send, skip);
  card.append(row, status);

  send.addEventListener('click', () => {
    send.disabled = true;
    skip.disabled = true;
    status.textContent = t(locale, 'ui.playtest.prompt.sending');
    deps
      .onSubmit(box.value)
      .then((ok) => {
        if (ok) {
          status.textContent = t(locale, 'ui.playtest.prompt.thanks');
          window.setTimeout(close, 900);
        } else {
          status.textContent = t(locale, 'ui.playtest.prompt.failed');
          send.disabled = false;
          skip.disabled = false;
        }
      })
      .catch(() => {
        status.textContent = t(locale, 'ui.playtest.prompt.failed');
        send.disabled = false;
        skip.disabled = false;
      });
  });
  skip.addEventListener('click', close);
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !skip.disabled) {
      close();
    }
  });
  box.focus();
  return { close };
}
