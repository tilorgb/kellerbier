import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { CURSE_IDS } from '../../src/sim/curse/definition.js';
import { STATUS_EFFECT_STRIDE, STATUS_POISON } from '../../src/sim/systems/status-effects.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

/**
 * Curses (#49): floor modifiers, rolled once per floor and announced on
 * entry. `curseChance` is pinned to 0 or 1 throughout — the roll itself is
 * a plain weighted RNG draw, nothing here needs to test *that* it is
 * probabilistic, only that it is deterministic and that each curse's own
 * effect actually happens.
 */

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/** Same minimal single-cell template `tests/unit/pickups.test.ts` uses. */
function minimalRoom(): unknown {
  return {
    id: 'test-room',
    tileGrid: [
      '###############',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '###############',
    ],
    obstacles: [],
    enemySpawns: [],
    spawnGroups: [],
    pickupSpawns: [],
    hazards: [],
    decorativeProps: [],
    metadata: {
      floorTags: ['cellar'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
    },
  };
}

const idle = () => createInputFrame();

/** A sim whose floor curse is rolled under a pinned `curseChance`, deterministically off `seed`. */
function simWithCurseChance(seed: number, chance: number): GameSim {
  const sim = new GameSim({ room: bareRoom(), seed, population: 'empty' });
  sim.tuning.curse.curseChance = chance;
  sim.loadRoom(minimalRoom(), 1);
  return sim;
}

/** The first seed (of a small sweep) whose floor rolls `id`, or throws — every id is reachable well within the sweep. */
function seedRollingCurse(id: (typeof CURSE_IDS)[number]): GameSim {
  for (let seed = 0; seed < 200; seed++) {
    const sim = simWithCurseChance(seed, 1);
    if (sim.curse === id) {
      return sim;
    }
  }
  throw new Error(`no seed under 200 rolled curse "${id}"`);
}

describe('floor curses (#49)', () => {
  it('never rolls a curse when curseChance is 0', () => {
    for (let seed = 0; seed < 10; seed++) {
      const sim = simWithCurseChance(seed, 0);
      expect(sim.curse).toBeNull();
      expect(sim.curseAnnouncement).toBeNull();
    }
  });

  it('always rolls a curse when curseChance is 1, and announces it', () => {
    const sim = simWithCurseChance(1, 1);
    expect(sim.curse).not.toBeNull();
    expect(CURSE_IDS).toContain(sim.curse);
    const announcement = sim.curseAnnouncement;
    expect(announcement).not.toBeNull();
    expect(announcement?.name.length).toBeGreaterThan(0);
    expect(announcement?.description.length).toBeGreaterThan(0);
  });

  it('is deterministic for a given seed', () => {
    const a = simWithCurseChance(42, 1);
    const b = simWithCurseChance(42, 1);
    expect(a.curse).toBe(b.curse);
  });

  it('the announcement fades on its own and never blocks the run', () => {
    const sim = simWithCurseChance(1, 1);
    expect(sim.curseAnnouncement).not.toBeNull();
    for (let tick = 0; tick < 600; tick++) {
      sim.step(idle());
    }
    expect(sim.curseAnnouncement).toBeNull();
    // The curse itself keeps being the active curse — only the banner ages out.
    expect(sim.curse).not.toBeNull();
  });

  it('covers every curse id within a small seed sweep', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200 && seen.size < CURSE_IDS.length; seed++) {
      const curse = simWithCurseChance(seed, 1).curse;
      if (curse !== null) {
        seen.add(curse);
      }
    }
    expect([...seen].sort()).toEqual([...CURSE_IDS].sort());
  });

  it('Kater starts the floor hungover', () => {
    const sim = seedRollingCurse('kater');
    expect(sim.hasKater).toBe(true);
  });

  it('Föhn pushes every live projectile every tick', () => {
    const sim = seedRollingCurse('foehn');
    const slot = sim.projectiles.spawn(160, 90, 1, 0, 3, 1, 500, ProjectileTeam.Player);
    const beforeX = sim.projectiles.velocityX[slot];
    const beforeY = sim.projectiles.velocityY[slot];
    sim.step(idle());
    // At least one axis has to move — the wind angle at tick 0 could in
    // principle land near-parallel to the shot's own velocity on one axis,
    // but never on both at once for `WIND_STRENGTH`'s magnitude.
    const movedX = sim.projectiles.velocityX[slot] !== beforeX;
    const movedY = sim.projectiles.velocityY[slot] !== beforeY;
    expect(movedX || movedY).toBe(true);
  });

  it('Sperrstunde counts down, then harasses the player without ending the run on its own', () => {
    const sim = seedRollingCurse('sperrstunde');
    sim.tuning.curse.sperrstundeTimerTicks = 3;
    // Re-roll under the shortened timer so the countdown is the one just set.
    sim.sperrstundeTicksLeft = 3;
    expect(sim.sperrstundeTicksLeft).toBe(3);

    sim.step(idle());
    sim.step(idle());
    sim.step(idle());
    expect(sim.sperrstundeTicksLeft).toBe(0);

    const base = sim.playerIndex * STATUS_EFFECT_STRIDE;
    expect(sim.statusEffect.data[base + STATUS_POISON] ?? 0).toBe(0);
    sim.step(idle());
    // The tick the timer actually hits zero, harassment applies immediately.
    expect(sim.statusEffect.data[base + STATUS_POISON] ?? 0).toBeGreaterThan(0);
    expect(sim.playerDead).toBe(false);
  });

  it('Nebel and Blaue Stunde carry no per-tick simulation side effect beyond the curse id', () => {
    for (const id of ['nebel', 'blaue-stunde'] as const) {
      const sim = seedRollingCurse(id);
      const healthBefore = sim.playerHealth;
      for (let tick = 0; tick < 60; tick++) {
        sim.step(idle());
      }
      expect(sim.playerHealth).toBe(healthBefore);
      expect(sim.curse).toBe(id);
    }
  });
});
