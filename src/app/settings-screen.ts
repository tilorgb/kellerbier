import {
  type AccessibilitySettings,
  SLOW_MODE_OPTIONS,
  TEXT_SCALE_OPTIONS,
  saveSettings,
} from './settings.js';
import { MAX_VIDEO_SCALE, type Preferences, savePreferences } from './preferences.js';
import { injectDevUiTokens } from '../dev-ui/tokens.js';
import {
  ALL_BINDABLE_ACTIONS,
  type BindableAction,
  type BindingDevice,
  resetBindings,
} from './input/bindings.js';
import { bindingLabels, detectGlyphSet } from './input/glyphs.js';
import { BindingCapture } from './input/rebind.js';
import type { GamepadSource } from './input/gamepad.js';
import type { ActiveDevice } from './input/sampler.js';

/**
 * The settings screen (#53): Video, Audio, Controls and Accessibility, in
 * one tabbed panel.
 *
 * This replaces `accessibility-panel.ts`'s small corner popup — that file's
 * own doc comment already called its shape "a debug-overlay-shaped stopgap
 * … acceptable for this slice as long as a normal player can also reach
 * it", with #53 named as the issue that would supersede it. `settings` and
 * `preferences` are mutated in place, the same contract that file used:
 * both objects are owned by `app/main.ts`, and every change here persists
 * immediately (`saveSettings`/`savePreferences`) and re-applies live via the
 * two callbacks, so a change is visible on the next tick rather than the
 * next restart.
 */

const STYLE = `
.kb-settings-toggle {
  position: fixed; left: 12px; bottom: 12px; z-index: 30;
  font: 12px/1.4 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-surface-2); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 6px 10px; cursor: pointer;
}
.kb-settings-toggle:hover { background: var(--kb-color-surface-3); }
/* touch-controls.ts claims all four corners, so a touch layout needs the
   toggle somewhere none of those four sticks/buttons sit — top-centre is the
   one strip of screen edge nothing else uses. */
.kb-settings-toggle.kb-settings-top-center { left: 50%; bottom: auto; top: 12px; transform: translateX(-50%); }

.kb-settings {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 31;
  width: 420px; max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  display: flex; flex-direction: column;
  font: 12px/1.5 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-panel-tuning); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md);
}
.kb-settings[hidden] { display: none; }

.kb-settings-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-bottom: 1px solid var(--kb-color-surface-4);
}
.kb-settings-header h1 {
  margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--kb-color-text-dim); font-weight: normal;
}
.kb-settings-close {
  background: none; border: none; color: var(--kb-color-text-dim); cursor: pointer;
  font: inherit; font-size: 14px; line-height: 1; padding: 2px 4px;
}
.kb-settings-close:hover { color: var(--kb-color-text); }

.kb-settings-tabs { display: flex; border-bottom: 1px solid var(--kb-color-surface-4); }
.kb-settings-tab {
  flex: 1; background: none; border: none; color: var(--kb-color-text-dim);
  font: inherit; padding: 8px 4px; cursor: pointer; border-bottom: 2px solid transparent;
}
.kb-settings-tab:hover { color: var(--kb-color-text); }
.kb-settings-tab.kb-active { color: var(--kb-color-accent); border-bottom-color: var(--kb-color-accent); }

.kb-settings-body { padding: 12px; overflow-y: auto; }
.kb-settings-section[hidden] { display: none; }

.kb-settings label { display: block; margin-bottom: 10px; }
.kb-row { display: flex; justify-content: space-between; gap: 8px; }
.kb-name { color: var(--kb-color-text); }
.kb-value { color: var(--kb-color-accent); font: inherit; font-variant-numeric: tabular-nums; }
.kb-settings input[type='range'] { width: 100%; margin: 2px 0 0; accent-color: var(--kb-color-accent); }
.kb-settings select {
  width: 100%; margin-top: 2px; font: inherit; color: var(--kb-color-text);
  background: var(--kb-color-surface-2); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-sm); padding: 3px 4px;
}
.kb-checkbox-row { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.kb-checkbox-row:last-child { margin-bottom: 0; }
.kb-checkbox-row input { accent-color: var(--kb-color-accent); }
.kb-settings button.kb-btn {
  font: inherit; color: var(--kb-color-text); background: var(--kb-color-surface-2);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 3px 8px; cursor: pointer;
}
.kb-settings button.kb-btn:hover { background: var(--kb-color-surface-3); }
.kb-settings button.kb-btn.kb-capturing { color: var(--kb-color-accent); border-color: var(--kb-color-accent); }

.kb-bind-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
.kb-bind-table th { text-align: left; color: var(--kb-color-text-dim); font-weight: normal; padding-bottom: 4px; }
.kb-bind-table td { padding: 2px 4px 2px 0; vertical-align: middle; }
.kb-bind-table td.kb-bind-cell { width: 40%; }
`;

