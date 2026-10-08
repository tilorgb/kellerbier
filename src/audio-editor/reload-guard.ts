/**
 * Lets the audio editor stay open through the one reload "Apply staged"
 * causes. New files under `assets/audio/` invalidate `import.meta.glob`'s
 * index, so Vite tells every page importing it to reload — the game, which
 * needs to, and this editor, which has nothing to gain (its staged state is
 * already cleared and the new files are registered by hand). Throwing from a
 * `vite:beforeFullReload` handler cancels the reload for this page only.
 *
 * Only held for a short window after an apply, so editing the editor's own
 * source still reloads it as usual.
 */
const HOLD_MS = 10_000;

let holdUntil = 0;

import.meta.hot?.on('vite:beforeFullReload', () => {
  if (Date.now() < holdUntil) {
    throw new Error('audio editor: reload held after "Apply staged"');
  }
});

export function holdEditorReload(): void {
  holdUntil = Date.now() + HOLD_MS;
}
