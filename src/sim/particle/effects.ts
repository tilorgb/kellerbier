import type { GameSim } from '../game/sim.js';
import { vectorLength } from '../math.js';
import { ParticleKind, type ParticleKindId } from './store.js';

/**
 * Every particle burst the game throws, in one place (#153).
 *
 * Before this there was exactly one burst — `spray`, private to
 * `systems/impact.ts` — and every effect in the game was it, in one of two
 * colours. The effects a VFX pass needs are not more of that: a muzzle flash,
 * a room clearing and a Schimmelfleck coming apart are different *statements*,
 * and they differ in count, spread, speed, lifetime and kind, not only in
 * tint.
 *
 * ## Why these live in the simulation
 *
 * Particles are simulation state and draw from the seeded cosmetic random
 * stream, for the reason `ParticleStore`'s own doc comment gives: a replay
 * whose foam sprays differently is no longer evidence of anything. That holds
 * for every effect here, which is also why **none of them are suppressed by
 * the accessibility toggles at this level** — a reduced-motion run must
 * produce the identical simulation to a full one, so the suppression happens
 * where it cannot change a replay, in `render/particles.ts`. See
 * `docs/DECISIONS.md` #41.
 *
 * ## Nothing here is information
 *
 * Every burst below is redundant with something the player can already see:
 * a hit already flashes and knocks back, a death already removes the body, a
 * cleared room already opens its doors, a collected pickup already vanishes.
 * That is a constraint on what may be added here, not an observation — an
 * effect that carried the only copy of some fact would make the accessibility
 * toggles unusable.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/**
 * How hard each kind is dragged, as a multiplier on `impact.particleDrag`.
 *
 * Above 1 means *less* drag (drag is a per-tick velocity multiplier below 1,
 * so scaling it up toward 1 makes a particle carry further). A spore hangs in
 * the air; a splinter stops where it lands; a muzzle flash never moves at all.
 */
const DRAG_SCALE: readonly number[] = [
  1, // Foam
  1, // Splash
  0.94, // Spark — hard and short, stops fast
  1.03, // Dust — hangs
  1.05, // Spore — hangs longest
  0.92, // Shard — heavy, drops where it lands
  1.02, // Ember
  1.01, // Glint
  1, // Flash — spawned with no velocity, so this never applies
];

/** `impact.particleDrag`, adjusted for what kind of particle this is. */
export function dragFor(baseDrag: number, kind: number): number {
  return Math.min(0.999, baseDrag * (DRAG_SCALE[kind] ?? 1));
}

/**
 * The four draws one particle needs, taken in one call.
 *
 * `nextFloat` hands a double back across a call boundary, and V8 boxes one it
 * does not inline. At four a particle and thousands of particles a tick that
 * was 83 KB of garbage per tick on the stress scene — see `Rng.nextFloats`,
 * which exists for this call site.
 */
const DRAW_ANGLE = 0;
const DRAW_SPEED = 1;
const DRAW_LIFE = 2;
const DRAW_SIZE = 3;
const DRAWS_PER_PARTICLE = 4;
const draws = new Float64Array(DRAWS_PER_PARTICLE);

/**
 * A burst of `count` particles, thrown from `(x, y)` into a cone `spread`
 * wide around the impact normal.
 *
 * Drawn from the cosmetic random stream, which exists exactly for this: a
 * particle effect that rolled from the shared generator would shift every
 * subsequent draw in the run, so adding one spark would silently rewrite every
 * floor layout in the game.
 */
export function spray(
  sim: GameSim,
  x: number,
  y: number,
  normalX: number,
  normalY: number,
  count: number,
  kind: ParticleKindId,
  spread: number,
  speedScale: number,
  lifeScale = 1,
  sizeScale = 1,
): void {
  const tuning = sim.tuning.impact;
  const random = sim.random.cosmetic;

  // `vectorLength`, not `Math.hypot`: the same value, and the one this file's
  // caller has always used. `Math.hypot` is variadic and V8 declines to inline
  // it, which in a function that runs per burst per tick is a measurable
  // difference for no benefit.
  const length = vectorLength(normalX, normalY);
  const baseAngle = length === 0 ? 0 : Math.atan2(normalY, normalX);

  for (let particle = 0; particle < count; particle++) {
    random.nextFloats(draws, DRAWS_PER_PARTICLE);
    const angle = baseAngle + ((draws[DRAW_ANGLE] ?? 0) * 2 - 1) * spread;
    const speed = tuning.particleSpeed * speedScale * (0.4 + (draws[DRAW_SPEED] ?? 0) * 0.8);
    sim.particles.spawn(
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      Math.max(
        1,
        Math.round(tuning.particleLifeTicks * lifeScale * (0.6 + (draws[DRAW_LIFE] ?? 0) * 0.6)),
      ),
      tuning.particleSize * sizeScale * (1 + (draws[DRAW_SIZE] ?? 0) * 1.5),
      kind,
    );
  }
}