/** Human-readable action names, in the order the rebind table lists them. */
const ACTION_LABELS: Readonly<Record<BindableAction, string>> = {
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  aimUp: 'Aim up',
  aimDown: 'Aim down',
  aimLeft: 'Aim left',
  aimRight: 'Aim right',
  fire: 'Fire',
  bomb: 'Bomb',
  use: 'Use',
  map: 'Map',
  pause: 'Pause',
};

export interface SettingsScreenHandle {
  destroy(): void;
}

export interface SettingsScreenOptions {
  /** See `kb-settings-toggle`'s own CSS comment. */
  readonly placement?: 'bottom-left' | 'top-center';
}

export interface SettingsScreenDeps {
  readonly settings: AccessibilitySettings;
  readonly preferences: Preferences;
  /** For gamepad rebind capture and glyph-set detection, not mutated here. */
  readonly gamepad: GamepadSource;
  readonly getActiveDevice: () => ActiveDevice;
  /** Called after any `settings` field changes — `app/main.ts`'s `applyAccessibilityChange`. */
  readonly onAccessibilityChange: () => void;
  /** Called after any `preferences` field changes — `app/main.ts`'s `applyPreferencesChange`. */
  readonly onPreferencesChange: () => void;
}

function saveAndApplySettings(deps: SettingsScreenDeps): void {
  saveSettings(deps.settings);
  deps.onAccessibilityChange();
}

function saveAndApplyPreferences(deps: SettingsScreenDeps): void {
  savePreferences(deps.preferences);
  deps.onPreferencesChange();
}

/** A `name: value%` slider row, 0-100 on screen, `min`-`max` underneath. */
function makeSlider(
  name: string,
  min: number,
  max: number,
  step: number,
  format: (value: number) => string,
  getValue: () => number,
  setValue: (value: number) => void,
): { readonly el: HTMLLabelElement; refresh(): void } {
  const label = document.createElement('label');
  const row = document.createElement('span');
  row.className = 'kb-row';
  const nameEl = document.createElement('span');
  nameEl.className = 'kb-name';
  nameEl.textContent = name;
  const valueEl = document.createElement('span');
  valueEl.className = 'kb-value';
  row.append(nameEl, valueEl);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);

  const refresh = (): void => {
    const value = getValue();
    slider.value = String(value);
    valueEl.textContent = format(value);
  };
  slider.addEventListener('input', () => {
    setValue(Number(slider.value));
    refresh();
  });
  refresh();

  label.append(row, slider);
  return { el: label, refresh };
}

/** A single checkbox row. */
function makeCheckbox(
  name: string,
  getValue: () => boolean,
  setValue: (value: boolean) => void,
): { readonly el: HTMLLabelElement; refresh(): void } {
  const row = document.createElement('label');
  row.className = 'kb-checkbox-row';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  const text = document.createElement('span');
  text.textContent = name;
  row.append(checkbox, text);

  const refresh = (): void => {
    checkbox.checked = getValue();
  };
  checkbox.addEventListener('change', () => {
    setValue(checkbox.checked);
    refresh();
  });
  refresh();

  return { el: row, refresh };
}

/** A `name` + `<select>` row over a fixed set of options. */
function makeSelect<T extends string | number>(
  name: string,
  choices: readonly { readonly value: T; readonly label: string }[],
  getValue: () => T,
  setValue: (value: T) => void,
): { readonly el: HTMLLabelElement; refresh(): void } {
  const wrapper = document.createElement('label');
  const nameEl = document.createElement('span');
  nameEl.className = 'kb-name';
  nameEl.textContent = name;
  const select = document.createElement('select');
  for (const choice of choices) {
    const option = document.createElement('option');
    option.value = String(choice.value);
    option.textContent = choice.label;
    select.appendChild(option);
  }

  const refresh = (): void => {
    select.value = String(getValue());
  };
  select.addEventListener('change', () => {
    const chosen = choices.find((choice) => String(choice.value) === select.value);
    if (chosen !== undefined) {
      setValue(chosen.value);
    }
    refresh();
  });
  refresh();

  wrapper.append(nameEl, select);
  return { el: wrapper, refresh };
}

