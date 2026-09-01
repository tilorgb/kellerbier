import { Texture } from 'pixi.js';
import { compileAnimationSet } from '../../src/render/animation/definition.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { PARTICLE_KIND_IDS, ParticleKind } from '../../src/sim/particle/store.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { RngStream, createStreamRng } from '../../src/sim/rng/streams.js';
import { GameView } from '../../src/render/view.js';
import type { RoomTileArt } from '../../src/render/floor-art.js';
import { stubPlayerArt } from '../helpers/player-art.js';

/**
 * The stress scene: the performance budget in `docs/TECH_STACK.md` §3, built.
 *
 * 5,000 projectiles, 200 enemies and 1,000 particles, all moving, all
 * colliding, stepped through the real `GameSim.step` rather than through a
 * system lifted out of it. That is the difference between this and the
 * collision benchmark next door: that one keeps the broadphase honest, this one
 * is the frame the budget is actually written about — enemy behaviour, bodies,
 * collision, contacts, impact and particles, in the order the game runs them.
 */

/**
 * The field the budget is measured on.
 *
 * Deliberately not the playground room. The playground is 320x180 and sized so
 * that the player reads large against it; 200 bodies do not fit in it without
 * standing inside one another, which measures contact separation rather than a
 * frame. Same arena as the collision benchmark, so the two numbers are about
 * the same scene.
 */
export const ARENA_WIDTH = 640;
export const ARENA_HEIGHT = 360;

export const ENEMY_COUNT = 200;
export const PROJECTILE_COUNT = 5000;
export const PARTICLE_COUNT = 1000;

/**
 * Pool headroom above the projectile population.
 *
 * The scene holds 5,000 shots of its own and the Zapfhähne in it fire more. A
 * pool sized exactly to the population would spend the benchmark overflowing,
 * and an overflow is a warning and an early return — which is to say, less work
 * than the frame the budget describes.
 */
const PROJECTILE_CAPACITY = 6000;

/**
 * The same headroom for particles, for the same reason: every hit in the scene
 * throws foam on top of the thousand the budget names.
 */
const PARTICLE_CAPACITY = 3000;

/** Deterministic, so two runs of the benchmark measure the same scene. */
const SCENE_SEED = 7;

/**
 * Health the scene's enemies are given.
 *
 * Far more than the benchmark can chew through. Deaths are not excluded because
 * they are cheap to ignore — they are excluded because a body that dies leaves
 * the population, and a benchmark whose scene empties as it runs reports the
 * cost of a progressively emptier room. What the budget is about is a full one.
 */
const ENEMY_HEALTH = 30_000;

/** Ticks a shot in the scene lives, so none of them ends by expiring. */
const SHOT_LIFETIME_TICKS = 30_000;

/** The roster the scene is built from, by id. */
const ROSTER: readonly string[] = ['kellerassel', 'bierratte', 'schimmelfleck', 'zapfhahn'];

export interface StressScene {
  readonly sim: GameSim;
  /**
   * Puts the scene back at full population.
   *
   * Called once per measured tick, outside the timer. A room this full consumes
   * its own projectiles fast — a shot crosses 6 pixels a tick through a field
   * of 200 bodies, so within twenty ticks almost none of the original five
   * thousand are left. Without this the benchmark would measure a room emptying
   * rather than a room at the budget, and a real frame with 5,000 shots in it
   * is one where hundreds are being fired every tick anyway.
   *
   * It is deliberately cheap and allocation-free in the same way the game is,
   * because the heap measurement subtracts a window of it — see
   * `frame-time.test.ts`.
   */
  refill(): void;
}

/**
 * Builds the scene.
 *
 * No hitstop distortion to correct for here: a hit's reaction (`GameSim.hitStun`)
 * is local to the body that was struck rather than a stall of `GameSim.step`
 * itself, so a scene with hundreds of hits a tick still measures a real frame —
 * see `hitStun`'s doc comment on `GameSim` for why combat no longer goes
 * through the whole-simulation freeze at all.
 */