/**
 * A ring of particles thrown evenly outward from a point, rather than into a
 * cone.
 *
 * Deterministic angles, no random draw at all: a ring whose spokes wander is
 * a burst, and the whole reason a ring reads as "this finished" rather than
 * "this was hit" is that it is obviously deliberate.
 */
export function ring(
  sim: GameSim,
  x: number,
  y: number,
  count: number,
  kind: ParticleKindId,
  speed: number,
  lifeTicks: number,
  size: number,
): void {
  for (let spoke = 0; spoke < count; spoke++) {
    const angle = (spoke / count) * Math.PI * 2;
    sim.particles.spawn(
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      lifeTicks,
      size,
      kind,
    );
  }
}

/**
 * The muzzle, on the tick a shot leaves it (#153).
 *
 * One particle, no velocity, four ticks: it is a *flash*, and a flash that
 * travels is a projectile. Fired for enemy shots as well as the player's,
 * because "something over there just shot" is worth a frame of warning at the
 * edge of vision — and because the player's own weapon looking special while
 * an enemy's does not is how a game teaches that enemy shots come from
 * nowhere.
 */
export function muzzleFlash(sim: GameSim, x: number, y: number): void {
  sim.particles.spawn(x, y, 0, 0, MUZZLE_FLASH_TICKS, MUZZLE_FLASH_SIZE, ParticleKind.Flash);
}

const MUZZLE_FLASH_TICKS = 4;
const MUZZLE_FLASH_SIZE = 3;

/** A cleared room, announced from its own centre. */
export function roomClearRing(sim: GameSim, x: number, y: number): void {
  ring(sim, x, y, ROOM_CLEAR_SPOKES, ParticleKind.Glint, ROOM_CLEAR_SPEED, ROOM_CLEAR_TICKS, 3);
}

const ROOM_CLEAR_SPOKES = 16;
const ROOM_CLEAR_SPEED = 1.6;
const ROOM_CLEAR_TICKS = 40;

/** A door, on the tick it opens or is walked through. */
export function doorPuff(sim: GameSim, x: number, y: number): void {
  spray(sim, x, y, 0, 0, DOOR_PUFF_COUNT, ParticleKind.Dust, Math.PI, 0.7, 1.4, 1.2);
}

const DOOR_PUFF_COUNT = 6;

/** Something good was picked up. */
export function pickupGlint(sim: GameSim, x: number, y: number): void {
  ring(sim, x, y, PICKUP_SPOKES, ParticleKind.Glint, PICKUP_SPEED, PICKUP_TICKS, 2);
}

const PICKUP_SPOKES = 6;
const PICKUP_SPEED = 0.9;
const PICKUP_TICKS = 18;

/**
 * The particle kind a creature comes apart into, by the name a definition
 * authors (`EnemyDefinition.deathEffect`).
 *
 * Beer splashes; a Schimmelfleck does not. A Rollfass is a barrel and throws
 * splinters. The Böllerschmeißer goes off. Data rather than a switch on
 * `EnemyDefinition.id`, so floor 3's roster needs no engine change to pick one
 * — which is the same bar every other part of an enemy is held to.
 */
export const DEATH_EFFECT_KINDS: Readonly<Record<string, ParticleKindId>> = {
  splash: ParticleKind.Splash,
  spore: ParticleKind.Spore,
  shard: ParticleKind.Shard,
  dust: ParticleKind.Dust,
  ember: ParticleKind.Ember,
};

/** What a creature that names no `deathEffect` throws — beer, as everything used to. */
export const DEFAULT_DEATH_EFFECT = ParticleKind.Splash;
