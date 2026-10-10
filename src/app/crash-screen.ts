import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { element, mount } from './playtest/overlay.js';

export interface CrashScreenDeps {
  readonly locale: Locale;
  /**
   * `'run'`: a step or a render threw mid-run — the run is saved up to the
   * last tick that worked, and a reload resumes it from there. `'resume'`:
   * the saved run itself would not replay, so it is kept untouched until the
   * player says to throw it away.
   */
  readonly kind: 'run' | 'resume';
  /** What "Copy report" puts on the clipboard: the error plus the run's identity. */
  readonly report: string;
  /** Reloads the page — the one way back to a sim nobody has to trust after a throw. */
  readonly onReload: () => void;
  /** `'resume'` only: give up on the saved run and carry on from the title. */
  readonly onDiscard?: () => void;
}

/**
 * What a player sees instead of a frozen frame when something throws (#520).
 *
 * A DOM card rather than canvas art, like the playtest overlay it borrows its
 * look from: the renderer may be exactly what broke, and this has to show
 * regardless. It offers the reload that resumes the run from its last good
 * tick, and a report to copy for the bug tracker.
 */
export function showCrashScreen(deps: CrashScreenDeps): { close: () => void } {
  const { backdrop, card } = mount();
  const { locale } = deps;
  const close = (): void => {
    backdrop.remove();
  };
  card.appendChild(element('h2', undefined, t(locale, 'ui.crash.title')));
  card.appendChild(
    element(
      'p',
      undefined,
      t(locale, deps.kind === 'run' ? 'ui.crash.runBody' : 'ui.crash.resumeBody'),
    ),
  );
  const status = element('div', 'pt-status');
  status.setAttribute('role', 'status');
  const row = element('div', 'pt-row');
  const reload = element('button', 'pt-btn', t(locale, 'ui.crash.reload'));
  reload.type = 'button';
  reload.addEventListener('click', () => {
    deps.onReload();
  });
  row.appendChild(reload);
  const { onDiscard } = deps;
  if (onDiscard !== undefined) {
    const discard = element('button', 'pt-btn', t(locale, 'ui.crash.discard'));
    discard.classList.add('pt-secondary');
    discard.type = 'button';
    discard.addEventListener('click', () => {
      close();
      onDiscard();
    });
    row.appendChild(discard);
  }
  const copy = element('button', 'pt-btn', t(locale, 'ui.crash.copy'));
  copy.classList.add('pt-secondary');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    navigator.clipboard
      .writeText(deps.report)
      .then(() => {
        status.textContent = t(locale, 'ui.crash.copied');
      })
      .catch(() => {
        status.textContent = t(locale, 'ui.crash.copyFailed');
      });
  });
  row.appendChild(copy);
  card.append(row, status);
  reload.focus();
  return { close };
}

/** The clipboard text for a crash: enough to find the run again (seed, tick, floor, build) plus the error itself. */
export function crashReport(
  error: unknown,
  run: {
    readonly build: string;
    readonly seed: number;
    readonly tick: number;
    readonly floor: string;
  },
): string {
  const detail =
    error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
  return [
    `kellerbier crash — build ${run.build}`,
    `seed=${String(run.seed)} tick=${String(run.tick)} floor=${run.floor}`,
    detail,
  ].join('\n');
}
