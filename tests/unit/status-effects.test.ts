import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { STATUS_EFFECT_STRIDE, STATUS_POISON } from '../../src/sim/systems/status-effects.js';
import { ParticleKind } from '../../src/sim/particle/store.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

/** Status effects on the player (poison's own tick), independent of what applied them. */

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

describe('player status effects', () => {
  it("a poison tick on the player sprays a distinct particle, not the ordinary hit's foam (#248)", () => {
    const sim = new GameSim({ room: bareRoom(), seed: 1, population: 'empty' });
    sim.tuning.curse.curseChance = 0;
    sim.loadRoom(minimalRoom(), 1);
    const base = sim.playerIndex * STATUS_EFFECT_STRIDE;
    sim.statusEffect.data[base + STATUS_POISON] = 60;

    const healthBefore = sim.playerHealth;
    sim.step(idle());
    sim.step(idle()); // poisonTickInterval's first multiple: the poison's own damage lands
    expect(sim.playerHealth).toBeLessThan(healthBefore);

    let sporeCount = 0;
    let foamCount = 0;
    sim.particles.forEachLive((index) => {
      if (sim.particles.kind[index] === ParticleKind.Spore) {
        sporeCount += 1;
      }
      if (sim.particles.kind[index] === ParticleKind.Foam) {
        foamCount += 1;
      }
    });
    expect(sporeCount).toBeGreaterThan(0);
    expect(foamCount).toBe(0);
  });
});
