import { CollisionLayer } from '../collision/layers.js';
import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';
import { clamp, vectorLength } from '../math.js';
import { NO_SLOT } from '../pool/slot-pool.js';
import {
  STATUS_BURN,
  STATUS_EFFECT_STRIDE,
  STATUS_FREEZE,
  STATUS_POISON,
} from '../systems/status-effects.js';
import { type ProjectileStore, type ProjectileTeamId, ProjectileTeam } from './store.js';
import { ProjectileTag, hasTag } from './tags.js';

/**
 * Evaluating a projectile's tags (#27).
 *
 * `sim/projectile/tags.ts` owns identity and the composition rules; this file
 * is where a tag actually does something — three call sites, one per moment a
 * tag can act:
 *
 * - `finalizeProjectileTags`, once, right after a shot's final tag set is
 *   known (`sim/systems/shooting.ts`'s `fire`, after item hooks have had a
 *   chance to add tags to it) — derives the per-tag counters a hit needs to
 *   consult later from whatever the mask ended up being.
 * - `applyProjectileMotionTags` / `advanceStuckProjectile`, once a tick, from
 *   `stepProjectiles` (`sim/systems/shooting.ts`) — steers a live shot.
 * - `resolveProjectileHit`, once per landed hit, from `stepCollision`
 *   (`sim/systems/collision.ts`) — decides whether the shot survives the hit
 *   it just landed, and fires whatever else the hit's tags do (splitting,
 *   status effects).
 *
 * Every function here is additive over an untagged shot: called with
 * `tags === 0` (an ordinary shot with none of #27's behaviour), each one is a
 * no-op, so nothing in `shooting.ts`/`collision.ts` had to grow a branch for
 * "does this projectile use tags at all" — the mask being zero already reads
 * that way everywhere it is checked.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Below this speed/distance a direction is not reliable to divide by. */
const MIN_VECTOR = 0.001;

/** Sets `pierceRemaining`/`bounceRemaining`/`splitDepth` from the tag mask and current tuning. */
function initCounters(sim: GameSim, slot: number, splitDepth: number): void {
  const projectiles = sim.projectiles;
  const tags = projectiles.tags[slot] ?? 0;
  const tuning = sim.tuning.projectileTags;
  projectiles.pierceRemaining[slot] = hasTag(tags, ProjectileTag.Piercing)
    ? Math.max(0, Math.round(tuning.pierceMaxTargets))
    : 0;
  projectiles.bounceRemaining[slot] = hasTag(tags, ProjectileTag.Bouncing)
    ? Math.max(0, Math.round(tuning.bounceMaxCount))
    : 0;
  projectiles.splitDepth[slot] = hasTag(tags, ProjectileTag.Splitting)
    ? Math.max(0, Math.round(splitDepth))
    : 0;
}

/**
 * Finishes setting up a shot's tags, once its mask is final.
 *
 * Called once, after `ProjectileStore.spawn` and after any item hook that
 * might still add a tag to the shot (`dispatchItemProjectileSpawn` in
 * `sim/systems/shooting.ts`'s `fire`) — a counter derived before that hook
 * runs would be derived from the wrong mask. Idempotent and safe to call on
 * an untagged shot (every branch is then a zero), so callers never need to
 * check `tags !== 0` before reaching for it.
 */
export function finalizeProjectileTags(sim: GameSim, slot: number): void {
  initCounters(sim, slot, sim.tuning.projectileTags.splitMaxDepth);
}

/**
 * Reflects a shot's velocity off a unit normal.
 *
 * Shared by a wall bounce (`sim/systems/shooting.ts`) and an enemy bounce
 * (`resolveProjectileHit`, below) — the two differ only in where the normal
 * comes from. A wall bounce only has the direction opposite the shot's own
 * travel (`sim/systems/shooting.ts` never learns which face of a block it
 * hit), which reflects a straight-line shot straight back the way it came;
 * an enemy bounce gets the real point-of-impact normal collision already
 * computes, so it deflects at whatever angle the shot actually arrived at.
 */
