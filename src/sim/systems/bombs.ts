import { ROOM_TILE_UNITS } from '../../content/rooms/definition.js';
import { CollisionLayer } from '../collision/layers.js';
import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';
import { bombBlast } from '../particle/effects.js';
import { applyDamageAt } from './impact.js';
import { dispatchItemBombDetonate } from './items.js';

/**
 * The Bierfassl: a fuse that counts down, a roll that slows, and a blast that
 * damages everything in reach.
 *
 * Runs after `stepCollision` (`GameSim.step`), which is what lets the blast
 * reuse this tick's broadphase — the same grid `stepPickups` reuses right
 * after it. Damage is applied through `applyDamageAt`
 * (`systems/impact.ts`) — the exact package a shot lands, flash through
 * knockback through the kill itself — so a crate dies through a blast
 * exactly the way it dies to a shot, which is what "destroys destructible
 * terrain" means in this engine: an `Obstacle`-layer entity with health,
 * killed through the one damage chokepoint everything else already goes
 * through.
 *
 * The blast itself is a Bomberman cross (#210), not a circle: the same
 * width as the bomb's own tile, reaching `bombBlastArmTiles` tiles north,
 * south, east and west of it. It does not stop at a wall the way the real
 * thing does — every arm reaches its full length regardless of what is
 * between the bomb and it, a deliberate simplification rather than a gap;
 * teaching a blast to trace room geometry is real scope of its own, and
 * nothing about this shape forecloses adding it later.
 *
 * `stepBodies` only damps `push`, never `velocity` (see `bodies.ts`), so a
 * rolled Bierfassl's own slowdown is this file's job, not `stepBodies`'s.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** What a blast is allowed to reach. Blasts hit everything alive, not just what a shot could. */
const BLAST_MASK = CollisionLayer.Enemy | CollisionLayer.Obstacle | CollisionLayer.Player;

/** Below this speed a rolled Bierfassl reads as stopped, not as crawling forever. */
const ROLL_STOP_SPEED = 0.02;

let activeSim: GameSim | null = null;

/**
 * The bomb currently exploding: its position, its own slot (excluded from
 * its own blast), and the cross's own half-width — one tile wide, centred
 * on the bomb, the same as every other tile-aligned hazard in the game.
 */
const BOMB_X = 0;
const BOMB_Y = 1;
const BOMB_SELF = 2;
const BOMB_ARM_LENGTH = 3;
const bomb = new Float64Array(4);

/** Half the cross's width — one tile, centred on the bomb. */
const BLAST_HALF_WIDTH = ROOM_TILE_UNITS / 2;

/**
 * How far a Bomberman-style blast reaches from its own centre, in world
 * units — `bombBlastArmTiles` tiles in each cardinal direction. The one
 * place this is computed: `blastCandidate`'s hit test, the pre-blast
 * telegraph (`render/entities.ts`) and the detonation animation
 * (`sim/particle/effects.ts`'s `bombBlast`) all call this rather than each
 * multiplying `bombBlastArmTiles` by `ROOM_TILE_UNITS` on their own, so a
 * blast always telegraphs, animates and hurts the same distance.
 */
export function bombBlastArmLength(sim: GameSim): number {
  return sim.tuning.pickup.bombBlastArmTiles * ROOM_TILE_UNITS;
}

/**
 * How far a placed Bierfassl is through its fuse, `0` (just set down) to `1`
 * (exploding this tick) — what `render/entities.ts` reads to redden the body
 * as the countdown runs out (#208), the same "progress drives a visual ramp"
 * shape `sim/systems/enemy.ts`'s `enemyTelegraphProgress` already uses for a
 * boss's wind-up flush.
 *
 * `0` for anything without a fuse rather than throwing — a render loop calls
 * this once per collidable body, most of which are not a Bierfassl at all.
 */
export function bombFuseProgress(sim: GameSim, index: number): number {
  if (((sim.world.masks[index] ?? 0) & sim.bombFuse.bit) === 0) {
    return 0;
  }
  const total = Math.max(1, Math.round(sim.tuning.pickup.bombFuseTicks));
  const ticksLeft = sim.bombFuse.data[index] ?? 0;
  return Math.min(1, Math.max(0, (total - ticksLeft) / total));
}

