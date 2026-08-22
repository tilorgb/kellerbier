import { describe, expect, it } from 'vitest';
import { World } from '../../src/sim/ecs/world.js';

/**
 * The allocation-delta test from `docs/TECH_STACK.md` §2.
 *
 * GC spikes are the defining failure mode of a JavaScript bullet hell: a
 * `{x, y}` allocated inside the frame loop becomes a periodic frame spike that
 * lands exactly when the screen is busiest. Structure-of-Arrays storage is the
 * fix; this is the test that proves the fix is still in force.
 *
 * ## How the measurement works, and why it is shaped this way
 *
 * Forcing a collection *after* the loop and reading `heapUsed` measures what
 * survived, not what was allocated — a loop producing megabytes of garbage that
 * is immediately collectable reads as zero growth. So instead: collect once
 * before, then run few enough passes that the total stays inside V8's young
 * generation, and read `heapUsed` with no collection in between. Nothing is
 * reclaimed during the window, so the delta is the allocation.
 *
 * V8 also removes allocations it can prove do not escape, which makes a naive
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

const forceGc = (globalThis as { gc?: () => void }).gc;

const ENTITY_COUNT = 10_000;
/** Small enough that ~14 MB of control garbage still fits the young generation. */
const PASSES = 20;
/** Structure-of-Arrays measures ~16 KB per pass, which is measurement overhead, not per-entity garbage. */
const ZERO_ALLOCATION_BUDGET_BYTES = 128 * 1024;
/** The control measures ~700 KB per pass. Anything below this means the control stopped allocating. */
const CONTROL_FLOOR_BYTES = 256 * 1024;

function requireGc(): () => void {
  if (forceGc === undefined) {
    // Deliberately a failure rather than a skip: a silently skipped allocation
    // test is how this guarantee gets lost without anyone noticing.
    throw new Error('Run vitest with --expose-gc — see test.execArgv in vite.config.ts');
  }
  return forceGc;
}

/**
 * Heap bytes allocated per call of `pass`, measured with nothing reclaimed in
 * between.
 *
 * `prepare` runs after warm-up and before the forced collection, for a pass
 * that needs somewhere to retain the window's output.
 */
function bytesPerPass(pass: () => void, prepare?: () => void): number {
  const gc = requireGc();

  // Let V8 tier up to optimised code first; the tiering itself allocates, and
  // that is not what is being measured.
  for (let i = 0; i < 300; i++) {
    pass();
  }

  prepare?.();
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < PASSES; i++) {
    pass();
  }
  const after = process.memoryUsage().heapUsed;
  return (after - before) / PASSES;
}

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
    retained = new Array<{ x: number; y: number }>(ENTITY_COUNT * PASSES);
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
    const perPass = bytesPerPass(integrateWithGarbage, retainWindow);

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