export function reflectVelocity(
  projectiles: ProjectileStore,
  slot: number,
  normalX: number,
  normalY: number,
): void {
  const vx = projectiles.velocityX[slot] ?? 0;
  const vy = projectiles.velocityY[slot] ?? 0;
  const dot = vx * normalX + vy * normalY;
  projectiles.velocityX[slot] = vx - 2 * dot * normalX;
  projectiles.velocityY[slot] = vy - 2 * dot * normalY;
}

/** The nearest live body this projectile's team is allowed to hit, or -1. */
function findNearestTarget(sim: GameSim, slot: number): number {
  const projectiles = sim.projectiles;
  const wantMask =
    projectiles.team[slot] === ProjectileTeam.Player
      ? CollisionLayer.Enemy | CollisionLayer.Obstacle
      : CollisionLayer.Player | CollisionLayer.Obstacle;

  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const collisionData = sim.collision.data;
  const healthData = sim.health.data;
  const transform = sim.transform.data;
  const required = sim.collidableMask;
  const highWater = world.highWater;
  const px = projectiles.x[slot] ?? 0;
  const py = projectiles.y[slot] ?? 0;

  let bestIndex = -1;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  for (let candidate = 0; candidate < highWater; candidate++) {
    if (states[candidate] !== World.ALIVE) {
      continue;
    }
    if (((masks[candidate] ?? 0) & required) !== required) {
      continue;
    }
    if (((collisionData[candidate * 2] ?? 0) & wantMask) === 0) {
      continue;
    }
    if ((healthData[candidate * 2 + 1] ?? 0) <= 0) {
      continue;
    }
    const dx = (transform[candidate * 4] ?? 0) - px;
    const dy = (transform[candidate * 4 + 1] ?? 0) - py;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = candidate;
    }
  }

  const range = sim.tuning.projectileTags.homingRange;
  if (bestIndex === -1 || (range > 0 && bestDistanceSq > range * range)) {
    return -1;
  }
  return bestIndex;
}

/** `homing`: turns velocity toward the nearest valid target, at a limited rate. */
function applyHoming(sim: GameSim, slot: number): void {
  const projectiles = sim.projectiles;
  const vx = projectiles.velocityX[slot] ?? 0;
  const vy = projectiles.velocityY[slot] ?? 0;
  const speed = vectorLength(vx, vy);
  if (speed < MIN_VECTOR) {
    return;
  }
  const target = findNearestTarget(sim, slot);
  if (target === -1) {
    return;
  }
  const toX = sim.positionX(target) - (projectiles.x[slot] ?? 0);
  const toY = sim.positionY(target) - (projectiles.y[slot] ?? 0);
  const toLength = vectorLength(toX, toY);
  if (toLength < MIN_VECTOR) {
    return;
  }

  const curX = vx / speed;
  const curY = vy / speed;
  const desiredX = toX / toLength;
  const desiredY = toY / toLength;
  // Signed angle from current heading to desired heading, via atan2 of the
  // cross/dot of the two unit vectors — clamped to the turn rate rather than
  // snapped, so a fast target still reads as a shot turning to chase it.
  const cross = curX * desiredY - curY * desiredX;
  const dot = curX * desiredX + curY * desiredY;
  const turn = clamp(
    Math.atan2(cross, dot),
    -sim.tuning.projectileTags.homingTurnRadiansPerTick,
    sim.tuning.projectileTags.homingTurnRadiansPerTick,
  );
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  projectiles.velocityX[slot] = (curX * cos - curY * sin) * speed;
  projectiles.velocityY[slot] = (curX * sin + curY * cos) * speed;
}

/** `arcing`: a constant rotation applied to velocity every tick — a curving shot rather than a straight one. */
function applyArcing(sim: GameSim, slot: number): void {
  const projectiles = sim.projectiles;
  const rate = sim.tuning.projectileTags.arcingTurnRadiansPerTick;
  const vx = projectiles.velocityX[slot] ?? 0;
  const vy = projectiles.velocityY[slot] ?? 0;
  const cos = Math.cos(rate);
  const sin = Math.sin(rate);
  projectiles.velocityX[slot] = vx * cos - vy * sin;
  projectiles.velocityY[slot] = vx * sin + vy * cos;
}

