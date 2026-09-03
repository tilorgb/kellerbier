import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCESSIBILITY_SETTINGS,
  SLOW_MODE_OPTIONS,
  TEXT_SCALE_OPTIONS,
  applySettingsToSim,
  loadSettings,
  sanitizeAccessibilitySettings,
  saveSettings,
} from '../../src/app/settings.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/**
 * This project's `vitest.config.ts` runs `environment: 'node'` — there is no
 * `localStorage` global here, the same as a headless/replay context. Every
 * test in this file relies on `loadSettings`/`saveSettings` catching that
 * rather than throwing, which is the behaviour these tests exist to pin
 * down (see `settings.ts`'s own doc comment on `loadSettings`).
 */
describe('accessibility settings (#33)', () => {
  it('falls back to the full, unaccessibility-adjusted defaults with no localStorage available', () => {
    expect(loadSettings()).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
  });

  it('never throws on save, even with nowhere to persist to', () => {
    expect(() => {
      saveSettings({
        ...DEFAULT_ACCESSIBILITY_SETTINGS,
        swayScale: 0,
        noDrift: true,
        neutralReskin: true,
      });
    }).not.toThrow();
  });

  it('never lets a render-only toggle reach the simulation', () => {
    // #153's reduced-motion and flash toggles must not change what a run
    // *does*, or a replay recorded with one on plays back differently with it
    // off (`docs/DECISIONS.md` #41). `applySettingsToSim` is the only channel
    // from settings into the sim, so this is where that is enforced.
    const plain = new GameSim({ room: bareRoom() });
    const suppressed = new GameSim({ room: bareRoom() });
    applySettingsToSim(plain, DEFAULT_ACCESSIBILITY_SETTINGS);
    applySettingsToSim(suppressed, {
      ...DEFAULT_ACCESSIBILITY_SETTINGS,
      reducedMotion: true,
      reduceFlashes: true,
    });
    expect(suppressed.swayScale).toBe(plain.swayScale);
    expect(suppressed.driftScale).toBe(plain.driftScale);
    expect(suppressed.wobbleScale).toBe(plain.wobbleScale);
    expect(suppressed.screenShakeScale).toBe(plain.screenShakeScale);
    expect(suppressed.hitstopScale).toBe(plain.hitstopScale);
  });

  it('applies swayScale, and derives driftScale/wobbleScale from noDrift, onto a live GameSim', () => {
    const sim = new GameSim({ room: bareRoom() });
    applySettingsToSim(sim, {
      ...DEFAULT_ACCESSIBILITY_SETTINGS,
      swayScale: 0.4,
      noDrift: true,
      neutralReskin: false,
    });
    expect(sim.swayScale).toBe(0.4);
    expect(sim.driftScale).toBe(0);
    expect(sim.wobbleScale).toBe(0);

    applySettingsToSim(sim, {
      ...DEFAULT_ACCESSIBILITY_SETTINGS,
      swayScale: 1,
      noDrift: false,
      neutralReskin: false,
    });
    expect(sim.swayScale).toBe(1);
    expect(sim.driftScale).toBe(1);
    expect(sim.wobbleScale).toBe(1);
  });

  it('applying swayScale 0 is exact, not merely small', () => {
    const sim = new GameSim({ room: bareRoom() });
    applySettingsToSim(sim, {
      ...DEFAULT_ACCESSIBILITY_SETTINGS,
      swayScale: 0,
      noDrift: false,
      neutralReskin: false,
    });
    expect(sim.swayScale).toBe(0);
  });

  it('applies screenshakeScale onto a live GameSim (#53)', () => {
    const sim = new GameSim({ room: bareRoom() });
    applySettingsToSim(sim, { ...DEFAULT_ACCESSIBILITY_SETTINGS, screenshakeScale: 0.3 });
    expect(sim.screenShakeScale).toBe(0.3);
  });

  it('applies hitstopScale onto a live GameSim (#235)', () => {
    const sim = new GameSim({ room: bareRoom() });
    applySettingsToSim(sim, { ...DEFAULT_ACCESSIBILITY_SETTINGS, hitstopScale: 0.3 });
    expect(sim.hitstopScale).toBe(0.3);
  });
});

describe('sanitizeAccessibilitySettings (#53)', () => {
  it('produces the full defaults from anything that is not a plain object', () => {
    for (const junk of [null, undefined, 42, 'nope', [1, 2, 3]]) {
      expect(sanitizeAccessibilitySettings(junk)).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    }
  });

  it('keeps a valid screenshakeScale and falls back an out-of-range one', () => {
    expect(sanitizeAccessibilitySettings({ screenshakeScale: 0.5 }).screenshakeScale).toBe(0.5);
    expect(sanitizeAccessibilitySettings({ screenshakeScale: 2 }).screenshakeScale).toBe(
      DEFAULT_ACCESSIBILITY_SETTINGS.screenshakeScale,
    );
    expect(sanitizeAccessibilitySettings({ screenshakeScale: -1 }).screenshakeScale).toBe(
      DEFAULT_ACCESSIBILITY_SETTINGS.screenshakeScale,
    );
  });

  it('keeps colorblindPalette and reduceAudioDistortion only when they are booleans', () => {
    expect(sanitizeAccessibilitySettings({ colorblindPalette: true }).colorblindPalette).toBe(true);
    expect(sanitizeAccessibilitySettings({ colorblindPalette: 'yes' }).colorblindPalette).toBe(
      false,
    );
    expect(
      sanitizeAccessibilitySettings({ reduceAudioDistortion: true }).reduceAudioDistortion,
    ).toBe(true);
    expect(
      sanitizeAccessibilitySettings({ reduceAudioDistortion: 'yes' }).reduceAudioDistortion,
    ).toBe(false);
  });

  it('keeps a textScale from the offered set and falls back to 1 for anything else', () => {
    for (const value of TEXT_SCALE_OPTIONS) {
      expect(sanitizeAccessibilitySettings({ textScale: value }).textScale).toBe(value);
    }
    expect(sanitizeAccessibilitySettings({ textScale: 1.1 }).textScale).toBe(1);
    expect(sanitizeAccessibilitySettings({ textScale: 'huge' }).textScale).toBe(1);
  });

  it('keeps a slowModeScale from the offered set and falls back to 1 (off) for anything else', () => {
    for (const value of SLOW_MODE_OPTIONS) {
      expect(sanitizeAccessibilitySettings({ slowModeScale: value }).slowModeScale).toBe(value);
    }
    expect(sanitizeAccessibilitySettings({ slowModeScale: 0.3 }).slowModeScale).toBe(1);
  });
});
