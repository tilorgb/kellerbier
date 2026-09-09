import {
  type AccessibilitySettings,
  SLOW_MODE_OPTIONS,
  TEXT_SCALE_OPTIONS,
  saveSettings,
} from './settings.js';
import { MAX_VIDEO_SCALE, type Preferences, savePreferences } from './preferences.js';
import {
  ALL_BINDABLE_ACTIONS,
  type BindableAction,
  type BindingDevice,
  resetBindings,
} from './input/bindings.js';
import { bindingLabels, detectGlyphSet } from './input/glyphs.js';
import { BindingCapture } from './input/rebind.js';
import type { GamepadSource } from './input/gamepad.js';
import type { TelemetryStore } from './telemetry/schema.js';
import { isLocale, LOCALES, LOCALE_NAMES, type Locale } from '../i18n/locale.js';
import { t, type DictKey } from '../i18n/translate.js';
import type { SettingsRow, SettingsTab } from '../render/ui/settings-model.js';

/**
 * The settings *content* — what the tabs are, what each row reads and what
 * changing it does.
 *
 * The drawing is `render/settings-screen.ts`'s; this half is everything that
 * layer is not allowed to know about: the persisted objects, `localStorage`,
 * a `KeyboardEvent`, a `Gamepad`, `document.fullscreenElement`. It replaces
 * the DOM panel `app/settings-screen.ts` used to build, and keeps that file's
 * one real contract: `settings` and `preferences` are mutated **in place** —
 * the same objects `app/main.ts` holds and re-applies from — and every change
 * persists immediately, so it is visible on the next tick rather than the
 * next restart.
 *
 * Every label goes through `t()`, the same localisation layer (#52) the DOM
 * panel this replaced already used — most of the keys below are literally
 * that panel's own (`ui.settings.*`), reused rather than re-authored, so the
 * German and Boarisch text a native reviewer already signed off on carries
 * over unchanged.
 *
 * ## Rebinding, without a DOM event handler of its own
 *
 * The old panel armed a capture and then attached its own `window` keydown
 * listener per row. There is nowhere to hang that here, and it was never the
 * right shape anyway: while a capture is armed, *every* input belongs to the
 * capture and none of it to menu navigation. So the capture is state on this
 * object, `handleKeydown` and `poll` feed it, and
 * `ScreenFlowController` asks `capturing` first and routes everything there
 * while it is true.
 */

/** Localisation keys for each bindable action, in the order the Controls tab lists them. */
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

export interface SettingsMenuDeps {
  readonly settings: AccessibilitySettings;
  readonly preferences: Preferences;
  /** For gamepad rebind capture and glyph-set detection, not mutated here. */
  readonly gamepad: GamepadSource;
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
   * saw the row.
   */
  readonly telemetry: {
    readonly get: () => TelemetryStore;
    readonly optIn: () => void;
    readonly optOut: () => void;
    readonly export: () => void;
    readonly clear: () => void;
  };
}

export class SettingsMenu {
  tabs: readonly SettingsTab[];

  private readonly deps: SettingsMenuDeps;
  private readonly capture: BindingCapture;
  private locale: Locale;
  /** Which device the Controls tab's rebind rows are showing. */
  private device: BindingDevice = 'keyboard';

  constructor(deps: SettingsMenuDeps) {
    this.deps = deps;
    this.locale = deps.preferences.locale;
    this.capture = new BindingCapture(deps.preferences.controls.bindings);
    this.tabs = this.buildTabs();
  }

  /** Rebuilds every tab's labels in `locale` — call whenever the player changes the language. */
  setLocale(locale: Locale): void {
    this.locale = locale;
    this.tabs = this.buildTabs();
  }

  private buildTabs(): readonly SettingsTab[] {
    const locale = this.locale;
    return [
      { label: t(locale, 'ui.settings.tab.video'), rows: this.videoRows() },
      { label: t(locale, 'ui.settings.tab.audio'), rows: this.audioRows() },
      { label: t(locale, 'ui.settings.tab.controls'), rows: this.controlsRows() },
      { label: t(locale, 'ui.settings.tab.accessibility'), rows: this.accessibilityRows() },
      { label: t(locale, 'ui.settings.tab.privacy'), rows: this.privacyRows() },
      { label: t(locale, 'ui.settings.tab.language'), rows: this.languageRows() },
    ];
  }

