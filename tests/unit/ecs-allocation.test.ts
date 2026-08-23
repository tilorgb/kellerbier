import { describe, expect, it } from 'vitest';
import { World } from '../../src/sim/ecs/world.js';
import { PASSES_PER_WINDOW, bytesPerPass } from '../helpers/allocation.js';

/**
 * The allocation-delta test from `docs/TECH_STACK.md` §2.
 *
 * Structure-of-Arrays storage is what keeps the frame loop from producing
 * garbage; this is the test that proves it is still in force. How the
 * measurement itself works — and why it takes the minimum across several
 * windows — is documented in `tests/helpers/allocation.ts`.
 *
 * V8 removes allocations it can prove do not escape, which makes a naive
 * "allocate and drop it" control silently optimise away and the test pass for
 * the wrong reason. The control below retains its objects, which defeats scalar
 * replacement — and the control is asserted on, so if V8 ever does learn to
 * elide it, this suite fails loudly instead of going quietly vacuous.
 *
 * It retains them for the whole measured window rather than for one pass. A
 * scavenge landing mid-window would otherwise reclaim earlier passes' objects
 * and the control would measure a fraction of what it allocated — which is how
 * an allocation guard becomes flaky, and a flaky guard is one that gets muted.
 */

const ENTITY_COUNT = 10_000;
/**
 * The budget.
 *
 * The loop measures 0.2 KB per pass — effectively the measurement floor. This
 * is set far above that rather than at it, because CI hardware is unknown; it
 * is still tight enough to catch the regression it exists for, since one
 * object per entity would be several hundred KB.
 */
const ZERO_ALLOCATION_BUDGET_BYTES = 64 * 1024;
/** The control measures ~700 KB per pass. Below this, the control stopped allocating. */
const CONTROL_FLOOR_BYTES = 256 * 1024;

interface WorldHarness {
  readonly world: World;
  readonly integrate: () => void;
  readonly integrateWithGarbage: () => void;
  /** Gives the control a fresh, empty place to retain the measured window. */
  readonly retainWindow: () => void;
}

function buildWorld(): WorldHarness {
  const world = new World({ capacity: ENTITY_COUNT });
  const position = world.defineComponent('position', Float32Array, 2);
  const velocity = world.defineComponent('velocity', Float32Array, 2);

  for (let i = 0; i < ENTITY_COUNT; i++) {
    const entity = world.create();
    world.add(entity, position);
    world.add(entity, velocity);
  }
  world.flush();

  const mask = world.maskOf(position, velocity);

  // A system as a plain function over component arrays: no closures created per
  // call, no iterator objects, no destructuring, no temporary vectors.
  function integrate(): void {
    const states = world.states;
    const masks = world.masks;
    const px = position.data;
    const vx = velocity.data;
    const highWater = world.highWater;

    for (let index = 0; index < highWater; index++) {
      if (states[index] !== World.ALIVE) {
        continue;
      }
      if (((masks[index] ?? 0) & mask) !== mask) {
        continue;
      }
      const offset = index * 2;
      px[offset] = (px[offset] ?? 0) + (vx[offset] ?? 0);
      px[offset + 1] = (px[offset + 1] ?? 0) + (vx[offset + 1] ?? 0);
    }
  }

  // The control: the same work written the way that ruins JS games. Every
  // object produced is retained, so V8 cannot scalar-replace them away and a
  // scavenge inside the measured window promotes them rather than reclaiming
  // them.
  let retained = new Array<{ x: number; y: number }>(ENTITY_COUNT);
  let retainCursor = 0;

  function retainWindow(): void {
    retained = new Array<{ x: number; y: number }>(ENTITY_COUNT * PASSES_PER_WINDOW);
    retainCursor = 0;
  }

  function integrateWithGarbage(): void {
    const states = world.states;
    const masks = world.masks;
    const px = position.data;
    const vx = velocity.data;
    const highWater = world.highWater;

    for (let index = 0; index < highWater; index++) {
      if (states[index] !== World.ALIVE) {
        continue;
      }
      if (((masks[index] ?? 0) & mask) !== mask) {
        continue;
      }
      const offset = index * 2;
      const next = {
        x: (px[offset] ?? 0) + (vx[offset] ?? 0),
        y: (px[offset + 1] ?? 0) + (vx[offset + 1] ?? 0),
      };
      retained[retainCursor] = next;
      retainCursor = (retainCursor + 1) % retained.length;
      px[offset] = next.x;
      px[offset + 1] = next.y;
    }
  }

  return { world, integrate, integrateWithGarbage, retainWindow };
}

describe('ECS allocation behaviour', () => {
  it('integrates 10,000 entities without allocating', () => {
    const { integrate } = buildWorld();
    const perPass = bytesPerPass(integrate);

    expect(
      perPass,
      `${(perPass / 1024).toFixed(1)} KB per pass over ${String(ENTITY_COUNT)} entities ` +
        `(${(perPass / ENTITY_COUNT).toFixed(2)} bytes per entity)`,
    ).toBeLessThan(ZERO_ALLOCATION_BUDGET_BYTES);
  }, 30_000);

  it('detects allocation when it is there, so the measurement above means something', () => {
    const { integrateWithGarbage, retainWindow } = buildWorld();
    const perPass = bytesPerPass(integrateWithGarbage, { prepare: retainWindow });

    expect(
      perPass,
      `control allocated only ${(perPass / 1024).toFixed(1)} KB per pass — if V8 has ` +
        `started eliding it, the zero-allocation test above is no longer proving anything`,
    ).toBeGreaterThan(CONTROL_FLOOR_BYTES);
  }, 30_000);

  it('creates and destroys entities without growing after warm-up', () => {
    const world = new World({ capacity: 4096 });
    const position = world.defineComponent('position', Float32Array, 2);

    // Warm-up: reach the steady-state working set once.
    for (let i = 0; i < 4096; i++) {
      world.add(world.create(), position);
    }
    world.flush();
    const growthsAfterWarmup = world.growths;

    // Steady state: churn the whole population repeatedly. Slots are recycled,
    // so no reallocation should ever happen again.
    for (let round = 0; round < 20; round++) {
      for (let index = 0; index < world.highWater; index++) {
        if (world.states[index] === World.ALIVE) {
          world.destroy(world.entityAt(index));
        }
      }
      world.flush();
      for (let i = 0; i < 4096; i++) {
        world.add(world.create(), position);
      }
      world.flush();
    }

    expect(world.count).toBe(4096);
    expect(world.growths).toBe(growthsAfterWarmup);
  });
});
