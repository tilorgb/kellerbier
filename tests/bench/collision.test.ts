import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { RngStream, createStreamRng } from '../../src/sim/rng/streams.js';
import { stepCollision } from '../../src/sim/systems/collision.js';

/**
 * The collision half of the performance budget in `docs/TECH_STACK.md` §3.
 *
 * 5,000 projectiles against 200 enemies, resolved in under 2 ms of the 4 ms the
 * whole simulation tick is allowed. The real frame-time benchmark and its CI
 * gate are #16; this is what keeps the broadphase honest in the meantime,
 * because a quadratic sweep is roughly a thousand times slower and no amount of
 * later benchmarking recovers a design that shipped without a broadphase.
 */

/**
 * The field the budget is measured on.
 *
 * Its own arena rather than the playground room, because the two are sized for
 * different things. The playground is sized so the player reads large against
 * it; the budget is a throughput commitment — 200 enemies and 5,000 shots — and
 * 200 enemies do not fit in a playground room without standing inside each
 * other, which measures the hit path rather than the broadphase. Shrinking the
 * playground must not quietly change what this number means.
 */
const ARENA_WIDTH = 640;
const ARENA_HEIGHT = 360;

const ENEMY_COUNT = 200;
const PROJECTILE_COUNT = 5000;
const ENEMY_RADIUS = 8;
const SHOT_RADIUS = 3;
/** The budget itself. */
const TICK_BUDGET_MS = 2;
const MEASURED_TICKS = 60;
/**
 * Exact tests the broadphase may hand out for the budget scenario.
 *
 * The millisecond budget above is the commitment, but it is measured on
 * whatever machine happens to run the suite, and a timing gate on unknown
 * hardware is one that eventually gets muted. This is not a timing: it is the
 * exact number of candidate pairs the grid produced, and a pairwise sweep of
 * the same scene would produce 1,000,000 of them. It fails the instant the
 * broadphase stops being a broadphase.
 */
const MAX_CANDIDATES = 100_000;

interface Scene {
  readonly sim: GameSim;
  readonly shotX: Float32Array;
  readonly shotY: Float32Array;
}

/**
 * The budget scenario: a full field of enemies with a full field of shots in
 * flight among them.
 *
 * Shots are placed clear of enemies rather than dropped uniformly at random.
 * Random placement starts a fifth of the field already overlapping something,
 * which measures the hit-resolution path rather than the broadphase — and a
 * fifth of all projectiles connecting on the same tick is not a game state that
 * happens.
 */
function buildScene(enemyCount: number = ENEMY_COUNT): Scene {
  const sim = new GameSim({
    capacity: 8192,
    projectileCapacity: PROJECTILE_COUNT,
    room: new RoomGeometry(0, 0, ARENA_WIDTH, ARENA_HEIGHT),
  });
  const random = createStreamRng(7, RngStream.Enemies);

  const enemyX: number[] = [];
  const enemyY: number[] = [];
  for (let enemy = 0; enemy < enemyCount; enemy++) {
    const x = 40 + random.nextFloat() * (ARENA_WIDTH - 80);
    const y = 40 + random.nextFloat() * (ARENA_HEIGHT - 80);
    enemyX.push(x);
    enemyY.push(y);
    sim.spawnTarget(x, y, ENEMY_RADIUS);
  }
  sim.world.flush();

  const clearance = ENEMY_RADIUS + SHOT_RADIUS + 2;
  const shotX = new Float32Array(PROJECTILE_COUNT);
  const shotY = new Float32Array(PROJECTILE_COUNT);
  for (let shot = 0; shot < PROJECTILE_COUNT; shot++) {
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 64; attempt++) {
      x = 40 + random.nextFloat() * (ARENA_WIDTH - 80);
      y = 40 + random.nextFloat() * (ARENA_HEIGHT - 80);
      let clear = true;
      for (let enemy = 0; enemy < enemyCount; enemy++) {
        const dx = x - (enemyX[enemy] ?? 0);
        const dy = y - (enemyY[enemy] ?? 0);
        if (dx * dx + dy * dy < clearance * clearance) {
          clear = false;
          break;
        }
      }
      if (clear) {
        break;
      }
    }
    shotX[shot] = x;
    shotY[shot] = y;
  }

  return { sim, shotX, shotY };
}

/** Restores the full field, so every measured tick runs at the budget load. */
function refill(scene: Scene): void {
  const projectiles = scene.sim.projectiles;
  projectiles.clear();
  for (let shot = 0; shot < PROJECTILE_COUNT; shot++) {
    projectiles.spawn(
      scene.shotX[shot] ?? 0,
      scene.shotY[shot] ?? 0,
      0,
      0,
      SHOT_RADIUS,
      1,
      30_000,
      ProjectileTeam.Player,
    );
  }
}

/** Median milliseconds per tick over the measured window. */
function medianTickMs(scene: Scene, tick: () => void): number {
  const samples: number[] = [];
  for (let round = 0; round < MEASURED_TICKS; round++) {
    refill(scene);
    scene.sim.events.clear();
    const started = performance.now();
    tick();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;
}

describe('collision performance', () => {
  it('resolves 5,000 projectiles against 200 enemies inside the tick budget', () => {
    const scene = buildScene();
    const runBroadphase = (): void => {
      stepCollision(scene.sim);
    };

    // Warm up into optimised code before measuring.
    for (let round = 0; round < 10; round++) {
      refill(scene);
      runBroadphase();
    }

    const medianMs = medianTickMs(scene, runBroadphase);
    expect(
      medianMs,
      `${medianMs.toFixed(3)} ms per tick for ${String(PROJECTILE_COUNT)} projectiles ` +
        `against ${String(ENEMY_COUNT)} enemies`,
    ).toBeLessThan(TICK_BUDGET_MS);
  }, 60_000);

  it('hands out a small fraction of the pairs a full sweep would', () => {
    const scene = buildScene();
    refill(scene);
    stepCollision(scene.sim);

    const candidates = scene.sim.broadphase.candidatesReported;
    const everyPair = PROJECTILE_COUNT * ENEMY_COUNT;

    expect(
      candidates,
      `${String(candidates)} candidate pairs against ${String(everyPair)} for a full sweep ` +
        `— ${((candidates / everyPair) * 100).toFixed(2)}%`,
    ).toBeLessThan(MAX_CANDIDATES);
    expect(candidates).toBeGreaterThan(0);
  });
});
