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

/** Human-readable action names, in the order the Controls tab lists them. */
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
  readonly tabs: readonly SettingsTab[];

  private readonly deps: SettingsMenuDeps;
  private readonly capture: BindingCapture;
  /** Which device the Controls tab's rebind rows are showing. */
  private device: BindingDevice = 'keyboard';

  constructor(deps: SettingsMenuDeps) {
    this.deps = deps;
    this.capture = new BindingCapture(deps.preferences.controls.bindings);
    this.tabs = [
      { label: 'Video', rows: this.videoRows() },
      { label: 'Audio', rows: this.audioRows() },
      { label: 'Controls', rows: this.controlsRows() },
      { label: 'Access', rows: this.accessibilityRows() },
      { label: 'Privacy', rows: this.privacyRows() },
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
    const scaleOptions = [{ id: 'auto', label: 'Auto' }];
    for (let scale = 1; scale <= MAX_VIDEO_SCALE; scale += 1) {
      scaleOptions.push({ id: String(scale), label: `${String(scale)}x` });
    }
    return [
      {
        kind: 'choice',
        label: 'Window scale',
        options: scaleOptions,
        get: () => String(this.deps.preferences.video.scale),
        set: (id) => {
          this.deps.preferences.video.scale = id === 'auto' ? 'auto' : Number(id);
          this.saveAndApplyPreferences();
        },
      },
      {
        kind: 'action',
        label: 'Fullscreen',
        value: () => (document.fullscreenElement === null ? 'Off' : 'On'),
        activate: () => {
          if (document.fullscreenElement === null) {
            void document.documentElement.requestFullscreen();
          } else {
            void document.exitFullscreen();
          }
        },
      },
      this.percentSlider(
        'Screenshake',
        () => this.deps.settings.screenshakeScale,
        (value) => {
          this.deps.settings.screenshakeScale = value;
        },
        () => {
          this.saveAndApplySettings();
        },
      ),
      this.percentSlider(
        'Camera sway',
        () => this.deps.settings.swayScale,
        (value) => {
          this.deps.settings.swayScale = value;
        },
        () => {
          this.saveAndApplySettings();
        },
      ),
      this.percentSlider(
        'Hitstop',
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
        label: 'Reduce flashing',
        get: () => this.deps.settings.reduceFlashes,
        set: (value) => {
          this.deps.settings.reduceFlashes = value;
          this.saveAndApplySettings();
        },
      },
    ];
  }

  private audioRows(): readonly SettingsRow[] {
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
      bus('Master', 'master'),
      bus('Music', 'music'),
      bus('SFX', 'sfx'),
      bus('Voice', 'voice'),
    ];
  }

  private controlsRows(): readonly SettingsRow[] {
    const rows: SettingsRow[] = [
      {
        kind: 'choice',
        label: 'Rebind for',
        options: [
          { id: 'keyboard', label: 'Keyboard' },
          { id: 'gamepad', label: 'Gamepad' },
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
            return (
              'No controller detected. If one is plugged in, press a button on it. Some tools ' +
              '(Steam Input, say) map a pad to the mouse and hide it from the browser.'
            );
          }
          const id = this.deps.gamepad.id ?? 'Controller';
          return this.deps.gamepad.isStandardMapping
            ? `Controller: ${id}`
            : `Controller: ${id} — non-standard layout, rebind below if the buttons are wrong.`;
        },
      },
    ];
    for (const action of ALL_BINDABLE_ACTIONS) {
      rows.push({
        kind: 'action',
        label: ACTION_LABELS[action],
        value: () => {
          const pending = this.capture.pending;
          if (pending?.action === action && pending.device === this.device) {
            return this.device === 'keyboard' ? 'Press a key' : 'Press a button';
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
        label: 'Reset all bindings',
        activate: () => {
          resetBindings(this.deps.preferences.controls.bindings);
          this.saveAndApplyPreferences();
        },
      },
      this.percentSlider(
        'Gamepad dead zone',
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
        label: 'Aim assist',
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
        'Colourblind marker',
        () => this.deps.settings.colorblindPalette,
        (value) => {
          this.deps.settings.colorblindPalette = value;
        },
      ),
      {
        kind: 'choice',
        label: 'Text scale',
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
        'No-drift mode',
        () => this.deps.settings.noDrift,
        (value) => {
          this.deps.settings.noDrift = value;
        },
      ),
      toggle(
        'Neutral reskin (Kraft)',
        () => this.deps.settings.neutralReskin,
        (value) => {
          this.deps.settings.neutralReskin = value;
        },
      ),
      toggle(
        'Reduced motion',
        () => this.deps.settings.reducedMotion,
        (value) => {
          this.deps.settings.reducedMotion = value;
        },
      ),
      {
        kind: 'choice',
        label: 'Slow-mode',
        options: SLOW_MODE_OPTIONS.map((value) => ({
          id: String(value),
          label: value === 1 ? 'Off' : `${String(Math.round(value * 100))}%`,
        })),
        get: () => String(this.deps.settings.slowModeScale),
        set: (id) => {
          this.deps.settings.slowModeScale = Number(id);
          this.saveAndApplySettings();
        },
      },
      toggle(
        'Reduce Promille audio distortion',
        () => this.deps.settings.reduceAudioDistortion,
        (value) => {
          this.deps.settings.reduceAudioDistortion = value;
        },
      ),
    ];
  }

  private privacyRows(): readonly SettingsRow[] {
    const hasRuns = (): boolean => this.deps.telemetry.get().runs.length > 0;
    return [
      {
        kind: 'note',
        text: () =>
          'Playtest telemetry is off by default. Turning it on records, on this device only, ' +
          'how each run ends, how long each room took, which items were held and how much ' +
          'time was spent at each Promille tier. Nothing else — no name, no account, no ' +
          'location. Nothing is ever sent anywhere automatically.',
      },
      {
        kind: 'toggle',
        label: 'Share playtest telemetry',
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
          return `${String(count)} run${count === 1 ? '' : 's'} recorded, waiting to be exported.`;
        },
      },
      {
        kind: 'action',
        label: 'Export as file',
        hidden: () => !hasRuns(),
        activate: () => {
          this.deps.telemetry.export();
        },
      },
      {
        kind: 'action',
        label: 'Clear recorded runs',
        hidden: () => !hasRuns(),
        activate: () => {
          this.deps.telemetry.clear();
        },
      },
    ];
  }
}
