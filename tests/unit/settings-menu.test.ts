import { describe, expect, it } from 'vitest';
import { SettingsMenu } from '../../src/app/settings-menu.js';
import { DEFAULT_ACCESSIBILITY_SETTINGS } from '../../src/app/settings.js';
import { createDefaultPreferences } from '../../src/app/preferences.js';
import { GamepadSource } from '../../src/app/input/gamepad.js';
import {
  createDefaultTelemetryStore,
  type TelemetryStore,
} from '../../src/app/telemetry/schema.js';
import {
  isFocusable,
  type SettingsRow,
  type SettingsTab,
} from '../../src/render/ui/settings-model.js';

/**
 * The settings' *content*, tested where it is cheapest: this half has no
 * renderer in it at all (that is `render/settings-screen.ts`'s job), so a row
 * can be found by label, read, written and read back with nothing on screen.
 *
 * What is worth pinning down is the two things the DOM panel this replaced got
 * for free from the browser and now has to do itself: that changing a row
 * actually reaches the live settings object *and* the apply callback, and that
 * an armed rebind swallows the input that would otherwise have driven the menu.
 */

function rowOf(tabs: readonly SettingsTab[], tabLabel: string, label: string): SettingsRow {
  const tab = tabs.find((candidate) => candidate.label === tabLabel);
  const row = tab?.rows.find((candidate) => candidate.kind !== 'note' && candidate.label === label);
  if (row === undefined) {
    throw new Error(`no "${label}" row on the ${tabLabel} tab`);
  }
  return row;
}

function harness(): {
  menu: SettingsMenu;
  settings: typeof DEFAULT_ACCESSIBILITY_SETTINGS;
  preferences: ReturnType<typeof createDefaultPreferences>;
  applied: { accessibility: number; preferences: number };
  telemetry: TelemetryStore;
} {
  const settings = { ...DEFAULT_ACCESSIBILITY_SETTINGS };
  const preferences = createDefaultPreferences();
  const applied = { accessibility: 0, preferences: 0 };
  let telemetry = createDefaultTelemetryStore();
  const menu = new SettingsMenu({
    settings,
    preferences,
    // A pad that is never plugged in: `poll` returning nothing is exactly what
    // `navigator.getGamepads()` gives a browser with no controller on it.
    gamepad: new GamepadSource(() => []),
    onAccessibilityChange: () => {
      applied.accessibility += 1;
    },
    onPreferencesChange: () => {
      applied.preferences += 1;
    },
    telemetry: {
      get: () => telemetry,
      optIn: () => {
        telemetry = { ...telemetry, optedIn: true, sessionId: 'test' };
      },
      optOut: () => {
        telemetry = { ...telemetry, optedIn: false };
      },
      export: () => undefined,
      clear: () => {
        telemetry = { ...telemetry, runs: [] };
      },
    },
  });
  return { menu, settings, preferences, applied, telemetry };
}

