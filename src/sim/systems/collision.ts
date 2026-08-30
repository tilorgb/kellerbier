import { NO_HIT, sweptCircleHit } from '../collision/circle-circle.js';
import { CollisionLayer } from '../collision/layers.js';
import { World } from '../ecs/world.js';
import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { vectorLength } from '../math.js';
import { resolveProjectileHit } from '../projectile/behavior.js';
import { ProjectileTeam } from '../projectile/store.js';

/**
 * Projectiles against everything they are allowed to hit.
 *
 * The broadphase is rebuilt from the position arrays every tick and then asked
 * for candidates; the exact test is a swept circle, because a projectile
 * crossing an enemy within one tick is the normal case for anything fast, not
 * an edge case.
 *
 * ## Why there are no closures in here
 *
 * The callbacks are hoisted module functions with their state in module
 * variables, rather than arrow functions written at the call site. An arrow
 * function inside a system is a fresh object every tick, and the whole point of
 * this file is that it can run five thousand times a tick without producing
 * anything for the collector. It reads worse than the closure version; the
 * frame graph reads better.
 *
 * ## Why that state is in typed arrays and not in `let`s
 *
 * Because a module-level `let` holding a double is not a register, it is a heap
 * slot — and V8 cannot store a double in one. Every assignment boxes a fresh
 * `HeapNumber`, so `projectileFromX = ...` allocates sixteen bytes each time it
 * runs. Six of those per projectile, five thousand projectiles a tick, is
 * roughly half a megabyte of garbage per tick from a file whose entire premise
 * is that it produces none. The stress benchmark measured 490 KB a tick here,
 * all of it this.
 *
 * A `Float64Array` slot is exactly the same thing to read and write and boxes
 * nothing, because the array already stores raw doubles. The integers are in an
 * `Int32Array` for the same reason and one more: a small integer is not boxed
 * *today*, but nothing in the type system stops a tuning change from making one
 * of these fractional, and the failure mode is silent.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

let activeSim: GameSim | null = null;

/**
 * The component arrays for the tick being resolved.
 *
 * Hoisted out of the per-candidate path. Reaching them through
 * `sim.transform.data` costs two loads on every candidate test, and this is the
 * one function in the game that runs five thousand times a tick.
 */
let activeTransform: Float32Array = new Float32Array(0);
let activeBody: Float32Array = new Float32Array(0);
let activeCollisionLayers: Uint16Array = new Uint16Array(0);
/** `sim.projectiles.lastHitTarget` — see `testCandidate`'s use of it, and the same reasoning above. */
let activeLastHitTarget: Int32Array = new Int32Array(0);

/** Slots in `state`, the double half of the projectile being resolved. */
const FROM_X = 0;
const FROM_Y = 1;
const TO_X = 2;
const TO_Y = 3;
const RADIUS = 4;
const BEST_HIT_TIME = 5;
const STATE_SLOTS = 6;

/** Slots in `slots`, the integer half. */
const PROJECTILE_SLOT = 0;
const PROJECTILE_MASK = 1;
const BEST_HIT_TARGET = 2;
const SLOT_COUNT = 3;

/** The projectile currently being resolved, and the best hit found for it. */
const state = new Float64Array(STATE_SLOTS);
const slots = new Int32Array(SLOT_COUNT);

export function stepCollision(sim: GameSim): void {
  activeSim = sim;
  activeTransform = sim.transform.data;
  activeBody = sim.body.data;
  activeCollisionLayers = sim.collision.data;
  activeLastHitTarget = sim.projectiles.lastHitTarget;

  buildBroadphase(sim);
  sim.projectiles.forEachLive(resolveProjectile);

  activeSim = null;
}

/**
 * Stages every collidable entity into the grid.
 *
 * A hand-written loop over slot states and masks rather than `world.forEach`,
 * for the reason the ECS documents: this is a hot system, and the callback form
 * costs an indirect call per entity.
 */
function buildBroadphase(sim: GameSim): void {
  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const required = sim.collidableMask;
  const transform = activeTransform;
  const body = activeBody;
  const hash = sim.broadphase;

  hash.begin();
  const highWater = world.highWater;
  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    if (((masks[index] ?? 0) & required) !== required) {
      continue;
    }
    hash.insert(
      index,
      transform[index * 4] ?? 0,
      transform[index * 4 + 1] ?? 0,
      body[index * 2] ?? 0,
    );
  }
  hash.build();
}