  /** True while a rebind row is waiting for an input. Every other input belongs to it. */
  get capturing(): boolean {
    return this.capture.capturing;
  }

  cancelCapture(): void {
    this.capture.cancel();
  }

  /**
   * Feeds a key to a pending keyboard capture. Returns true when it consumed
   * the event — either by binding it or by cancelling on Escape.
   */
  handleKeydown(event: KeyboardEvent): boolean {
    if (!this.capture.capturing) {
      return false;
    }
    if (event.code === 'Escape') {
      this.capture.cancel();
      return true;
    }
    if (this.capture.captureKey(event.code) === null) {
      // A gamepad capture is armed: a keypress is not what it is waiting for,
      // but it is still not menu navigation either.
      return true;
    }
    this.capture.cancel();
    this.saveAndApplyPreferences();
    return true;
  }

  /**
   * Polls a pending gamepad capture, once per rendered frame while the screen
   * is open. Returns true when a binding was just taken.
   */
  poll(): boolean {
    if (!this.capture.capturing) {
      return false;
    }
    this.deps.gamepad.update();
    if (this.capture.pollGamepad(this.deps.gamepad) === null) {
      return false;
    }
    this.capture.cancel();
    this.saveAndApplyPreferences();
    return true;
  }

  private saveAndApplySettings(): void {
    saveSettings(this.deps.settings);
    this.deps.onAccessibilityChange();
  }

  private saveAndApplyPreferences(): void {
    savePreferences(this.deps.preferences);
    this.deps.onPreferencesChange();
  }

  /** A 0-100 percentage row over a 0-1 field. */
  private percentSlider(
    label: string,
    get: () => number,
    set: (value: number) => void,
    apply: () => void,
  ): SettingsRow {
    return {
      kind: 'slider',
      label,
      min: 0,
      max: 1,
      step: 0.05,
      get,
      set: (value) => {
        set(Math.round(value * 100) / 100);
        apply();
      },
      format: (value) => `${String(Math.round(value * 100))}%`,
    };
  }

  private videoRows(): readonly SettingsRow[] {
    const locale = this.locale;
    const scaleOptions = [{ id: 'auto', label: t(locale, 'ui.settings.video.auto') }];
    for (let scale = 1; scale <= MAX_VIDEO_SCALE; scale += 1) {
      scaleOptions.push({ id: String(scale), label: `${String(scale)}x` });
    }
    return [
      {
        kind: 'choice',
        label: t(locale, 'ui.settings.video.windowScale'),
        options: scaleOptions,
        get: () => String(this.deps.preferences.video.scale),
        set: (id) => {
          this.deps.preferences.video.scale = id === 'auto' ? 'auto' : Number(id);
          this.saveAndApplyPreferences();
        },
      },
      {
        kind: 'action',
        label: t(locale, 'ui.settings.video.fullscreen'),
        value: () =>
          document.fullscreenElement === null
            ? t(locale, 'ui.settings.value.off')
            : t(locale, 'ui.settings.value.on'),
        activate: () => {
          if (document.fullscreenElement === null) {
            void document.documentElement.requestFullscreen();
          } else {
            void document.exitFullscreen();
          }
        },
      },
      this.percentSlider(
        t(locale, 'ui.settings.video.screenshake'),
        () => this.deps.settings.screenshakeScale,
        (value) => {
          this.deps.settings.screenshakeScale = value;
        },
        () => {
          this.saveAndApplySettings();
        },
      ),
      this.percentSlider(
        t(locale, 'ui.settings.video.camerasway'),
        () => this.deps.settings.swayScale,
        (value) => {
          this.deps.settings.swayScale = value;
        },
        () => {
          this.saveAndApplySettings();
        },
      ),
      this.percentSlider(
        t(locale, 'ui.settings.video.hitstop'),
        () => this.deps.settings.hitstopScale,
        (value) => {
          this.deps.settings.hitstopScale = value;
        },
        () => {
          this.saveAndApplySettings();
        },
      ),
      {
        kind: 'toggle',
        label: t(locale, 'ui.settings.video.reduceFlashing'),
        get: () => this.deps.settings.reduceFlashes,
        set: (value) => {
          this.deps.settings.reduceFlashes = value;
          this.saveAndApplySettings();
        },
      },
    ];
  }

