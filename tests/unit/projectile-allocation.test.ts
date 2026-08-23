import { describe, expect, it, vi } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { stepCollision } from '../../src/sim/systems/collision.js';
import { bytesPerPass } from '../helpers/allocation.js';

/**
 * The pooled hot loop, measured the way `tests/helpers/allocation.ts` describes.
 *
 * This is the test behind the flat-heap criterion on #12. A pool that quietly
 * started allocating — a closure per projectile, an array literal in the
 * despawn path — would show up here as a sawtooth in the profiler and as frame
 * spikes in the game, at exactly the moment the screen is fullest. It has
 * caught two: `Math.hypot` building an arguments object per call, and an arrow
 * function passed to the projectile loop.
 */

/** One measured pass is a second of simulation at 60 ticks. */
const TICKS_PER_PASS = 60;
/**
 * The budget.
 *
 * Well above what the loop measures, and far below what one object per
 * projectile per tick would cost — which is the regression it is here to catch.
 */
const ZERO_ALLOCATION_BUDGET_BYTES = 64 * 1024;

function firing(): InputFrame {
  const frame = createInputFrame();
  frame.moveX = quantiseAxis(0.7);
  frame.moveY = quantiseAxis(-0.7);
  frame.aimX = quantiseAxis(1);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

describe('projectile pool allocation behaviour', () => {
  it('fires continuously for 1,000 ticks without the pool growing', () => {
    const sim = new GameSim({ room: new RoomGeometry(0, 0, 640, 360) });
    sim.tuning.shooting.fireDelayTicks = 2;
    const input = firing();

    for (let tick = 0; tick < 1000; tick++) {
      sim.step(input);
    }

    expect(sim.projectiles.liveCount).toBeGreaterThan(0);
    expect(sim.projectiles.overflows).toBe(0);
    // The world holds the player and nothing else yet; a growth here would mean
    // the simulation had started creating entities per shot.
    expect(sim.world.growths).toBe(0);
  });

  it('holds a flat heap across a second of continuous fire', () => {
    const sim = new GameSim({ room: new RoomGeometry(0, 0, 640, 360) });
    sim.tuning.shooting.fireDelayTicks = 2;
    const input = firing();

    const pass = (): void => {
      for (let tick = 0; tick < TICKS_PER_PASS; tick++) {
        sim.step(input);
      }
    };

    // A pass here is sixty ticks, so far fewer of them are needed to see the
    // signal — and the warm-up also has to reach the steady-state population.
    const perPass = bytesPerPass(pass, { warmUpPasses: 20, passes: 5 });

    expect(
      perPass,
      `${(perPass / 1024).toFixed(1)} KB per simulated second of continuous fire`,
    ).toBeLessThan(ZERO_ALLOCATION_BUDGET_BYTES);
  }, 60_000);

  it('degrades gracefully and visibly when the pool is exhausted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sim = new GameSim({ room: new RoomGeometry(0, 0, 640, 360), projectileCapacity: 8 });
    sim.tuning.shooting.fireDelayTicks = 1;
    sim.tuning.shooting.shotLifetimeTicks = 600;
    const input = firing();

    for (let tick = 0; tick < 200; tick++) {
      sim.step(input);
    }

    // Full, still firing, and it said so — once, not two hundred times.
    expect(sim.projectiles.liveCount).toBe(8);
    expect(sim.projectiles.overflows).toBeGreaterThan(100);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/projectiles/);
    warn.mockRestore();
  });
});

describe('collision allocation behaviour', () => {
  it('resolves a full field without allocating', () => {
    const sim = new GameSim({ capacity: 4096, projectileCapacity: 2000 });
    for (let enemy = 0; enemy < 100; enemy++) {
      sim.spawnTarget(60 + (enemy % 10) * 50, 60 + Math.floor(enemy / 10) * 25, 8);
    }
    sim.world.flush();

    const shots = sim.projectiles;
    const pass = (): void => {
      shots.clear();
      for (let shot = 0; shot < 2000; shot++) {
        shots.spawn(40 + (shot % 100) * 5, 40 + ((shot / 100) | 0) * 15, 1, 0, 3, 1, 600, 0);
      }
      sim.events.clear();
      stepCollision(sim);
    };

    const perPass = bytesPerPass(pass, { warmUpPasses: 30, passes: 10 });

    expect(perPass, `${(perPass / 1024).toFixed(1)} KB per full-field collision pass`).toBeLessThan(
      ZERO_ALLOCATION_BUDGET_BYTES,
    );
  }, 60_000);
});