export function buildStressScene(): StressScene {
  const sim = new GameSim({
    seed: SCENE_SEED,
    capacity: 8192,
    projectileCapacity: PROJECTILE_CAPACITY,
    particleCapacity: PARTICLE_CAPACITY,
    room: new RoomGeometry(0, 0, ARENA_WIDTH, ARENA_HEIGHT),
    population: 'empty',
  });

  const random = createStreamRng(SCENE_SEED, RngStream.Enemies);

  const enemyX = new Float32Array(ENEMY_COUNT);
  const enemyY = new Float32Array(ENEMY_COUNT);
  let largestEnemyRadius = 0;
  for (let enemy = 0; enemy < ENEMY_COUNT; enemy++) {
    const definition = sim.enemies.indexOf(ROSTER[enemy % ROSTER.length] ?? '');
    const x = 40 + random.nextFloat() * (ARENA_WIDTH - 80);
    const y = 40 + random.nextFloat() * (ARENA_HEIGHT - 80);
    enemyX[enemy] = x;
    enemyY[enemy] = y;

    const index = entityIndex(sim.spawnEnemyKind(definition, x, y));
    sim.health.data[index * 2] = ENEMY_HEALTH;
    sim.health.data[index * 2 + 1] = ENEMY_HEALTH;
    largestEnemyRadius = Math.max(largestEnemyRadius, sim.enemies.at(definition).radius);
  }
  sim.world.flush();

  const shotRadius = sim.tuning.shooting.shotRadius;
  const shotSpeed = sim.tuning.shooting.shotSpeed;
  const clearance = largestEnemyRadius + shotRadius + 2;

  // Shots are laid out clear of where the enemies start rather than dropped
  // uniformly at random. Random placement begins with a fifth of the field
  // already overlapping something, which measures the hit path rather than a
  // frame — a fifth of every shot in the room connecting on one tick is not a
  // game state that happens. The bodies then walk about, so the scene drifts
  // back toward some overlap by itself, which is the amount that is wanted:
  // what a busy room does, rather than what a scene arranged to be busy does.
  const shotX = new Float32Array(PROJECTILE_COUNT);
  const shotY = new Float32Array(PROJECTILE_COUNT);
  const shotVelocityX = new Float32Array(PROJECTILE_COUNT);
  const shotVelocityY = new Float32Array(PROJECTILE_COUNT);
  for (let shot = 0; shot < PROJECTILE_COUNT; shot++) {
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 64; attempt++) {
      x = 40 + random.nextFloat() * (ARENA_WIDTH - 80);
      y = 40 + random.nextFloat() * (ARENA_HEIGHT - 80);
      let clear = true;
      for (let enemy = 0; enemy < ENEMY_COUNT; enemy++) {
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
    const angle = random.nextFloat() * Math.PI * 2;
    shotX[shot] = x;
    shotY[shot] = y;
    shotVelocityX[shot] = Math.cos(angle) * shotSpeed;
    shotVelocityY[shot] = Math.sin(angle) * shotSpeed;
  }

  // Everything the refill loop reads is hoisted out of it, including the two
  // tuning fields. That is not tidiness: a double read out of a mutable object
  // field inside a loop this long is worth twenty-odd kilobytes a tick to the
  // heap measurement, which is noise laid over the number the gate is about.
  const particles = sim.particles;
  const projectiles = sim.projectiles;
  const particleLife = sim.tuning.impact.particleLifeTicks;
  const particleSize = sim.tuning.impact.particleSize;

  const refill = (): void => {
    projectiles.clear();
    for (let shot = 0; shot < PROJECTILE_COUNT; shot++) {
      projectiles.spawn(
        shotX[shot] ?? 0,
        shotY[shot] ?? 0,
        shotVelocityX[shot] ?? 0,
        shotVelocityY[shot] ?? 0,
        shotRadius,
        1,
        SHOT_LIFETIME_TICKS,
        ProjectileTeam.Player,
      );
    }

    particles.clear();
    for (let particle = 0; particle < PARTICLE_COUNT; particle++) {
      particles.spawn(
        40 + ((particle * 37) % (ARENA_WIDTH - 80)),
        40 + ((particle * 53) % (ARENA_HEIGHT - 80)),
        ((particle % 7) - 3) * 0.3,
        ((particle % 5) - 2) * 0.3,
        particleLife,
        particleSize,
        // Every kind, not the two the game used to have (#153): each one is a
        // different texture, so a scene made of two of them would measure a
        // batch the real game no longer has. Cycled deterministically — this
        // is a benchmark, and a random mix would make two runs incomparable.
        PARTICLE_KIND_IDS[particle % PARTICLE_KIND_IDS.length] ?? ParticleKind.Foam,
      );
    }
  };

  refill();
  return { sim, refill };
}

/**
 * The renderer's scene graph for the stress scene, with no GPU behind it.
 *
 * `GameView.sync` is the CPU half of a rendered frame: it reads the simulation
 * and writes sprite transforms, and it is the half that scales with the five
 * thousand things on screen. Pixi builds and updates a scene graph perfectly
 * well without a renderer attached, so this part of the frame can be measured
 * on a machine with no display server — which is the whole point of a benchmark
 * that has to run in CI.
 *
 * What cannot be measured here is the other half: draw calls and GPU time need
 * a real context. Those stay in the debug overlay (`O`), which counts them in
 * the browser against the same budget.
 */
/** One floor's tileset, all `Texture.EMPTY` — the sprite *count* is what matters here. */
function benchTileset(): RoomTileArt {
  return {
    floorVariants: [Texture.EMPTY],
    wall: Texture.EMPTY,
    wallLip: Texture.EMPTY,
    wallLipCorner: Texture.EMPTY,
    blockVariants: [Texture.EMPTY],
    destructibles: [Texture.EMPTY],
  };
}

export function buildHeadlessView(sim: GameSim): GameView {
  return new GameView(sim, {
    playerArt: stubPlayerArt(),
    projectileArt: {
      player: Texture.EMPTY,
      playerTags: [],
      enemyByName: {},
      enemyByFloor: {},
      fallback: Texture.EMPTY,
    },
    projectileArtNames: [],
    entity: Texture.EMPTY,
    entityFlash: Texture.EMPTY,
    telegraph: Texture.EMPTY,
    // A distinct texture object per kind rather than one shared `Texture.EMPTY`:
    // the per-particle texture swap is exactly what #153 added to this loop, and
    // a scene where every kind points at the same object would not measure it.
    particleArt: {
      byKind: PARTICLE_KIND_IDS.map(() => new Texture()),
      fallback: Texture.EMPTY,
    },
    decal: Texture.EMPTY,
    numberFont: 'monospace',
    pedestalItem: Texture.EMPTY,
    pedestalBeam: Texture.EMPTY,
    // The room the game actually builds, not a bare one: a real tileset means
    // the wall band, the lip course and the obstacle tiles are all real
    // sprites, and the frame budget covers the ~400 of them a floor-1 room
    // now holds (#152) rather than measuring a scene that skips them.
    // `Texture.EMPTY` throughout — what is being measured is the per-frame
    // transform work, which costs the same whatever pixels a sprite points at.
    roomTiles: {
      1: benchTileset(),
      2: benchTileset(),
    },
    enemyArt: {},
    enemyFlash: {},
    // Every creature in the stress roster animates, so the frame-time budget
    // covers the animator (#150) rather than measuring a scene that happens to
    // skip it. `Texture.EMPTY` for every frame: what is being measured is the
    // per-body state resolution, clip advance and transform write, and those
    // cost the same whatever pixels the frame points at.
    enemyAnimation: Object.fromEntries(
      ROSTER.map((id) => [
        id,
        {
          frames: BENCH_STRIP_FRAMES.map(() => Texture.EMPTY),
          flashFrames: BENCH_STRIP_FRAMES.map(() => Texture.EMPTY),
          clips: compileAnimationSet(id, BENCH_SIDECAR, BENCH_STRIP_FRAMES.length),
        },
      ]),
    ),
  });
}

/** A four-frame walk plus a two-frame death — the shape a real creature's strip has. */
const BENCH_STRIP_FRAMES = [0, 1, 2, 3, 4, 5];
const BENCH_SIDECAR = {
  frames: BENCH_STRIP_FRAMES.length,
  frameDurationMs: 120,
  loop: true,
  clips: {
    idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
    move: { frames: [0, 1, 2, 3], frameDurationMs: 110, mode: 'loop' },
    hurt: { frames: [4], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
    death: { frames: [4, 5], frameDurationMs: 120, mode: 'once', onEnd: 'hold' },
  },
} as const;
