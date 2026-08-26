import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCESSIBILITY_SETTINGS,
  applySettingsToSim,
  loadSettings,
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
      saveSettings({ swayScale: 0, noDrift: true, neutralReskin: true });
    }).not.toThrow();
  });

  it('applies swayScale, and derives driftScale/wobbleScale from noDrift, onto a live GameSim', () => {
    const sim = new GameSim({ room: bareRoom() });
    applySettingsToSim(sim, { swayScale: 0.4, noDrift: true, neutralReskin: false });
    expect(sim.swayScale).toBe(0.4);
    expect(sim.driftScale).toBe(0);
    expect(sim.wobbleScale).toBe(0);

    applySettingsToSim(sim, { swayScale: 1, noDrift: false, neutralReskin: false });
    expect(sim.swayScale).toBe(1);
    expect(sim.driftScale).toBe(1);
    expect(sim.wobbleScale).toBe(1);
  });

  it('applying swayScale 0 is exact, not merely small', () => {
    const sim = new GameSim({ room: bareRoom() });
    applySettingsToSim(sim, { swayScale: 0, noDrift: false, neutralReskin: false });
    expect(sim.swayScale).toBe(0);
  });
});
