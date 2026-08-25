import { ProjectileTag } from '../sim/projectile/tags.js';
import type { SimTuning } from '../sim/tuning.js';
import { injectDevUiTokens } from '../dev-ui/tokens.js';

/**
 * The projectile tag chooser (#27).
 *
 * A checklist of every `ProjectileTag`, writing straight into
 * `sim.tuning.shooting.forcedTags` — the same "a dev tool writes into the live
 * tuning object, the next tick reads it" wiring `tuning-window.ts` already
 * uses for every slider, just for a bitmask instead of a range. Checking
 * `homing` and `splitting` and firing is the fastest way to find out whether
 * a combination the engine allows is actually one worth shipping, which is
 * exactly what #27's own acceptance criteria asks be possible to do — "any
 * combination of tags can be applied without crashing or producing absurd
 * behaviour" is a claim the fuzz test proves and this is where a person
 * checks it feels right.
 *
 * DOM rather than drawn into the canvas, for the same reason as the tuning
 * window: a checkbox is a solved problem in HTML, costs the frame loop
 * nothing, and `src/debug/` is behind a dynamic import a production build
 * never reaches.
 */

/** Bavarian-adjacent is a stretch for a projectile tag; plain English is clearer here. */
const TAG_HINTS: Readonly<Record<string, string>> = {
  Homing: 'steers toward the nearest target',
  Piercing: 'flies through what it hits',
  Bouncing: 'reflects off a wall or a hit',
  Splitting: 'throws off children on a hit',
  Sticky: 'embeds itself in what it hits',
  Arcing: 'curves at a constant rate',
  Burning: 'sets a damage-over-time status',
  Freezing: 'sets a slow status',
  Poison: 'sets a second damage-over-time status',
  Spectral: 'passes through walls',
  Returning: 'flies back to where it was fired from',
  Orbiting: 'circles its spawn point',
};

const STYLE = `
.kb-tags-toggle {
  position: fixed; right: 12px; top: 12px; z-index: 30;
  font: 12px/1.4 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-surface-2); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 6px 10px; cursor: pointer;
}
.kb-tags-toggle:hover { background: var(--kb-color-surface-3); }
.kb-tags {
  position: fixed; right: 12px; top: 48px; z-index: 30;
  width: 240px; max-height: calc(100vh - 72px); overflow-y: auto;
  font: 12px/1.5 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-panel-tuning); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 10px 12px 12px;
}
.kb-tags[hidden] { display: none; }
.kb-tags h2 {
  margin: 0 0 6px; font-size: 11px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--kb-color-text-dim); font-weight: normal;
}
.kb-tags .kb-tag-row {
  display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; cursor: pointer;
}
.kb-tags .kb-tag-name { color: var(--kb-color-text); }
.kb-tags .kb-tag-hint { color: var(--kb-color-text-subtle); font-size: 11px; }
.kb-tags input[type='checkbox'] { accent-color: var(--kb-color-accent); }
.kb-tags .kb-tags-actions { display: flex; gap: 8px; margin-top: 8px; }
.kb-tags .kb-tags-actions button {
  flex: 1; font: 12px var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-surface-3); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-sm); padding: 5px 0; cursor: pointer;
}
.kb-tags .kb-tags-actions button:hover { background: var(--kb-color-surface-3-hover); }
.kb-tags .kb-tags-status { margin-top: 8px; color: var(--kb-color-text-dim); min-height: 1.4em; }
`;

export interface ProjectileTagChooserHandle {
  destroy(): void;
}

/** Builds the chooser and attaches it to the document, top-right. */
export function createProjectileTagChooser(tuning: SimTuning): ProjectileTagChooserHandle {
  injectDevUiTokens();

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'kb-tags';
  panel.hidden = true;

  const toggle = document.createElement('button');
  toggle.className = 'kb-tags-toggle';
  toggle.type = 'button';
  toggle.textContent = 'tags';

  const heading = document.createElement('h2');
  heading.textContent = 'shot tags — F3';
  panel.appendChild(heading);

  const shooting = tuning.shooting;
  const boxes: HTMLInputElement[] = [];

  for (const [name, tag] of Object.entries(ProjectileTag)) {
    const row = document.createElement('label');
    row.className = 'kb-tag-row';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = (shooting.forcedTags & tag) !== 0;
    input.addEventListener('change', () => {
      shooting.forcedTags = input.checked ? shooting.forcedTags | tag : shooting.forcedTags & ~tag;
    });
    boxes.push(input);

    const label = document.createElement('span');
    label.className = 'kb-tag-name';
    label.textContent = name.toLowerCase();

    const hint = document.createElement('span');
    hint.className = 'kb-tag-hint';
    hint.textContent = TAG_HINTS[name] ?? '';

    row.append(input, label, hint);
    panel.appendChild(row);
  }

  const status = document.createElement('p');
  status.className = 'kb-tags-status';

  const actions = document.createElement('div');
  actions.className = 'kb-tags-actions';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'clear all';
  clearButton.addEventListener('click', () => {
    shooting.forcedTags = 0;
    for (const box of boxes) {
      box.checked = false;
    }
    status.textContent = 'every shot fires plain again';
  });

  actions.append(clearButton);
  panel.append(actions, status);

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F3') {
      event.preventDefault();
      panel.hidden = !panel.hidden;
    }
  };
  window.addEventListener('keydown', onKeyDown);

  document.body.append(toggle, panel);

  return {
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      toggle.remove();
      panel.remove();
      style.remove();
    },
  };
}