  private audioRows(): readonly SettingsRow[] {
    const locale = this.locale;
    const bus = (label: string, key: 'master' | 'music' | 'sfx' | 'voice'): SettingsRow =>
      this.percentSlider(
        label,
        () => this.deps.preferences.mixer[key],
        (value) => {
          this.deps.preferences.mixer[key] = value;
        },
        () => {
          this.saveAndApplyPreferences();
        },
      );
    return [
      bus(t(locale, 'ui.settings.audio.master'), 'master'),
      bus(t(locale, 'ui.settings.audio.music'), 'music'),
      bus(t(locale, 'ui.settings.audio.sfx'), 'sfx'),
      bus(t(locale, 'ui.settings.audio.voice'), 'voice'),
    ];
  }

  private controlsRows(): readonly SettingsRow[] {
    const locale = this.locale;
    const rows: SettingsRow[] = [
      {
        kind: 'choice',
        label: t(locale, 'ui.settings.controls.rebindFor'),
        options: [
          { id: 'keyboard', label: t(locale, 'ui.settings.controls.keyboard') },
          { id: 'gamepad', label: t(locale, 'ui.settings.controls.gamepad') },
        ],
        get: () => this.device,
        set: (id) => {
          this.device = id === 'gamepad' ? 'gamepad' : 'keyboard';
        },
      },
      // A pad announces itself to the page only once a button has been pressed
      // on it (`input/gamepad.ts`), and a gamepad-to-mouse mapper hides it
      // entirely. Both read to a player as "the controller does nothing", so
      // this says which it is rather than leaving an unexplained absence.
      {
        kind: 'note',
        text: () => {
          this.deps.gamepad.update();
          if (!this.deps.gamepad.connected) {
            return t(locale, 'ui.settings.controls.none');
          }
          const id = this.deps.gamepad.id ?? t(locale, 'ui.settings.controls.controllerFallback');
          const suffix = this.deps.gamepad.isStandardMapping
            ? ''
            : t(locale, 'ui.settings.controls.nonStandard');
          return `${t(locale, 'ui.settings.controls.connectedPrefix')}${id}${suffix}`;
        },
      },
    ];
    for (const action of ALL_BINDABLE_ACTIONS) {
      rows.push({
        kind: 'action',
        label: t(locale, ACTION_LABEL_KEYS[action]),
        value: () => {
          const pending = this.capture.pending;
          if (pending?.action === action && pending.device === this.device) {
            return this.device === 'keyboard'
              ? t(locale, 'ui.settings.controls.pressKey')
              : t(locale, 'ui.settings.controls.pressButton');
          }
          const set =
            this.device === 'keyboard'
              ? 'keyboard'
              : detectGlyphSet('gamepad', this.deps.gamepad.id);
          const labels = bindingLabels(
            this.deps.preferences.controls.bindings,
            action,
            this.device,
            set,
          );
          return labels.length === 0 ? '—' : labels.join(' / ');
        },
        activate: () => {
          this.capture.begin(action, this.device, 'replace');
        },
      });
    }
    rows.push(
      {
        kind: 'action',
        label: t(locale, 'ui.settings.controls.resetBindings'),
        activate: () => {
          resetBindings(this.deps.preferences.controls.bindings);
          this.saveAndApplyPreferences();
        },
      },
      this.percentSlider(
        t(locale, 'ui.settings.controls.deadZone'),
        () => this.deps.preferences.controls.gamepadDeadZone,
        (value) => {
          this.deps.preferences.controls.gamepadDeadZone = value;
        },
        () => {
          this.saveAndApplyPreferences();
        },
      ),
      {
        kind: 'toggle',
        label: t(locale, 'ui.settings.controls.aimAssist'),
        get: () => this.deps.preferences.controls.aimAssist,
        set: (value) => {
          this.deps.preferences.controls.aimAssist = value;
          this.saveAndApplyPreferences();
        },
      },
    );
    return rows;
  }