/** `returning`: after flying outward for a while, turns back toward where it was fired from. */
function applyReturning(sim: GameSim, slot: number): void {
  const projectiles = sim.projectiles;
  if ((projectiles.ticksAlive[slot] ?? 0) < sim.tuning.projectileTags.returningTurnTicks) {
    return;
  }
  const x = projectiles.x[slot] ?? 0;
  const y = projectiles.y[slot] ?? 0;
  const toX = (projectiles.spawnX[slot] ?? 0) - x;
  const toY = (projectiles.spawnY[slot] ?? 0) - y;
  const distance = vectorLength(toX, toY);
  if (distance < 1) {
    // Close enough to where it started — let lifetime end it rather than
    // spin the direction in place, which is all a divide this close would do.
    return;
  }
  const vx = projectiles.velocityX[slot] ?? 0;
  const vy = projectiles.velocityY[slot] ?? 0;
  const speed = vectorLength(vx, vy) || sim.tuning.shooting.shotSpeed;
  projectiles.velocityX[slot] = (toX / distance) * speed;
  projectiles.velocityY[slot] = (toY / distance) * speed;
}

/**
 * `orbiting`: holds a fixed radius around the spawn point, sweeping at a
 * fixed angular speed.
 *
 * Stateless by construction — no per-projectile angle is stored. Every tick
 * re-derives "where around the circle am I" from the current position itself
 * (falling back to the current heading on the very first tick, before the
 * shot has actually left its spawn point), rotates that by one tick's angular
 * step, and writes the *velocity* that would carry the shot from here to
 * there. `stepProjectiles`'s ordinary substep-and-collide movement (already
 * correct against walls and enemies) does the rest, unmodified — orbiting
 * never needed a special mover of its own, only a velocity that describes a
 * circle instead of a line.
 */
function applyOrbiting(sim: GameSim, slot: number): void {
  const projectiles = sim.projectiles;
  const tuning = sim.tuning.projectileTags;
  const x = projectiles.x[slot] ?? 0;
  const y = projectiles.y[slot] ?? 0;
  const spawnX = projectiles.spawnX[slot] ?? 0;
  const spawnY = projectiles.spawnY[slot] ?? 0;

  const dx = x - spawnX;
  const dy = y - spawnY;
  const distance = vectorLength(dx, dy);
  let dirX: number;
  let dirY: number;
  if (distance < MIN_VECTOR) {
    const vx = projectiles.velocityX[slot] ?? 0;
    const vy = projectiles.velocityY[slot] ?? 0;
    const speed = vectorLength(vx, vy);
    dirX = speed < MIN_VECTOR ? 1 : vx / speed;
    dirY = speed < MIN_VECTOR ? 0 : vy / speed;
  } else {
    dirX = dx / distance;
    dirY = dy / distance;
  }

  const radius = Math.max(1, tuning.orbitRadius);
  const rate = tuning.orbitAngularVelocity;
  const cos = Math.cos(rate);
  const sin = Math.sin(rate);
  const nextX = spawnX + (dirX * cos - dirY * sin) * radius;
  const nextY = spawnY + (dirX * sin + dirY * cos) * radius;
  projectiles.velocityX[slot] = nextX - x;
  projectiles.velocityY[slot] = nextY - y;
}

/**
 * Steers one live, in-flight (not `sticky`-attached) projectile for this tick.
 *
 * `orbiting` owns position outright when present — see `tags.ts`'s doc
 * comment for why — so nothing else here runs alongside it. `returning`,
 * `homing` and `arcing` each only ever nudge whatever velocity the previous
 * one left behind, in that fixed order, which is what lets all three be
 * present on the same shot without any of them needing to know about the
 * others.
 */
