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
import type { TelemetryStore } from './telemetry/schema.js';
import { LOCALES, LOCALE_NAMES } from '../i18n/locale.js';
import { t, type DictKey } from '../i18n/translate.js';

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

.kb-controller-status { margin: 0 0 10px; color: var(--kb-color-text-dim); }
.kb-controller-status.kb-controller-on { color: var(--kb-color-text); }
.kb-controller-status .kb-name { color: var(--kb-color-accent); }

.kb-privacy-copy { color: var(--kb-color-text-dim); margin: 0 0 10px; }
.kb-privacy-session { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; }
.kb-privacy-session code { color: var(--kb-color-accent); font: inherit; }
.kb-privacy-buttons { display: flex; gap: 8px; }
`;

/** Localisation keys for each bindable action, in the order the rebind table lists them. */
const ACTION_LABEL_KEYS: Readonly<Record<BindableAction, DictKey>> = {
  moveUp: 'ui.settings.action.moveUp',
  moveDown: 'ui.settings.action.moveDown',
  moveLeft: 'ui.settings.action.moveLeft',
  moveRight: 'ui.settings.action.moveRight',
  aimUp: 'ui.settings.action.aimUp',
  aimDown: 'ui.settings.action.aimDown',
  aimLeft: 'ui.settings.action.aimLeft',
  aimRight: 'ui.settings.action.aimRight',
  fire: 'ui.settings.action.fire',
  bomb: 'ui.settings.action.bomb',
  use: 'ui.settings.action.use',
  map: 'ui.settings.action.map',
  pause: 'ui.settings.action.pause',
};

export interface SettingsScreenHandle {
  /** Opens the panel — the title and pause menus' own "Settings" button, alongside the corner toggle. */
  open(): void;
  destroy(): void;
}

export interface SettingsScreenOptions {
  /** See `kb-settings-toggle`'s own CSS comment. */
  readonly placement?: 'bottom-left' | 'top-center';
  /**
   * Opened immediately, on `initialTab` (defaulting to `'video'`) — what a
   * locale change asks for (`app/main.ts`'s `applyPreferencesChange`
   * destroys and rebuilds this whole DOM screen to relabel it, and reopens
   * it exactly where the player was so picking a language doesn't also
   * close the panel on them).
   */
  readonly initialOpen?: boolean;
  readonly initialTab?: SettingsTabId;
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
  /**
   * The Privacy tab (#54, #159's playtest telemetry). Reads and writes go
   * through `app/telemetry/store.ts` rather than a mutable object this
   * screen owns directly, unlike `settings`/`preferences` above — consent
   * has to be a deliberate, persisted act the moment it is given
   * (`optIntoTelemetry` mints a fresh session id), not a value that could
   * already be sitting `true` in an in-memory object before the player ever
   * saw the checkbox.
   */
  readonly telemetry: {
    readonly get: () => TelemetryStore;
    readonly optIn: () => void;
    readonly optOut: () => void;
    readonly export: () => void;
    readonly clear: () => void;
  };
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
  const locale = deps.preferences.locale;

  const scaleChoices: { value: number | 'auto'; label: string }[] = [
    { value: 'auto', label: t(locale, 'ui.settings.video.auto') },
  ];
  for (let scale = 1; scale <= MAX_VIDEO_SCALE; scale += 1) {
    scaleChoices.push({ value: scale, label: `${String(scale)}x` });
  }
  const scaleSelect = makeSelect(
    t(locale, 'ui.settings.video.windowScale'),
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
  fullscreenButton.textContent = t(locale, 'ui.settings.video.toggleFullscreen');
  fullscreenButton.addEventListener('click', () => {
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  });

  const screenshake = makeSlider(
    t(locale, 'ui.settings.video.screenshake'),
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
    t(locale, 'ui.settings.video.camerasway'),
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

  const hitstop = makeSlider(
    t(locale, 'ui.settings.video.hitstop'),
    0,
    100,
    1,
    (v) => `${String(Math.round(v))}%`,
    () => deps.settings.hitstopScale * 100,
    (v) => {
      deps.settings.hitstopScale = v / 100;
      saveAndApplySettings(deps);
    },
  );

  const flashReduction = makeCheckbox(
    t(locale, 'ui.settings.video.reduceFlashing'),
    () => deps.settings.reduceFlashes,
    (v) => {
      deps.settings.reduceFlashes = v;
      saveAndApplySettings(deps);
    },
  );

  section.append(
    scaleSelect.el,
    fullscreenButton,
    screenshake.el,
    sway.el,
    hitstop.el,
    flashReduction.el,
  );
  return section;
}

function buildAudioSection(deps: SettingsScreenDeps): HTMLElement {
  const section = document.createElement('div');
  section.className = 'kb-settings-section';
  const locale = deps.preferences.locale;

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
      t(locale, 'ui.settings.audio.master'),
      () => deps.preferences.mixer.master,
      (v) => {
        deps.preferences.mixer.master = v;
      },
    ),
    makeBusSlider(
      t(locale, 'ui.settings.audio.music'),
      () => deps.preferences.mixer.music,
      (v) => {
        deps.preferences.mixer.music = v;
      },
    ),
    makeBusSlider(
      t(locale, 'ui.settings.audio.sfx'),
      () => deps.preferences.mixer.sfx,
      (v) => {
        deps.preferences.mixer.sfx = v;
      },
    ),
    makeBusSlider(
      t(locale, 'ui.settings.audio.voice'),
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
  const locale = deps.preferences.locale;

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
    button.textContent =
      device === 'keyboard'
        ? t(locale, 'ui.settings.controls.pressKey')
        : t(locale, 'ui.settings.controls.pressButton');
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

interface ControlsSection {
  readonly el: HTMLElement;
  /** Re-reads the pad and updates the status line — called on a timer while the panel is open. */
  readonly syncControllerStatus: () => void;
}

function buildControlsSection(deps: SettingsScreenDeps): ControlsSection {
  const section = document.createElement('div');
  section.className = 'kb-settings-section';
  const capture = new BindingCapture(deps.preferences.controls.bindings);
  const locale = deps.preferences.locale;

  // A live controller-status line. `navigator.getGamepads()` returns nothing
  // for a pad until a button is pressed on it (a fingerprinting defence —
  // `input/gamepad.ts`), and a browser-side gamepad-to-mouse mapper (Steam
  // Input's desktop config is the common one) hides the pad from the page
  // entirely while still driving the cursor with it. Both read to a player as
  // "the controller does nothing", so the panel says which it is rather than
  // leaving an unexplained absence — same reasoning as `input/gamepad.ts`'s
  // "ask for the press" note.
  const controllerStatus = document.createElement('p');
  controllerStatus.className = 'kb-controller-status';
  const syncControllerStatus = (): void => {
    deps.gamepad.update();
    if (deps.gamepad.connected) {
      controllerStatus.classList.add('kb-controller-on');
      controllerStatus.textContent = '';
      const label = document.createElement('span');
      label.className = 'kb-name';
      label.textContent = deps.gamepad.id ?? t(locale, 'ui.settings.controls.controllerFallback');
      controllerStatus.append(t(locale, 'ui.settings.controls.connectedPrefix'), label);
      if (!deps.gamepad.isStandardMapping) {
        controllerStatus.append(t(locale, 'ui.settings.controls.nonStandard'));
      }
    } else {
      controllerStatus.classList.remove('kb-controller-on');
      controllerStatus.textContent = t(locale, 'ui.settings.controls.none');
    }
  };
  syncControllerStatus();

  const table = document.createElement('table');
  table.className = 'kb-bind-table';
  const head = document.createElement('tr');
  for (const label of [
    t(locale, 'ui.settings.controls.action'),
    t(locale, 'ui.settings.controls.keyboard'),
    t(locale, 'ui.settings.controls.gamepad'),
  ]) {
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
    nameCell.textContent = t(locale, ACTION_LABEL_KEYS[action]);
    row.appendChild(nameCell);
    row.appendChild(buildBindCell(deps, capture, action, 'keyboard', refreshAll));
    row.appendChild(buildBindCell(deps, capture, action, 'gamepad', refreshAll));
    table.appendChild(row);
  }

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'kb-btn';
  clearButton.textContent = t(locale, 'ui.settings.controls.resetBindings');
  clearButton.addEventListener('click', () => {
    resetBindings(deps.preferences.controls.bindings);
    saveAndApplyPreferences(deps);
    refreshAll();
  });

  const deadZone = makeSlider(
    t(locale, 'ui.settings.controls.deadZone'),
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
    t(locale, 'ui.settings.controls.aimAssist'),
    () => deps.preferences.controls.aimAssist,
    (v) => {
      deps.preferences.controls.aimAssist = v;
      saveAndApplyPreferences(deps);
    },
  );

  section.append(controllerStatus, table, clearButton, deadZone.el, aimAssist.el);
  return { el: section, syncControllerStatus };
}

function buildAccessibilitySection(deps: SettingsScreenDeps): HTMLElement {
  const section = document.createElement('div');
  section.className = 'kb-settings-section';
  const locale = deps.preferences.locale;

  const colorblind = makeCheckbox(
    t(locale, 'ui.settings.accessibility.colourblind'),
    () => deps.settings.colorblindPalette,
    (v) => {
      deps.settings.colorblindPalette = v;
      saveAndApplySettings(deps);
    },
  );

  const textScale = makeSelect(
    t(locale, 'ui.settings.accessibility.textScale'),
    TEXT_SCALE_OPTIONS.map((value) => ({ value, label: `${String(Math.round(value * 100))}%` })),
    () => deps.settings.textScale,
    (v) => {
      deps.settings.textScale = v;
      saveAndApplySettings(deps);
    },
  );

  const noDrift = makeCheckbox(
    t(locale, 'ui.settings.accessibility.noDrift'),
    () => deps.settings.noDrift,
    (v) => {
      deps.settings.noDrift = v;
      saveAndApplySettings(deps);
    },
  );

  const neutralReskin = makeCheckbox(
    t(locale, 'ui.settings.accessibility.neutralReskin'),
    () => deps.settings.neutralReskin,
    (v) => {
      deps.settings.neutralReskin = v;
      saveAndApplySettings(deps);
    },
  );

  const reducedMotion = makeCheckbox(
    t(locale, 'ui.settings.accessibility.reducedMotion'),
    () => deps.settings.reducedMotion,
    (v) => {
      deps.settings.reducedMotion = v;
      saveAndApplySettings(deps);
    },
  );

  const slowMode = makeSelect(
    t(locale, 'ui.settings.accessibility.slowMode'),
    SLOW_MODE_OPTIONS.map((value) => ({
      value,
      label:
        value === 1
          ? t(locale, 'ui.settings.accessibility.slowModeOff')
          : `${String(Math.round(value * 100))}%`,
    })),
    () => deps.settings.slowModeScale,
    (v) => {
      deps.settings.slowModeScale = v;
      saveAndApplySettings(deps);
    },
  );

  const reduceAudioDistortion = makeCheckbox(
    t(locale, 'ui.settings.accessibility.reduceAudioDistortion'),
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

/**
 * The Privacy tab (#54, #159): opt-in playtest telemetry, in plain language,
 * at the point of consent — #54's own acceptance criterion. No slider or
 * select here, unlike every other tab: the whole tab is one decision (on or
 * off) plus what to do with what has already been collected.
 */
function buildPrivacySection(deps: SettingsScreenDeps): HTMLElement {
  const section = document.createElement('div');
  section.className = 'kb-settings-section';
  const locale = deps.preferences.locale;

  const copy = document.createElement('p');
  copy.className = 'kb-privacy-copy';
  copy.textContent = t(locale, 'ui.settings.privacy.copy');

  const sessionRow = document.createElement('div');
  sessionRow.className = 'kb-privacy-session';
  const sessionLabel = document.createElement('span');
  sessionLabel.className = 'kb-name';
  const sessionValue = document.createElement('code');

  const runCount = document.createElement('p');
  runCount.className = 'kb-privacy-copy';

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'kb-btn';
  exportButton.textContent = t(locale, 'ui.settings.privacy.exportButton');
  exportButton.addEventListener('click', () => {
    deps.telemetry.export();
  });

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'kb-btn';
  clearButton.textContent = t(locale, 'ui.settings.privacy.clearButton');
  clearButton.addEventListener('click', () => {
    deps.telemetry.clear();
    refresh();
  });

  const buttons = document.createElement('div');
  buttons.className = 'kb-privacy-buttons';
  buttons.append(exportButton, clearButton);

  const refresh = (): void => {
    const store = deps.telemetry.get();
    sessionLabel.textContent =
      store.sessionId === null ? '' : t(locale, 'ui.settings.privacy.session');
    sessionValue.textContent = store.sessionId ?? '';
    sessionRow.hidden = store.sessionId === null;
    runCount.textContent = store.optedIn
      ? store.runs.length === 1
        ? t(locale, 'ui.settings.privacy.runsRecordedOne')
        : t(locale, 'ui.settings.privacy.runsRecordedOther', { count: store.runs.length })
      : '';
    exportButton.hidden = store.runs.length === 0;
    clearButton.hidden = store.runs.length === 0;
  };

  const toggle = makeCheckbox(
    t(locale, 'ui.settings.privacy.shareToggle'),
    () => deps.telemetry.get().optedIn,
    (value) => {
      if (value) {
        deps.telemetry.optIn();
      } else {
        deps.telemetry.optOut();
      }
      refresh();
    },
  );

  sessionRow.append(sessionLabel, sessionValue);
  section.append(copy, toggle.el, sessionRow, runCount, buttons);
  refresh();
  return section;
}

/**
 * The Language tab (#52): one select over the three locales, in each
 * locale's own name (`LOCALE_NAMES`) rather than translated, the same
 * reason a language menu never translates its own entries — a player who
 * cannot yet read the current locale still has to be able to find their
 * own.
 */
function buildLanguageSection(deps: SettingsScreenDeps): HTMLElement {
  const section = document.createElement('div');
  section.className = 'kb-settings-section';
  const locale = deps.preferences.locale;

  const select = makeSelect(
    t(locale, 'ui.settings.tab.language'),
    LOCALES.map((value) => ({ value, label: LOCALE_NAMES[value] })),
    () => deps.preferences.locale,
    (value) => {
      deps.preferences.locale = value;
      saveAndApplyPreferences(deps);
    },
  );

  section.append(select.el);
  return section;
}

type SettingsTabId = 'video' | 'audio' | 'controls' | 'accessibility' | 'privacy' | 'language';

const TAB_IDS: readonly SettingsTabId[] = [
  'video',
  'audio',
  'controls',
  'accessibility',
  'privacy',
  'language',
];

const TAB_LABEL_KEYS: Readonly<Record<SettingsTabId, DictKey>> = {
  video: 'ui.settings.tab.video',
  audio: 'ui.settings.tab.audio',
  controls: 'ui.settings.tab.controls',
  accessibility: 'ui.settings.tab.accessibility',
  privacy: 'ui.settings.tab.privacy',
  language: 'ui.settings.tab.language',
};

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

  const locale = deps.preferences.locale;
  const topCenter = options.placement === 'top-center';

  const panel = document.createElement('div');
  panel.className = 'kb-settings';
  panel.hidden = !(options.initialOpen ?? false);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = topCenter ? 'kb-settings-toggle kb-settings-top-center' : 'kb-settings-toggle';
  toggle.textContent = t(locale, 'ui.settings.toggle');

  const header = document.createElement('div');
  header.className = 'kb-settings-header';
  const title = document.createElement('h1');
  title.textContent = t(locale, 'ui.settings.title');
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

  const controlsSection = buildControlsSection(deps);
  const sections: Record<SettingsTabId, HTMLElement> = {
    video: buildVideoSection(deps),
    audio: buildAudioSection(deps),
    controls: controlsSection.el,
    accessibility: buildAccessibilitySection(deps),
    privacy: buildPrivacySection(deps),
    language: buildLanguageSection(deps),
  };
  for (const id of TAB_IDS) {
    sections[id].hidden = true;
    body.appendChild(sections[id]);
  }

  const tabButtons: HTMLButtonElement[] = [];
  let activeTab: SettingsTabId = options.initialTab ?? 'video';

  const selectTab = (id: SettingsTabId): void => {
    activeTab = id;
    for (const tabId of TAB_IDS) {
      sections[tabId].hidden = tabId !== id;
    }
    for (const button of tabButtons) {
      button.classList.toggle('kb-active', button.dataset.tab === id);
    }
  };

  for (const id of TAB_IDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kb-settings-tab';
    button.textContent = t(locale, TAB_LABEL_KEYS[id]);
    button.dataset.tab = id;
    button.addEventListener('click', () => {
      selectTab(id);
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

  // Keep the Controls tab's controller-status line current while the panel is
  // open: a pad announces itself only on a button press, which can happen any
  // time after this screen is built. Twice a second is plenty for a line
  // nobody is staring at, and costs one `navigator.getGamepads()` call.
  const controllerPoll = window.setInterval(() => {
    if (!panel.hidden) {
      controlsSection.syncControllerStatus();
    }
  }, 500);

  document.body.append(toggle, panel);

  return {
    open(): void {
      panel.hidden = false;
    },
    destroy(): void {
      window.clearInterval(controllerPoll);
      window.removeEventListener('keydown', onKeyDown);
      toggle.remove();
      panel.remove();
      style.remove();
    },
  };
}