function buildVideoSection(deps: SettingsScreenDeps): HTMLElement {
  const section = document.createElement('div');
  section.className = 'kb-settings-section';

  const scaleChoices: { value: number | 'auto'; label: string }[] = [
    { value: 'auto', label: 'Auto' },
  ];
  for (let scale = 1; scale <= MAX_VIDEO_SCALE; scale += 1) {
    scaleChoices.push({ value: scale, label: `${String(scale)}x` });
  }
  const scaleSelect = makeSelect(
    'Window scale',
    scaleChoices,
    () => deps.preferences.video.scale,
    (value) => {
      deps.preferences.video.scale = value;
      saveAndApplyPreferences(deps);
    },
  );

  const fullscreenButton = document.createElement('button');
  fullscreenButton.type = 'button';
  fullscreenButton.className = 'kb-btn';
  fullscreenButton.textContent = 'Toggle fullscreen';
  fullscreenButton.addEventListener('click', () => {
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  });

  const screenshake = makeSlider(
    'Screenshake',
    0,
    100,
    1,
    (v) => `${String(Math.round(v))}%`,
    () => deps.settings.screenshakeScale * 100,
    (v) => {
      deps.settings.screenshakeScale = v / 100;
      saveAndApplySettings(deps);
    },
  );

  const sway = makeSlider(
    'Camera sway',
    0,
    100,
    1,
    (v) => `${String(Math.round(v))}%`,
    () => deps.settings.swayScale * 100,
    (v) => {
      deps.settings.swayScale = v / 100;
      saveAndApplySettings(deps);
    },
  );

  const flashReduction = makeCheckbox(
    'Reduce flashing',
    () => deps.settings.reduceFlashes,
    (v) => {
      deps.settings.reduceFlashes = v;
      saveAndApplySettings(deps);
    },
  );

  section.append(scaleSelect.el, fullscreenButton, screenshake.el, sway.el, flashReduction.el);
  return section;
}

function buildAudioSection(deps: SettingsScreenDeps): HTMLElement {
  const section = document.createElement('div');
  section.className = 'kb-settings-section';

  const percent = (v: number): string => `${String(Math.round(v))}%`;
  const makeBusSlider = (
    name: string,
    get: () => number,
    set: (value: number) => void,
  ): HTMLLabelElement =>
    makeSlider(
      name,
      0,
      100,
      1,
      percent,
      () => get() * 100,
      (v) => {
        set(v / 100);
        saveAndApplyPreferences(deps);
      },
    ).el;

  section.append(
    makeBusSlider(
      'Master',
      () => deps.preferences.mixer.master,
      (v) => {
        deps.preferences.mixer.master = v;
      },
    ),
    makeBusSlider(
      'Music',
      () => deps.preferences.mixer.music,
      (v) => {
        deps.preferences.mixer.music = v;
      },
    ),
    makeBusSlider(
      'SFX',
      () => deps.preferences.mixer.sfx,
      (v) => {
        deps.preferences.mixer.sfx = v;
      },
    ),
    makeBusSlider(
      'Voice',
      () => deps.preferences.mixer.voice,
      (v) => {
        deps.preferences.mixer.voice = v;
      },
    ),
  );
  return section;
}

/**
 * One rebind cell: the current label(s) for `action` on `device`, and a
 * button that arms `capture` and listens for the next input. Keyboard and
 * gamepad share this — only how the next input arrives differs, and that
 * split already lives in `BindingCapture` itself.
 */