  private accessibilityRows(): readonly SettingsRow[] {
    const locale = this.locale;
    const toggle = (
      label: string,
      get: () => boolean,
      set: (value: boolean) => void,
    ): SettingsRow => ({
      kind: 'toggle',
      label,
      get,
      set: (value) => {
        set(value);
        this.saveAndApplySettings();
      },
    });
    return [
      toggle(
        t(locale, 'ui.settings.accessibility.colourblind'),
        () => this.deps.settings.colorblindPalette,
        (value) => {
          this.deps.settings.colorblindPalette = value;
        },
      ),
      {
        kind: 'choice',
        label: t(locale, 'ui.settings.accessibility.textScale'),
        options: TEXT_SCALE_OPTIONS.map((value) => ({
          id: String(value),
          label: `${String(Math.round(value * 100))}%`,
        })),
        get: () => String(this.deps.settings.textScale),
        set: (id) => {
          this.deps.settings.textScale = Number(id);
          this.saveAndApplySettings();
        },
      },
      toggle(
        t(locale, 'ui.settings.accessibility.noDrift'),
        () => this.deps.settings.noDrift,
        (value) => {
          this.deps.settings.noDrift = value;
        },
      ),
      toggle(
        t(locale, 'ui.settings.accessibility.neutralReskin'),
        () => this.deps.settings.neutralReskin,
        (value) => {
          this.deps.settings.neutralReskin = value;
        },
      ),
      toggle(
        t(locale, 'ui.settings.accessibility.reducedMotion'),
        () => this.deps.settings.reducedMotion,
        (value) => {
          this.deps.settings.reducedMotion = value;
        },
      ),
      {
        kind: 'choice',
        label: t(locale, 'ui.settings.accessibility.slowMode'),
        options: SLOW_MODE_OPTIONS.map((value) => ({
          id: String(value),
          label:
            value === 1
              ? t(locale, 'ui.settings.accessibility.slowModeOff')
              : `${String(Math.round(value * 100))}%`,
        })),
        get: () => String(this.deps.settings.slowModeScale),
        set: (id) => {
          this.deps.settings.slowModeScale = Number(id);
          this.saveAndApplySettings();
        },
      },
      toggle(
        t(locale, 'ui.settings.accessibility.reduceAudioDistortion'),
        () => this.deps.settings.reduceAudioDistortion,
        (value) => {
          this.deps.settings.reduceAudioDistortion = value;
        },
      ),
    ];
  }

  private privacyRows(): readonly SettingsRow[] {
    const locale = this.locale;
    const hasRuns = (): boolean => this.deps.telemetry.get().runs.length > 0;
    return [
      {
        kind: 'note',
        text: () => t(locale, 'ui.settings.privacy.copy'),
      },
      {
        kind: 'toggle',
        label: t(locale, 'ui.settings.privacy.shareToggle'),
        get: () => this.deps.telemetry.get().optedIn,
        set: (value) => {
          if (value) {
            this.deps.telemetry.optIn();
          } else {
            this.deps.telemetry.optOut();
          }
        },
      },
      {
        kind: 'note',
        text: () => {
          const store = this.deps.telemetry.get();
          if (!store.optedIn || store.runs.length === 0) {
            return '';
          }
          const count = store.runs.length;
          return count === 1
            ? t(locale, 'ui.settings.privacy.runsRecordedOne')
            : t(locale, 'ui.settings.privacy.runsRecordedOther', { count });
        },
      },
      {
        kind: 'action',
        label: t(locale, 'ui.settings.privacy.exportButton'),
        hidden: () => !hasRuns(),
        activate: () => {
          this.deps.telemetry.export();
        },
      },
      {
        kind: 'action',
        label: t(locale, 'ui.settings.privacy.clearButton'),
        hidden: () => !hasRuns(),
        activate: () => {
          this.deps.telemetry.clear();
        },
      },
    ];
  }

  /**
   * One choice row over the three locales, in each locale's own name
   * (`LOCALE_NAMES`) rather than translated — the same reason a language
   * menu never translates its own entries: a player who cannot yet read the
   * current locale still has to be able to find their own.
   */
  private languageRows(): readonly SettingsRow[] {
    return [
      {
        kind: 'choice',
        label: t(this.locale, 'ui.settings.tab.language'),
        options: LOCALES.map((value) => ({ id: value, label: LOCALE_NAMES[value] })),
        get: () => this.deps.preferences.locale,
        set: (id) => {
          if (isLocale(id)) {
            this.deps.preferences.locale = id;
            this.saveAndApplyPreferences();
          }
        },
      },
    ];
  }
}