export function stepBombs(sim: GameSim): void {
  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const required = sim.bombFuse.bit;
  const velocityBit = sim.velocity.bit;
  const drag = sim.tuning.pickup.bombRollDrag;
  const velocity = sim.velocity.data;
  const fuse = sim.bombFuse.data;

  const highWater = world.highWater;
  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    if (((masks[index] ?? 0) & required) !== required) {
      continue;
    }

    if (((masks[index] ?? 0) & velocityBit) !== 0) {
      const decayedX = (velocity[index * 2] ?? 0) * drag;
      const decayedY = (velocity[index * 2 + 1] ?? 0) * drag;
      velocity[index * 2] = Math.abs(decayedX) < ROLL_STOP_SPEED ? 0 : decayedX;
      velocity[index * 2 + 1] = Math.abs(decayedY) < ROLL_STOP_SPEED ? 0 : decayedY;
    }

    const ticksLeft = fuse[index] ?? 0;
    if (ticksLeft > 0) {
      fuse[index] = ticksLeft - 1;
      continue;
    }
    explode(sim, index);
  }
}

function explode(sim: GameSim, index: number): void {
  const x = sim.positionX(index);
  const y = sim.positionY(index);
  const tuning = sim.tuning.pickup;
  const armLength = bombBlastArmLength(sim);

  activeSim = sim;
  bomb[BOMB_X] = x;
  bomb[BOMB_Y] = y;
  bomb[BOMB_SELF] = index;
  bomb[BOMB_ARM_LENGTH] = armLength;
  // The broadphase only offers a circular query, so this over-fetches the
  // corners of the cross's bounding square and lets `blastCandidate`'s own
  // cross test reject what the circle let through but the cross would not.
  sim.broadphase.query(x, y, armLength, blastCandidate);
  activeSim = null;

  // Same blast, same reach as the damage above — a secret room's wall opens
  // exactly when a Bierfassl set off near it would also have hurt something
  // standing there. Circular rather than cross-shaped: a door dead-centre on
  // a diagonal from the bomb is a rarer miss than the corners `broadphase`
  // already over-fetches above, and a wall opening slightly too generously
  // is a friendlier failure than a bomb dropped one pixel off-axis leaving a
  // player unable to open a route they can plainly see the blast reached.
  sim.revealBombableWalls(x, y, armLength);

  // #29: an item that changes what a detonation does (Fassldauben's staves)
  // hears about it here, after the blast itself is queried but before the
  // bomb entity is gone — same "broadcast to every held item" shape as any
  // other item hook, just for a moment #26 did not originally name.
  dispatchItemBombDetonate(sim, x, y);

  // Der Losbrunnen (#218): the one way to destroy it outright rather than
  // merely risk a bad roll — a real cost for planting a bomb carelessly
  // near it. Same circular over-fetch radius as the wall reveal just above,
  // for the same reason.
  sim.breakMachineFromBlast(x, y, armLength);

  bombBlast(sim, x, y, sim.tuning.pickup.bombBlastArmTiles);
  sim.addShake(0, -1, tuning.bombBlastDamage);
  sim.world.destroy(sim.world.entityAt(index));
}

function blastCandidate(index: number): void {
  const sim = activeSim;
  if (sim === null || index === (bomb[BOMB_SELF] ?? -1)) {
    return;
  }
  const layer = sim.collision.data[index * 2] ?? 0;
  if ((layer & BLAST_MASK) === 0) {
    return;
  }
  // Matches `applyHit`'s own i-frame check — a blast landing during the
  // player's invulnerability window does nothing, same as a shot would.
  if (index === sim.playerIndex && sim.playerInvulnerableTicks > 0) {
    return;
  }

  const bombX = bomb[BOMB_X] ?? 0;
  const bombY = bomb[BOMB_Y] ?? 0;
  const armLength = bomb[BOMB_ARM_LENGTH] ?? 0;
  const otherX = sim.positionX(index);
  const otherY = sim.positionY(index);
  const otherRadius = sim.body.data[index * 2] ?? 0;
  const dx = otherX - bombX;
  const dy = otherY - bombY;

  // A cross, not a circle (#210): the horizontal arm is a band one tile tall
  // reaching `armLength` either side of the bomb, the vertical arm the same
  // rotated 90°. `otherRadius` grows both bands by the target's own size,
  // the same "expand the shape by the other body's radius" approximation
  // `circlesOverlap` uses for two circles, applied to a rectangle instead.
  const inHorizontalArm =
    Math.abs(dy) <= BLAST_HALF_WIDTH + otherRadius && Math.abs(dx) <= armLength + otherRadius;
  const inVerticalArm =
    Math.abs(dx) <= BLAST_HALF_WIDTH + otherRadius && Math.abs(dy) <= armLength + otherRadius;
  if (!inHorizontalArm && !inVerticalArm) {
    return;
  }

  const length = Math.sqrt(dx * dx + dy * dy);
  const normalX = length > 0 ? dx / length : 0;
  const normalY = length > 0 ? dy / length : -1;

  applyDamageAt(
    sim,
    index,
    sim.tuning.pickup.bombBlastDamage,
    otherX,
    otherY,
    normalX,
    normalY,
    bomb[BOMB_SELF] ?? -1,
  );
}