function buildBindCell(
  deps: SettingsScreenDeps,
  capture: BindingCapture,
  action: BindableAction,
  device: BindingDevice,
  refreshAll: () => void,
): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.className = 'kb-bind-cell';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'kb-btn';

  let cancelCapture: (() => void) | null = null;

  const label = (): string => {
    const set = device === 'keyboard' ? 'keyboard' : detectGlyphSet('gamepad', deps.gamepad.id);
    const labels = bindingLabels(deps.preferences.controls.bindings, action, device, set);
    return labels.length === 0 ? '—' : labels.join(' / ');
  };

  const refresh = (): void => {
    button.textContent = label();
    button.classList.remove('kb-capturing');
  };

  const stopCapturing = (): void => {
    cancelCapture?.();
    cancelCapture = null;
    capture.cancel();
    refresh();
  };

  button.addEventListener('click', () => {
    if (cancelCapture !== null) {
      stopCapturing();
      return;
    }
    capture.begin(action, device, 'replace');
    button.textContent = device === 'keyboard' ? 'Press a key…' : 'Press a button…';
    button.classList.add('kb-capturing');

    if (device === 'keyboard') {
      const onKeyDown = (event: KeyboardEvent): void => {
        event.preventDefault();
        const result = capture.captureKey(event.code);
        if (result !== null) {
          window.removeEventListener('keydown', onKeyDown, true);
          cancelCapture = null;
          capture.cancel();
          saveAndApplyPreferences(deps);
          refreshAll();
        }
      };
      window.addEventListener('keydown', onKeyDown, true);
      cancelCapture = () => {
        window.removeEventListener('keydown', onKeyDown, true);
      };
    } else {
      let frame = requestAnimationFrame(poll);
      let ticksLeft = 60 * 8; // ~8 seconds at a 60Hz poll, then give up quietly.
      function poll(): void {
        const result = capture.pollGamepad(deps.gamepad);
        if (result !== null) {
          cancelCapture = null;
          capture.cancel();
          saveAndApplyPreferences(deps);
          refreshAll();
          return;
        }
        ticksLeft -= 1;
        if (ticksLeft <= 0) {
          stopCapturing();
          return;
        }
        frame = requestAnimationFrame(poll);
      }
      cancelCapture = () => {
        cancelAnimationFrame(frame);
      };
    }
  });

  refresh();
  cell.appendChild(button);
  return cell;
}

function buildControlsSection(deps: SettingsScreenDeps): HTMLElement {
  const section = document.createElement('div');
  section.className = 'kb-settings-section';
  const capture = new BindingCapture(deps.preferences.controls.bindings);

  const table = document.createElement('table');
  table.className = 'kb-bind-table';
  const head = document.createElement('tr');
  for (const label of ['Action', 'Keyboard', 'Gamepad']) {
    const th = document.createElement('th');
    th.textContent = label;
    head.appendChild(th);
  }
  table.appendChild(head);

  const refreshCallbacks: (() => void)[] = [];
  const refreshAll = (): void => {
    for (const refresh of refreshCallbacks) {
      refresh();
    }
  };

  for (const action of ALL_BINDABLE_ACTIONS) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.textContent = ACTION_LABELS[action];
    row.appendChild(nameCell);
    row.appendChild(buildBindCell(deps, capture, action, 'keyboard', refreshAll));
    row.appendChild(buildBindCell(deps, capture, action, 'gamepad', refreshAll));
    table.appendChild(row);
  }

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'kb-btn';
  clearButton.textContent = 'Reset all bindings';
  clearButton.addEventListener('click', () => {
    resetBindings(deps.preferences.controls.bindings);
    saveAndApplyPreferences(deps);
    refreshAll();
  });

  const deadZone = makeSlider(
    'Gamepad dead zone',
    0,
    100,
    1,
    (v) => `${String(Math.round(v))}%`,
    () => deps.preferences.controls.gamepadDeadZone * 100,
    (v) => {
      deps.preferences.controls.gamepadDeadZone = v / 100;
      saveAndApplyPreferences(deps);
    },
  );

  const aimAssist = makeCheckbox(
    'Aim assist',
    () => deps.preferences.controls.aimAssist,
    (v) => {
      deps.preferences.controls.aimAssist = v;
      saveAndApplyPreferences(deps);
    },
  );

  section.append(table, clearButton, deadZone.el, aimAssist.el);
  return section;
}

