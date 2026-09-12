/**
 * What a settings screen shows, as data.
 *
 * `render/settings-screen.ts` draws these and never learns what any of them
 * mean; `app/settings-menu.ts` builds them out of the live
 * `AccessibilitySettings`/`Preferences`/`Bindings` objects and owns every
 * consequence of a change (persisting it, re-applying it, arming a rebind
 * capture). That split is what lets the screen stay in `render/` beside the
 * rest of the menus — the layer that may not know about `localStorage`, a
 * `KeyboardEvent` or a `Gamepad` — while the settings themselves stay in
 * `app/`, where they already lived.
 *
 * Every row reads its value through a getter rather than carrying a snapshot,
 * for the same reason `MenuItem.disabled` is a predicate: a rebind changes
 * three rows at once, and a screen that had copied the old values would show
 * them until it was rebuilt.
 */

/** A 0-1-style continuous value, drawn as a filled track. */
export interface SettingsSliderRow {
  readonly kind: 'slider';
  readonly label: string;
  readonly min: number;
  readonly max: number;
  /** How far one press of left/right moves the value. */
  readonly step: number;
  readonly get: () => number;
  readonly set: (value: number) => void;
  /** The value as the player reads it — `'70%'`, `'1.5x'`. */
  readonly format: (value: number) => string;
}

/** On or off. */
export interface SettingsToggleRow {
  readonly kind: 'toggle';
  readonly label: string;
  readonly get: () => boolean;
  readonly set: (value: boolean) => void;
}

export interface SettingsChoice {
  /** Stable identity, so a choice list can hold numbers, strings or `'auto'` without the screen caring. */
  readonly id: string;
  readonly label: string;
}

/** One of a fixed set of options, cycled with left/right. */
export interface SettingsChoiceRow {
  readonly kind: 'choice';
  readonly label: string;
  readonly options: readonly SettingsChoice[];
  readonly get: () => string;
  readonly set: (id: string) => void;
}

/**
 * A row that does something when it is confirmed — "Reset all bindings",
 * "Toggle fullscreen", and every rebind row, whose `value` reads
 * `'Press a key…'` for as long as the capture the activation armed is running.
 */
export interface SettingsActionRow {
  readonly kind: 'action';
  readonly label: string;
  readonly activate: () => void;
  /** Drawn on the right of the row, like a slider's readout. Absent draws nothing. */
  readonly value?: () => string;
  /** Re-checked on every refresh, same contract as `MenuItem.disabled`. */
  readonly hidden?: () => boolean;
}

/** Static copy — the privacy tab's explanation, a controller-status line. Never focusable. */
export interface SettingsNoteRow {
  readonly kind: 'note';
  readonly text: () => string;
}

export type SettingsRow =
  SettingsSliderRow | SettingsToggleRow | SettingsChoiceRow | SettingsActionRow | SettingsNoteRow;

export interface SettingsTab {
  readonly label: string;
  readonly rows: readonly SettingsRow[];
}

/** True for the rows a focus cursor may land on. */
export function isFocusable(row: SettingsRow): boolean {
  if (row.kind === 'note') {
    return false;
  }
  if (row.kind === 'action') {
    return row.hidden?.() !== true;
  }
  return true;
}