export function applyProjectileMotionTags(sim: GameSim, slot: number): void {
  const projectiles = sim.projectiles;
  const tags = projectiles.tags[slot] ?? 0;
  if (tags === 0) {
    return;
  }
  projectiles.ticksAlive[slot] = (projectiles.ticksAlive[slot] ?? 0) + 1;

  if (hasTag(tags, ProjectileTag.Orbiting)) {
    applyOrbiting(sim, slot);
    return;
  }
  if (hasTag(tags, ProjectileTag.Returning)) {
    applyReturning(sim, slot);
  }
  if (hasTag(tags, ProjectileTag.Homing)) {
    applyHoming(sim, slot);
  }
  if (hasTag(tags, ProjectileTag.Arcing)) {
    applyArcing(sim, slot);
  }
}

/**
 * Advances a `sticky` shot that has already embedded itself in a target.
 *
 * Rides the target's position for the rest of its lifetime rather than
 * moving or colliding on its own — `stepCollision` skips a stuck shot
 * entirely (see its own `resolveProjectile`), so this is the only place its
 * position changes. The target is tracked by slot, not by `Entity` handle: a
 * recycled slot reads as "still alive" here, which is a real but rare and
 * purely cosmetic edge case (a dart riding whatever spawned into the same
 * slot after its actual target died) rather than a crash — the same
 * trade-off `spawnPost`'s plain indices already make elsewhere.
 */
export function advanceStuckProjectile(sim: GameSim, slot: number): void {
  const projectiles = sim.projectiles;
  const x = projectiles.x[slot] ?? 0;
  const y = projectiles.y[slot] ?? 0;
  projectiles.previousX[slot] = x;
  projectiles.previousY[slot] = y;

  const target = projectiles.stickyTarget[slot] ?? -1;
  const remaining = (projectiles.lifetime[slot] ?? 0) - 1;
  if (remaining <= 0 || target === -1 || sim.world.states[target] !== World.ALIVE) {
    projectiles.despawn(slot);
    return;
  }
  projectiles.lifetime[slot] = remaining;
  projectiles.x[slot] = sim.positionX(target);
  projectiles.y[slot] = sim.positionY(target);
}

/** Sets (or refreshes) a status duration on whatever a tagged shot just hit. */
function applyStatusTagsOnHit(sim: GameSim, target: number, tags: number): void {
  if (tags === 0) {
    return;
  }
  const tuning = sim.tuning.projectileTags;
  const status = sim.statusEffect.data;
  const base = target * STATUS_EFFECT_STRIDE;
  // A later hit refreshes the duration rather than stacking it — simple, and
  // safe against a rapid-fire weapon turning one status into an unbounded one.
  if (hasTag(tags, ProjectileTag.Burning)) {
    status[base + STATUS_BURN] = Math.max(
      status[base + STATUS_BURN] ?? 0,
      Math.round(tuning.burnDurationTicks),
    );
  }
  if (hasTag(tags, ProjectileTag.Poison)) {
    status[base + STATUS_POISON] = Math.max(
      status[base + STATUS_POISON] ?? 0,
      Math.round(tuning.poisonDurationTicks),
    );
  }
  if (hasTag(tags, ProjectileTag.Freezing)) {
    status[base + STATUS_FREEZE] = Math.max(
      status[base + STATUS_FREEZE] ?? 0,
      Math.round(tuning.freezeDurationTicks),
    );
  }
}

/**
 * `splitting`: spawns the next generation of children at the hit point, fanned
 * out around the direction the parent was travelling.
 *
 * Children inherit the parent's full tag set — including `splitting` itself,
 * bounded by `splitDepth` rather than by stripping the tag, which is what
 * lets a splitting shot that is also homing or bouncing keep being both
 * through every generation. Damage and lifetime are scaled down
 * (`ProjectileTagTuning.splitDamageScale`/`splitLifetimeScale`) so a weapon's
 * total output does not multiply with its split count for free.
 */