function buildAccessibilitySection(deps: SettingsScreenDeps): HTMLElement {
  const section = document.createElement('div');
  section.className = 'kb-settings-section';

  const colorblind = makeCheckbox(
    'Colourblind-safe projectile marker',
    () => deps.settings.colorblindPalette,
    (v) => {
      deps.settings.colorblindPalette = v;
      saveAndApplySettings(deps);
    },
  );

  const textScale = makeSelect(
    'Text scale',
    TEXT_SCALE_OPTIONS.map((value) => ({ value, label: `${String(Math.round(value * 100))}%` })),
    () => deps.settings.textScale,
    (v) => {
      deps.settings.textScale = v;
      saveAndApplySettings(deps);
    },
  );

  const noDrift = makeCheckbox(
    'No-drift mode',
    () => deps.settings.noDrift,
    (v) => {
      deps.settings.noDrift = v;
      saveAndApplySettings(deps);
    },
  );

  const neutralReskin = makeCheckbox(
    'Neutral reskin (Kraft)',
    () => deps.settings.neutralReskin,
    (v) => {
      deps.settings.neutralReskin = v;
      saveAndApplySettings(deps);
    },
  );

  const reducedMotion = makeCheckbox(
    'Reduced motion',
    () => deps.settings.reducedMotion,
    (v) => {
      deps.settings.reducedMotion = v;
      saveAndApplySettings(deps);
    },
  );

  const slowMode = makeSelect(
    'Slow-mode',
    SLOW_MODE_OPTIONS.map((value) => ({
      value,
      label: value === 1 ? 'Off' : `${String(Math.round(value * 100))}%`,
    })),
    () => deps.settings.slowModeScale,
    (v) => {
      deps.settings.slowModeScale = v;
      saveAndApplySettings(deps);
    },
  );

  const reduceAudioDistortion = makeCheckbox(
    'Reduce Promille audio distortion',
    () => deps.settings.reduceAudioDistortion,
    (v) => {
      deps.settings.reduceAudioDistortion = v;
      saveAndApplySettings(deps);
    },
  );

  section.append(
    colorblind.el,
    textScale.el,
    noDrift.el,
    neutralReskin.el,
    reducedMotion.el,
    slowMode.el,
    reduceAudioDistortion.el,
  );
  return section;
}

const TABS: readonly {
  readonly id: 'video' | 'audio' | 'controls' | 'accessibility';
  readonly label: string;
}[] = [
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'controls', label: 'Controls' },
  { id: 'accessibility', label: 'Accessibility' },
];

/**
 * Builds and mounts the settings screen. `deps.settings`/`deps.preferences`
 * are mutated in place by every control here — the same objects
 * `app/main.ts` holds and re-applies from, so a change is visible the
 * moment its `on*Change` callback runs, with no restart.
 */
export function createSettingsScreen(
  deps: SettingsScreenDeps,
  options: SettingsScreenOptions = {},
): SettingsScreenHandle {
  injectDevUiTokens();

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const topCenter = options.placement === 'top-center';

  const panel = document.createElement('div');
  panel.className = 'kb-settings';
  panel.hidden = true;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = topCenter ? 'kb-settings-toggle kb-settings-top-center' : 'kb-settings-toggle';
  toggle.textContent = 'settings';

  const header = document.createElement('div');
  header.className = 'kb-settings-header';
  const title = document.createElement('h1');
  title.textContent = 'Settings';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'kb-settings-close';
  closeButton.textContent = '✕';
  closeButton.addEventListener('click', () => {
    panel.hidden = true;
  });
  header.append(title, closeButton);

  const tabBar = document.createElement('div');
  tabBar.className = 'kb-settings-tabs';

  const body = document.createElement('div');
  body.className = 'kb-settings-body';

  const sections: Record<(typeof TABS)[number]['id'], HTMLElement> = {
    video: buildVideoSection(deps),
    audio: buildAudioSection(deps),
    controls: buildControlsSection(deps),
    accessibility: buildAccessibilitySection(deps),
  };
  for (const tab of TABS) {
    sections[tab.id].hidden = true;
    body.appendChild(sections[tab.id]);
  }

  const tabButtons: HTMLButtonElement[] = [];
  let activeTab: (typeof TABS)[number]['id'] = 'video';

  const selectTab = (id: (typeof TABS)[number]['id']): void => {
    activeTab = id;
    for (const tab of TABS) {
      sections[tab.id].hidden = tab.id !== id;
    }
    for (const button of tabButtons) {
      button.classList.toggle('kb-active', button.dataset.tab === id);
    }
  };

  for (const tab of TABS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kb-settings-tab';
    button.textContent = tab.label;
    button.dataset.tab = tab.id;
    button.addEventListener('click', () => {
      selectTab(tab.id);
    });
    tabButtons.push(button);
    tabBar.appendChild(button);
  }
  selectTab(activeTab);

  panel.append(header, tabBar, body);

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  // O for the debug overlay, T for tuning, Y is what accessibility-panel.ts
  // used before this replaced it — kept as the settings screen's own key so
  // a player's muscle memory (or a bug report referencing it) still works.
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
