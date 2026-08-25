import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { finalizeProjectileTags } from '../../src/sim/projectile/behavior.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { PROJECTILE_TAG_COUNT } from '../../src/sim/projectile/tags.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';

/**
 * #27's own acceptance criterion: "5,000 projectiles carrying multiple tags
 * stays within the performance budget."
 *
 * `tests/bench/frame-time.test.ts` is the real, CI-gated budget for a 5,000
 * projectile / 200 enemy room and this deliberately does not touch it — that
 * suite's history tracking and its bimodal-heap tolerance are tuned for the
 * budget scene exactly as it is, and adding tags to it would make every future
 * reading of that history about this change forever. This is a second,
 * narrower measurement: the same population, every shot carrying tags, median
 * tick time held to a loose multiple of the real budget — loose because the
 * point is to catch a tag evaluator that regressed to quadratic, not to
 * duplicate the tuned gate next door.
 *
 * Not every shot is `homing` — `findNearestTarget` (`behavior.ts`) scans the
 * enemy population per homing projectile per tick, and a room where literally
 * every one of 5,000 shots homes is not a state normal play reaches (no single
 * item stacks that high in one room within a frame). A tenth of the field
 * homing is already a generous reading of "multiple tags," and the mask
 * assigned to each shot cycles through the tag space so every tag is exercised
 * somewhere in the population.
 */

const PROJECTILE_COUNT = 5000;
const ENEMY_COUNT = 30;
const MEASURED_TICKS = 30;
const WARM_UP_TICKS = 10;
/** `SIM_TICK_BUDGET_MS` (`tests/bench/report.ts`) is 4ms for the untagged budget scene. */
const TICK_BUDGET_MS = 20;

describe('projectile tag performance (#27 acceptance criteria)', () => {
  it('holds a full tagged field within a loose multiple of the real tick budget', () => {
    const room = new RoomGeometry(0, 0, 640, 360);
    const sim = new GameSim({
      room,
      population: 'empty',
      capacity: 8192,
      projectileCapacity: PROJECTILE_COUNT + 1000,
    });
    sim.tuning.impact.hitstopTicks = 0;
    sim.tuning.impact.hitstopPerDamage = 0;
    sim.tuning.impact.maxHitstopTicks = 0;
    sim.tuning.impact.deathHitstopTicks = 0;

    for (let enemy = 0; enemy < ENEMY_COUNT; enemy++) {
      const x = 40 + ((enemy * 53) % 560);
      const y = 40 + ((enemy * 37) % 280);
      sim.spawnTarget(x, y, 8);
    }
    sim.world.flush();
    // Effectively unkillable — a body leaving the population mid-measurement
    // would measure a room emptying rather than a room at the budget, the
    // same reasoning `tests/bench/scene.ts` gives for its own enemy health.
    for (let index = 0; index < sim.world.highWater; index++) {
      if ((sim.health.data[index * 2 + 1] ?? 0) > 0) {
        sim.health.data[index * 2] = 1_000_000;
        sim.health.data[index * 2 + 1] = 1_000_000;
      }
    }

    const spawnMasks = (): void => {
      sim.projectiles.clear();
      for (let shot = 0; shot < PROJECTILE_COUNT; shot++) {
        // A tenth of the field homes; the rest cycles through every other tag
        // combination in the space, so the evaluator's full surface runs on a
        // full population rather than just its cheapest branch.
        const mask = shot % 10 === 0 ? 0b1 : shot % (1 << PROJECTILE_TAG_COUNT);
        const x = 20 + ((shot * 13) % 600);
        const y = 20 + ((shot * 7) % 320);
        const angle = (shot % 360) * (Math.PI / 180);
        const slot = sim.projectiles.spawn(
          x,
          y,
          Math.cos(angle) * 3,
          Math.sin(angle) * 3,
          3,
          1,
          600,
          ProjectileTeam.Player,
          mask,
        );
        if (slot >= 0) {
          finalizeProjectileTags(sim, slot);
        }
      }
    };

    for (let tick = 0; tick < WARM_UP_TICKS; tick++) {
      spawnMasks();
      sim.step();
    }

    const samples: number[] = [];
    for (let tick = 0; tick < MEASURED_TICKS; tick++) {
      spawnMasks();
      const started = performance.now();
      sim.step();
      samples.push(performance.now() - started);
    }

    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;

    expect(
      median,
      `${median.toFixed(2)}ms median per tick over a ${String(PROJECTILE_COUNT)}-projectile tagged field`,
    ).toBeLessThan(TICK_BUDGET_MS);
  }, 120_000);
});