function resolveProjectile(slot: number): void {
  const sim = activeSim;
  if (sim === null) {
    return;
  }
  const projectiles = sim.projectiles;

  slots[PROJECTILE_SLOT] = slot;
  const fromX = projectiles.previousX[slot] ?? 0;
  const fromY = projectiles.previousY[slot] ?? 0;
  const toX = projectiles.x[slot] ?? 0;
  const toY = projectiles.y[slot] ?? 0;
  const radius = projectiles.radius[slot] ?? 0;
  state[FROM_X] = fromX;
  state[FROM_Y] = fromY;
  state[TO_X] = toX;
  state[TO_Y] = toY;
  state[RADIUS] = radius;
  slots[PROJECTILE_MASK] =
    projectiles.team[slot] === ProjectileTeam.Player
      ? CollisionLayer.Enemy |
        CollisionLayer.Obstacle |
        // D'Sennerin (#47): a Kuhglocke that has already come off something
        // is nobody's friend, hers included — "small rooms become a danger
        // to herself", as a rule rather than as flavour text. Only *after*
        // it has bounced, or every shot she fired would hit her at the
        // muzzle; `hasBounced` reads the budget `finalizeProjectileTags`
        // set from the same tuning value, so it needs no extra per-shot
        // storage to know one has been spent.
        (sim.ownShotsHurtOwner && hasBounced(sim, slot) ? CollisionLayer.Player : 0)
      : CollisionLayer.Player | CollisionLayer.Obstacle;

  state[BEST_HIT_TIME] = Number.POSITIVE_INFINITY;
  slots[BEST_HIT_TARGET] = -1;

  sim.broadphase.querySwept(fromX, fromY, toX, toY, radius, testCandidate);

  const target = slots[BEST_HIT_TARGET];
  if (target === -1) {
    // Nothing found this tick — the shot has physically cleared whatever it
    // hit last, so a `piercing`/`bouncing` shot's exclusion on re-hitting the
    // same body (see `testCandidate`) is free to lapse. Without this a shot
    // that pierces the same body twice, ticks apart (an orbiting one lapping
    // past it, say), would stay excluded from it forever.
    projectiles.lastHitTarget[slot] = -1;
    return;
  }

  // The impact point is where the shot actually met the target, not where the
  // tick happened to leave it. Everything downstream — the foam, the knockback
  // direction, the damage number — is placed from this, and placing it at the
  // end of the step puts the effect visibly inside the enemy.
  const hitTime = state[BEST_HIT_TIME];
  const hitX = fromX + (toX - fromX) * hitTime;
  const hitY = fromY + (toY - fromY) * hitTime;

  const targetBase = target * 4;
  const towardsX = hitX - (activeTransform[targetBase] ?? 0);
  const towardsY = hitY - (activeTransform[targetBase + 1] ?? 0);
  const length = vectorLength(towardsX, towardsY);
  const normalX = length === 0 ? 0 : towardsX / length;
  const normalY = length === 0 ? 0 : towardsY / length;

  sim.events.push(
    EventKind.ProjectileHit,
    target,
    slots[PROJECTILE_SLOT],
    hitX,
    hitY,
    normalX,
    normalY,
    projectiles.damage[slot] ?? 0,
  );
  // Whether the shot despawns here, pierces through, bounces off, embeds
  // itself, and/or spawns split children is #27's business, not this file's
  // — see `resolveProjectileHit`'s own doc comment for the priority a mask
  // with more than one of those tags resolves through.
  resolveProjectileHit(sim, slot, target, hitX, hitY, normalX, normalY);
}

/**
 * Whether a `bouncing` shot has spent at least one of its bounces.
 *
 * Compared against the budget rather than recorded on the shot: both come
 * from `tuning.projectileTags.bounceMaxCount`, and a shot carrying no bounce
 * tag has a budget of zero, which can never be below the maximum — so an
 * ordinary shot answers `false` without a branch of its own.
 */
function hasBounced(sim: GameSim, slot: number): boolean {
  const budget = Math.max(0, Math.round(sim.tuning.projectileTags.bounceMaxCount));
  return (sim.projectiles.bounceRemaining[slot] ?? 0) < budget;
}

/** Exact test for one broadphase candidate. Keeps the earliest hit found. */
function testCandidate(index: number): void {
  const layer = activeCollisionLayers[index * 2] ?? 0;
  if ((layer & (slots[PROJECTILE_MASK] ?? 0)) === 0) {
    return;
  }
  // A `piercing`/`bouncing` shot that survived a hit last tick does not
  // re-register a hit against the very same body this tick before it has
  // physically cleared it — see `ProjectileStore.lastHitTarget`'s doc comment.
  if (index === (activeLastHitTarget[slots[PROJECTILE_SLOT] ?? 0] ?? -1)) {
    return;
  }

  const time = sweptCircleHit(
    state[FROM_X] ?? 0,
    state[FROM_Y] ?? 0,
    state[TO_X] ?? 0,
    state[TO_Y] ?? 0,
    state[RADIUS] ?? 0,
    activeTransform[index * 4] ?? 0,
    activeTransform[index * 4 + 1] ?? 0,
    activeBody[index * 2] ?? 0,
  );
  if (time === NO_HIT || time >= (state[BEST_HIT_TIME] ?? 0)) {
    return;
  }
  state[BEST_HIT_TIME] = time;
  slots[BEST_HIT_TARGET] = index;
}