function spawnSplitChildren(sim: GameSim, slot: number, hitX: number, hitY: number): void {
  const projectiles = sim.projectiles;
  const tuning = sim.tuning.projectileTags;
  const count = Math.max(0, Math.round(tuning.splitCount));
  if (count === 0) {
    return;
  }

  const parentVelocityX = projectiles.velocityX[slot] ?? 0;
  const parentVelocityY = projectiles.velocityY[slot] ?? 0;
  const speed = vectorLength(parentVelocityX, parentVelocityY) || sim.tuning.shooting.shotSpeed;
  const baseAngle = Math.atan2(parentVelocityY, parentVelocityX);
  const spread = tuning.splitSpreadRadians;
  const childTags = projectiles.tags[slot] ?? 0;
  const childDepth = (projectiles.splitDepth[slot] ?? 0) - 1;
  const childDamage = Math.max(
    1,
    Math.round((projectiles.damage[slot] ?? 0) * tuning.splitDamageScale),
  );
  const childLifetime = Math.max(
    1,
    Math.round((projectiles.lifetime[slot] ?? 0) * tuning.splitLifetimeScale),
  );
  const radius = projectiles.radius[slot] ?? 0;
  // The stored value is always a valid `ProjectileTeamId` — it was written by
  // an earlier `spawn` call that required one.
  const team = (projectiles.team[slot] ?? 0) as ProjectileTeamId;

  for (let child = 0; child < count; child++) {
    const t = count === 1 ? 0 : -spread / 2 + (spread * child) / (count - 1);
    const angle = baseAngle + t;
    const childSlot = projectiles.spawn(
      hitX,
      hitY,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      radius,
      childDamage,
      childLifetime,
      team,
      childTags,
    );
    if (childSlot === NO_SLOT) {
      continue;
    }
    initCounters(sim, childSlot, childDepth);
  }
}

/**
 * Resolves what a hit does to the shot that landed it — called once per
 * `ProjectileHit` event, right after `stepCollision` pushes the event, and
 * before it would otherwise unconditionally despawn the shot.
 *
 * `splitting` and the status tags always run, on every hit, regardless of
 * what else the shot's tags decide — they are orthogonal to survival, per
 * `tags.ts`'s doc comment. What comes after is the one real conflict #27
 * names by name: `sticky` beats `piercing` beats `bouncing` beats nothing.
 */
export function resolveProjectileHit(
  sim: GameSim,
  slot: number,
  target: number,
  hitX: number,
  hitY: number,
  normalX: number,
  normalY: number,
): void {
  const projectiles = sim.projectiles;
  const tags = projectiles.tags[slot] ?? 0;

  applyStatusTagsOnHit(sim, target, tags);

  if (hasTag(tags, ProjectileTag.Splitting) && (projectiles.splitDepth[slot] ?? 0) > 0) {
    spawnSplitChildren(sim, slot, hitX, hitY);
    // Consumed like `pierceRemaining`/`bounceRemaining`, not left standing: a
    // `piercing` or `bouncing` shot survives to hit several more things over
    // its lifetime, and without this every one of those hits would throw off
    // another full brood rather than the one `splitMaxDepth` promises.
    projectiles.splitDepth[slot] = (projectiles.splitDepth[slot] ?? 0) - 1;
  }

  if (hasTag(tags, ProjectileTag.Sticky)) {
    projectiles.stickyTarget[slot] = target;
    projectiles.lastHitTarget[slot] = target;
    return;
  }

  if (hasTag(tags, ProjectileTag.Piercing)) {
    const remaining = (projectiles.pierceRemaining[slot] ?? 0) - 1;
    projectiles.pierceRemaining[slot] = remaining;
    if (remaining >= 0) {
      projectiles.lastHitTarget[slot] = target;
      return;
    }
    // Pierce budget spent on this hit — falls through to bouncing/despawn below.
  }

  if (hasTag(tags, ProjectileTag.Bouncing)) {
    const remaining = (projectiles.bounceRemaining[slot] ?? 0) - 1;
    if (remaining >= 0) {
      projectiles.bounceRemaining[slot] = remaining;
      projectiles.lastHitTarget[slot] = target;
      reflectVelocity(projectiles, slot, normalX, normalY);
      return;
    }
  }

  projectiles.despawn(slot);
}