describe('the settings menu model', () => {
  it('writes a slider straight through to the live settings object, and applies it', () => {
    const { menu, settings, applied } = harness();
    const row = rowOf(menu.tabs, 'Video', 'Screenshake');
    if (row.kind !== 'slider') throw new Error('Screenshake is not a slider');
    row.set(0.4);
    expect(settings.screenshakeScale).toBeCloseTo(0.4);
    expect(applied.accessibility).toBe(1);
    expect(row.get()).toBeCloseTo(0.4);
    expect(row.format(0.4)).toBe('40%');
  });

  it('writes a mixer bus through to the live preferences object', () => {
    const { menu, preferences, applied } = harness();
    const row = rowOf(menu.tabs, 'Audio', 'Music');
    if (row.kind !== 'slider') throw new Error('Music is not a slider');
    row.set(0.25);
    expect(preferences.mixer.music).toBeCloseTo(0.25);
    expect(applied.preferences).toBe(1);
  });

  it('carries a choice row by its id, not by its label', () => {
    const { menu, settings } = harness();
    const row = rowOf(menu.tabs, 'Accessibility', 'Text scale');
    if (row.kind !== 'choice') throw new Error('Text scale is not a choice');
    const larger = row.options.at(-1);
    expect(larger).toBeDefined();
    row.set(larger?.id ?? '1');
    expect(settings.textScale).toBeCloseTo(Number(larger?.id));
    expect(row.get()).toBe(larger?.id);
  });

  it('shows the binding a rebind row is about to replace, and then the new one', () => {
    const { menu, preferences } = harness();
    const row = rowOf(menu.tabs, 'Controls', 'Move up');
    if (row.kind !== 'action') throw new Error('Move up is not an action row');
    expect(row.value?.()).toBe('W');
    row.activate();
    expect(menu.capturing).toBe(true);
    expect(row.value?.()).toBe('Press a key…');
    menu.handleKeydown({ code: 'KeyI', preventDefault: () => undefined } as KeyboardEvent);
    expect(menu.capturing).toBe(false);
    expect(preferences.controls.bindings.keyboard.moveUp).toEqual(['KeyI']);
    expect(row.value?.()).toBe('I');
  });

  it('swallows every key while a rebind is armed, so navigation cannot steal it', () => {
    const { menu } = harness();
    const row = rowOf(menu.tabs, 'Controls', 'Fire');
    if (row.kind !== 'action') throw new Error('Fire is not an action row');
    expect(menu.handleKeydown({ code: 'ArrowDown' } as KeyboardEvent)).toBe(false);
    row.activate();
    expect(menu.handleKeydown({ code: 'ArrowDown' } as KeyboardEvent)).toBe(true);
    expect(menu.capturing).toBe(false);
  });

  it('cancels a capture on Escape without binding it', () => {
    const { menu, preferences } = harness();
    const row = rowOf(menu.tabs, 'Controls', 'Bomb');
    if (row.kind !== 'action') throw new Error('Bomb is not an action row');
    const before = [...preferences.controls.bindings.keyboard.bomb];
    row.activate();
    expect(menu.handleKeydown({ code: 'Escape' } as KeyboardEvent)).toBe(true);
    expect(menu.capturing).toBe(false);
    expect(preferences.controls.bindings.keyboard.bomb).toEqual(before);
  });

  it('rebinds for whichever device the Controls tab is set to', () => {
    const { menu, preferences } = harness();
    const device = rowOf(menu.tabs, 'Controls', 'Rebind for');
    if (device.kind !== 'choice') throw new Error('Rebind for is not a choice');
    device.set('gamepad');
    const row = rowOf(menu.tabs, 'Controls', 'Use');
    if (row.kind !== 'action') throw new Error('Use is not an action row');
    row.activate();
    // A keyboard event now belongs to nothing: the armed capture is a gamepad
    // one, and it must still not fall through to menu navigation.
    expect(menu.handleKeydown({ code: 'KeyJ' } as KeyboardEvent)).toBe(true);
    expect(preferences.controls.bindings.keyboard.use).not.toContain('KeyJ');
    expect(menu.capturing).toBe(true);
  });

  it('hides the telemetry export rows until there is something to export', () => {
    const { menu } = harness();
    const exportRow = rowOf(menu.tabs, 'Privacy', 'Export as file');
    expect(isFocusable(exportRow)).toBe(false);
    const toggle = rowOf(menu.tabs, 'Privacy', 'Share anonymous playtest telemetry');
    if (toggle.kind !== 'toggle') throw new Error('the consent row is not a toggle');
    toggle.set(true);
    expect(toggle.get()).toBe(true);
    // Still nothing recorded, so still nothing to export.
    expect(isFocusable(exportRow)).toBe(false);
  });

  it('never puts a focus cursor on a note', () => {
    for (const tab of menuTabs()) {
      for (const row of tab.rows) {
        if (row.kind === 'note') expect(isFocusable(row)).toBe(false);
      }
    }
  });
});

function menuTabs(): readonly SettingsTab[] {
  return harness().menu.tabs;
}
