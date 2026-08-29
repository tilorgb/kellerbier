import type { AccessibilitySettings } from './settings.js';
import { saveSettings } from './settings.js';
import { injectDevUiTokens } from '../dev-ui/tokens.js';

/**
 * The accessibility panel (#33): camera-sway slider, no-drift toggle, neutral
 * reskin toggle.
 *
 * Unlike `src/debug/`'s tuning window, this is imported directly by
 * `app/main.ts` rather than behind a dynamic import, so it ships in a
 * production build — CLAUDE.md's own standard for a feature with
 * player-visible state: "a real, reachable way to toggle these while
 * playing, not just a script-only path." A DOM panel rather than an
 * in-canvas one for the same reason `tuning-window.ts` is DOM: a slider and
 * two checkboxes are a solved problem in HTML, and it costs the frame loop
 * nothing.
 *
 * Deliberately not a full settings *menu* — no tabs, no other categories.
 * The issue's own text calls a debug-overlay-shaped stopgap acceptable for
 * this slice as long as a normal player can also reach it, so this is that:
 * a small always-present panel, not gated behind any dev tooling.
 */

const STYLE = `
.kb-a11y-toggle {
  position: fixed; left: 12px; bottom: 12px; z-index: 30;
  font: 12px/1.4 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-surface-2); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 6px 10px; cursor: pointer;
}
.kb-a11y-toggle:hover { background: var(--kb-color-surface-3); }
.kb-a11y {
  position: fixed; left: 12px; bottom: 48px; z-index: 30;
  width: 240px;
  font: 12px/1.5 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-panel-tuning); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 10px 12px 12px;
}
.kb-a11y[hidden] { display: none; }
.kb-a11y h2 {
  margin: 0 0 8px; font-size: 11px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--kb-color-text-dim); font-weight: normal;
}
.kb-a11y label { display: block; margin-bottom: 10px; }
.kb-a11y .kb-row { display: flex; justify-content: space-between; gap: 8px; }
.kb-a11y .kb-name { color: var(--kb-color-text); }
.kb-a11y .kb-value {
  color: var(--kb-color-accent); font: inherit; font-variant-numeric: tabular-nums;
}
.kb-a11y input[type='range'] { width: 100%; margin: 2px 0 0; accent-color: var(--kb-color-accent); }
.kb-a11y .kb-checkbox-row { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.kb-a11y .kb-checkbox-row:last-child { margin-bottom: 0; }
.kb-a11y .kb-checkbox-row input { accent-color: var(--kb-color-accent); }
`;

export interface AccessibilityPanelHandle {
  destroy(): void;
}

/**
 * `settings` is mutated in place (the same object `app/main.ts` holds and
 * passes to `applySettingsToSim`/`PromilleHud.sync`), so nothing here needs
 * to hand a changed copy back. `onChange` fires after every mutation and
 * every persist, so the caller can re-apply to the live `sim` and refresh
 * anything already on screen (the HUD, the debug text) immediately.
 */
export function createAccessibilityPanel(
  settings: AccessibilitySettings,
  onChange: () => void,
): AccessibilityPanelHandle {
  injectDevUiTokens();

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'kb-a11y';
  panel.hidden = true;

  const toggle = document.createElement('button');
  toggle.className = 'kb-a11y-toggle';
  toggle.type = 'button';
  toggle.textContent = 'accessibility';

  const heading = document.createElement('h2');
  heading.textContent = 'accessibility';
  panel.appendChild(heading);

  // Camera sway (0-100%, reaching a genuine zero — see `GameSim.swayScale`).
  const swayLabel = document.createElement('label');
  const swayRow = document.createElement('span');
  swayRow.className = 'kb-row';
  const swayName = document.createElement('span');
  swayName.className = 'kb-name';
  swayName.textContent = 'camera sway';
  const swayValue = document.createElement('span');
  swayValue.className = 'kb-value';
  swayRow.append(swayName, swayValue);

  const swaySlider = document.createElement('input');
  swaySlider.type = 'range';
  swaySlider.min = '0';
  swaySlider.max = '100';
  swaySlider.step = '1';

  const refreshSway = (): void => {
    const percent = Math.round(settings.swayScale * 100);
    swaySlider.value = String(percent);
    swayValue.textContent = `${String(percent)}%`;
  };

  swaySlider.addEventListener('input', () => {
    // `/ 100` rather than any rounding that could leave a residue at either
    // end — the slider's own min/max are exactly 0 and 100, so this is
    // exactly 0 and exactly 1 at the ends, never 0.001 short of either.
    settings.swayScale = Number(swaySlider.value) / 100;
    refreshSway();
    saveSettings(settings);
    onChange();
  });

  swayLabel.append(swayRow, swaySlider);

  // No-drift mode.
  const driftRow = document.createElement('label');
  driftRow.className = 'kb-checkbox-row';
  const driftCheckbox = document.createElement('input');
  driftCheckbox.type = 'checkbox';
  const driftText = document.createElement('span');
  driftText.textContent = 'no-drift mode';
  driftRow.append(driftCheckbox, driftText);

  driftCheckbox.addEventListener('change', () => {
    settings.noDrift = driftCheckbox.checked;
    saveSettings(settings);
    onChange();
  });

  // Neutral reskin.
  const reskinRow = document.createElement('label');
  reskinRow.className = 'kb-checkbox-row';
  const reskinCheckbox = document.createElement('input');
  reskinCheckbox.type = 'checkbox';
  const reskinText = document.createElement('span');
  reskinText.textContent = 'neutral reskin (Kraft)';
  reskinRow.append(reskinCheckbox, reskinText);

  reskinCheckbox.addEventListener('change', () => {
    settings.neutralReskin = reskinCheckbox.checked;
    saveSettings(settings);
    onChange();
  });

  // Reduced motion (#153).
  const motionRow = document.createElement('label');
  motionRow.className = 'kb-checkbox-row';
  const motionCheckbox = document.createElement('input');
  motionCheckbox.type = 'checkbox';
  const motionText = document.createElement('span');
  motionText.textContent = 'reduced motion';
  motionRow.append(motionCheckbox, motionText);

  motionCheckbox.addEventListener('change', () => {
    settings.reducedMotion = motionCheckbox.checked;
    saveSettings(settings);
    onChange();
  });

  // Reduced flashing (#153).
  const flashRow = document.createElement('label');
  flashRow.className = 'kb-checkbox-row';
  const flashCheckbox = document.createElement('input');
  flashCheckbox.type = 'checkbox';
  const flashText = document.createElement('span');
  flashText.textContent = 'reduce flashing';
  flashRow.append(flashCheckbox, flashText);

  flashCheckbox.addEventListener('change', () => {
    settings.reduceFlashes = flashCheckbox.checked;
    saveSettings(settings);
    onChange();
  });

  const refresh = (): void => {
    refreshSway();
    driftCheckbox.checked = settings.noDrift;
    reskinCheckbox.checked = settings.neutralReskin;
    motionCheckbox.checked = settings.reducedMotion;
    flashCheckbox.checked = settings.reduceFlashes;
  };
  refresh();

  panel.append(swayLabel, driftRow, reskinRow, motionRow, flashRow);

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  // Y for accessibilitY — every other free-standing letter near the debug
  // keys (`O`/`T`/`I`, `overlay.ts`/`tuning-window.ts`/
  // `projectile-tag-chooser.ts`) is already spoken for, and this one is
  // unused across the whole input surface (checked against `input/` and
  // every `keydown` listener in `app/`, `debug/`, `editor/`).
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyY') {
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
