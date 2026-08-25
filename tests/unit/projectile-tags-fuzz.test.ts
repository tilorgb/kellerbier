import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { NO_SLOT } from '../../src/sim/pool/slot-pool.js';
import { finalizeProjectileTags } from '../../src/sim/projectile/behavior.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { PROJECTILE_TAG_COUNT } from '../../src/sim/projectile/tags.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';

/**
 * The fuzz test #27's own acceptance criteria names (see #30): every possible
 * combination of `ProjectileTag` is applied to a real shot in a real room, and
 * the simulation is required to survive it — no exception, no `NaN`, no
 * position that has run off to infinity, no pool overrun. It does not assert
 * that every combination *feels* good; #27 explicitly accepts that some
 * combinations will surprise the authors, and grading them is a balance pass,
 * not a stability test.
 *
 * All 4,096 masks share one `GameSim` rather than each building a fresh one —
 * a fresh `GameSim` allocates a room's worth of component storage, and doing
 * that four thousand times is the slow part of this test, not stepping the
 * simulation itself. The shared state that could leak between masks (the
 * projectile pool, the target's health, any status effect left on it) is
 * reset explicitly at the top of every iteration instead.
 */

const ROOM_WIDTH = 640;
const ROOM_HEIGHT = 360;
/** Comfortably clear of anything a single seed shot plus its children can produce. */
const PROJECTILE_CAPACITY = 512;
/** Long enough for a slow tag (orbiting, returning) to complete at least one full cycle. */
const TICKS_PER_MASK = 90;
const FULL_HEALTH = 10_000;

describe('projectile tag fuzz (#27 acceptance criteria, see #30)', () => {
  it('is stable under every combination of tags', () => {
    const sim = new GameSim({
      room: new RoomGeometry(0, 0, ROOM_WIDTH, ROOM_HEIGHT),
      projectileCapacity: PROJECTILE_CAPACITY,
    });
    const targetIndex = entityIndex(sim.spawnTarget(ROOM_WIDTH * 0.75, ROOM_HEIGHT / 2, 8));
    sim.world.flush();

    for (let mask = 0; mask < 1 << PROJECTILE_TAG_COUNT; mask++) {
      sim.projectiles.clear();
      sim.statusEffect.data.fill(0);
      sim.health.data[targetIndex * 2] = FULL_HEALTH;
      sim.health.data[targetIndex * 2 + 1] = FULL_HEALTH;

      const slot = sim.projectiles.spawn(
        ROOM_WIDTH * 0.25,
        ROOM_HEIGHT / 2,
        2.5,
        0,
        3,
        1,
        60,
        ProjectileTeam.Player,
        mask,
      );
      expect(slot, `mask ${String(mask)} failed to spawn its seed shot`).not.toBe(NO_SLOT);
      finalizeProjectileTags(sim, slot);

      for (let tick = 0; tick < TICKS_PER_MASK; tick++) {
        expect(
          () => {
            sim.step();
          },
          `mask ${String(mask)} threw on tick ${String(tick)}`,
        ).not.toThrow();

        sim.projectiles.forEachLive((index) => {
          const x = sim.projectiles.x[index] ?? Number.NaN;
          const y = sim.projectiles.y[index] ?? Number.NaN;
          const vx = sim.projectiles.velocityX[index] ?? Number.NaN;
          const vy = sim.projectiles.velocityY[index] ?? Number.NaN;
          expect(Number.isFinite(x), `mask ${String(mask)} produced a non-finite x`).toBe(true);
          expect(Number.isFinite(y), `mask ${String(mask)} produced a non-finite y`).toBe(true);
          expect(Number.isFinite(vx), `mask ${String(mask)} produced a non-finite velocityX`).toBe(
            true,
          );
          expect(Number.isFinite(vy), `mask ${String(mask)} produced a non-finite velocityY`).toBe(
            true,
          );
        });

        expect(sim.projectiles.liveCount).toBeLessThanOrEqual(sim.projectiles.capacity);
      }
    }
  }, 180_000);
});
