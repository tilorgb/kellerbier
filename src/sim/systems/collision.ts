import { NO_HIT, sweptCircleHit } from '../collision/circle-circle.js';
import { CollisionLayer } from '../collision/layers.js';
import { World } from '../ecs/world.js';
import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { vectorLength } from '../math.js';
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

/** The projectile currently being resolved, and the best hit found for it. */
let projectileSlot = 0;
let projectileFromX = 0;
let projectileFromY = 0;
let projectileToX = 0;
let projectileToY = 0;
let projectileRadius = 0;
let projectileMask = 0;
let bestHitTime = 0;
let bestHitTarget = -1;

export function stepCollision(sim: GameSim): void {
  activeSim = sim;
  activeTransform = sim.transform.data;
  activeBody = sim.body.data;
  activeCollisionLayers = sim.collision.data;

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

  projectileSlot = slot;
  projectileFromX = projectiles.previousX[slot] ?? 0;
  projectileFromY = projectiles.previousY[slot] ?? 0;
  projectileToX = projectiles.x[slot] ?? 0;
  projectileToY = projectiles.y[slot] ?? 0;
  projectileRadius = projectiles.radius[slot] ?? 0;
  projectileMask =
    projectiles.team[slot] === ProjectileTeam.Player
      ? CollisionLayer.Enemy | CollisionLayer.Obstacle
      : CollisionLayer.Player | CollisionLayer.Obstacle;

  bestHitTime = Number.POSITIVE_INFINITY;
  bestHitTarget = -1;

  sim.broadphase.querySwept(
    projectileFromX,
    projectileFromY,
    projectileToX,
    projectileToY,
    projectileRadius,
    testCandidate,
  );

  if (bestHitTarget === -1) {
    return;
  }

  // The impact point is where the shot actually met the target, not where the
  // tick happened to leave it. Everything downstream — the foam, the knockback
  // direction, the damage number — is placed from this, and placing it at the
  // end of the step puts the effect visibly inside the enemy.
  const hitX = projectileFromX + (projectileToX - projectileFromX) * bestHitTime;
  const hitY = projectileFromY + (projectileToY - projectileFromY) * bestHitTime;

  const targetBase = bestHitTarget * 4;
  const towardsX = hitX - (activeTransform[targetBase] ?? 0);
  const towardsY = hitY - (activeTransform[targetBase + 1] ?? 0);
  const length = vectorLength(towardsX, towardsY);
  const normalX = length === 0 ? 0 : towardsX / length;
  const normalY = length === 0 ? 0 : towardsY / length;

  sim.events.push(
    EventKind.ProjectileHit,
    bestHitTarget,
    projectileSlot,
    hitX,
    hitY,
    normalX,
    normalY,
    projectiles.damage[slot] ?? 0,
  );
  projectiles.despawn(slot);
}

/** Exact test for one broadphase candidate. Keeps the earliest hit found. */
function testCandidate(index: number): void {
  const layer = activeCollisionLayers[index * 2] ?? 0;
  if ((layer & projectileMask) === 0) {
    return;
  }

  const time = sweptCircleHit(
    projectileFromX,
    projectileFromY,
    projectileToX,
    projectileToY,
    projectileRadius,
    activeTransform[index * 4] ?? 0,
    activeTransform[index * 4 + 1] ?? 0,
    activeBody[index * 2] ?? 0,
  );
  if (time === NO_HIT || time >= bestHitTime) {
    return;
  }
  bestHitTime = time;
  bestHitTarget = index;
}
