import { describe, expect, it } from 'vitest';
import {
  MAX_VIDEO_SCALE,
  createDefaultPreferences,
  sanitizePreferences,
} from '../../src/app/preferences.js';
import { createDefaultBindings } from '../../src/app/input/bindings.js';
import { DEFAULT_DEAD_ZONE } from '../../src/app/input/gamepad.js';
import { DEFAULT_MIXER_SETTINGS } from '../../src/app/audio/mixer.js';

/**
 * #53's `Preferences` (Video/Audio/Controls) sanitisation and defaults —
 * the group-by-group fallback every other save-backed type in this project
 * follows.
 */

describe('createDefaultPreferences', () => {
  it('is auto scale, the full mixer, default bindings, no dead zone override, no aim assist', () => {
    const preferences = createDefaultPreferences();
    expect(preferences.video).toEqual({ scale: 'auto' });
    expect(preferences.mixer).toEqual(DEFAULT_MIXER_SETTINGS);
    expect(preferences.controls.bindings).toEqual(createDefaultBindings());
    expect(preferences.controls.gamepadDeadZone).toBe(DEFAULT_DEAD_ZONE);
    expect(preferences.controls.aimAssist).toBe(false);
  });

  it('hands back an independent Bindings object each call', () => {
    const a = createDefaultPreferences();
    const b = createDefaultPreferences();
    a.controls.bindings.keyboard.fire.push('KeyF');
    expect(b.controls.bindings.keyboard.fire).toEqual(['Space']);
  });
});

describe('sanitizePreferences', () => {
  it('produces the defaults from anything that is not a plain object', () => {
    for (const junk of [null, undefined, 42, 'nope', [1, 2, 3]]) {
      expect(sanitizePreferences(junk)).toEqual(createDefaultPreferences());
    }
  });

  it('falls back group-by-group rather than all-or-nothing', () => {
    const sanitized = sanitizePreferences({
      video: { scale: 3 },
      mixer: 'not-an-object',
      controls: { gamepadDeadZone: 0.4, aimAssist: true },
    });
    expect(sanitized.video).toEqual({ scale: 3 });
    expect(sanitized.mixer).toEqual(DEFAULT_MIXER_SETTINGS);
    expect(sanitized.controls.gamepadDeadZone).toBe(0.4);
    expect(sanitized.controls.aimAssist).toBe(true);
    expect(sanitized.controls.bindings).toEqual(createDefaultBindings());
  });

  describe('video.scale', () => {
    it('keeps a valid whole-number scale', () => {
      expect(sanitizePreferences({ video: { scale: 2 } }).video).toEqual({ scale: 2 });
      expect(sanitizePreferences({ video: { scale: MAX_VIDEO_SCALE } }).video).toEqual({
        scale: MAX_VIDEO_SCALE,
      });
    });

    it('keeps "auto"', () => {
      expect(sanitizePreferences({ video: { scale: 'auto' } }).video).toEqual({ scale: 'auto' });
    });

    it('falls back to auto for anything else', () => {
      for (const bad of [0, -1, 1.5, MAX_VIDEO_SCALE + 1, 'huge', null, undefined]) {
        expect(sanitizePreferences({ video: { scale: bad } }).video).toEqual({ scale: 'auto' });
      }
    });
  });

  describe('controls', () => {
    it('clamps gamepadDeadZone to defaults when out of 0-1', () => {
      expect(
        sanitizePreferences({ controls: { gamepadDeadZone: 2 } }).controls.gamepadDeadZone,
      ).toBe(DEFAULT_DEAD_ZONE);
      expect(
        sanitizePreferences({ controls: { gamepadDeadZone: -0.5 } }).controls.gamepadDeadZone,
      ).toBe(DEFAULT_DEAD_ZONE);
    });

    it('falls back aimAssist to false when not a boolean', () => {
      expect(sanitizePreferences({ controls: { aimAssist: 'yes' } }).controls.aimAssist).toBe(
        false,
      );
    });

    it('sanitises bindings action-by-action rather than discarding a good rebind', () => {
      const bindings = createDefaultBindings();
      bindings.keyboard.fire = ['KeyF'];
      const sanitized = sanitizePreferences({ controls: { bindings } });
      expect(sanitized.controls.bindings.keyboard.fire).toEqual(['KeyF']);
    });
  });
});
