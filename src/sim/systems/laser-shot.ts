import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { muzzleFlash } from '../particle/effects.js';
import { NO_SLOT } from '../pool/slot-pool.js';
import { finalizeProjectileTags } from '../projectile/behavior.js';
import { ProjectileTag } from '../projectile/tags.js';
import { PROJECTILE_TINT_INDEX } from '../projectile/tints.js';
import { ProjectileTeam } from '../projectile/store.js';
import { CLEAR_IGNORE_PITS } from '../room/geometry.js';
import { StatId } from '../stats/definition.js';
import { addPush } from './movement.js';

/**
 * The Pfeitinger Ultrabräu's shot: a laser you wind up.
 *
 * While the item is held the trigger no longer fires a stream. Holding it
 * charges (`GameSim.laserCharge`); once the charge is full the beam is ready
 * and waits; letting go fires it. Letting go early fizzles and the charge is
 * lost. How long the wind-up takes scales with the Fire Rate stat — every
 * point of fire rate shortens it in proportion.
 *
 * The beam is a very fast piercing projectile, so a hit goes through exactly
 * the path any shot's does (invulnerable bodies, deflection, loot and kill
 * credit); `GameSim.laserBeam` is only what `render/laser-beam-view.ts` draws.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate.
 */

export const LASER_ITEM_ID = 'pfeitinger-ultrabraeu';
/** Ticks to charge at the base fire rate — 0.8 s. */
export const LASER_WINDUP_TICKS = 48;
/** Never charges quicker than this, however fast the fire rate. */
export const LASER_MIN_WINDUP_TICKS = 10;
export const LASER_DAMAGE_SCALE = 2.5;
/** Farthest the beam reaches, in room units — about a screen. */
export const LASER_LENGTH = 400;
/** The projectile's speed per tick; fast enough that it crosses the beam in a handful of ticks. */
const LASER_SPEED = 80;
const LASER_RADIUS = 4;
/** Larger than any pierce budget a shot can carry: the beam goes through everything. */
const LASER_PIERCE = 99;
/** How many ticks the drawn beam lingers. */
export const LASER_BEAM_TICKS = 8;

/** Ticks the wind-up takes right now. */
export function laserWindupTicks(sim: GameSim): number {
  const base = Math.max(1, sim.tuning.shooting.fireDelayTicks);
  const scaled = Math.round((LASER_WINDUP_TICKS * sim.stats.value(StatId.FireRate)) / base);
  return Math.max(LASER_MIN_WINDUP_TICKS, scaled);
}

/** One tick of the charge: `wantsToFire` is the trigger held with an aim direction. */
export function stepLaserCharge(sim: GameSim, wantsToFire: boolean): void {
  const windup = laserWindupTicks(sim);
  if (wantsToFire) {
    sim.fireHeldTick = sim.tick;
    sim.laserCharge = Math.min(windup, sim.laserCharge + 1);
    return;
  }
  const charged = sim.laserCharge >= windup;
  sim.laserCharge = 0;
  if (charged) {
    fireLaser(sim);
  }
}

function fireLaser(sim: GameSim): void {
  const tuning = sim.tuning.shooting;
  const directionX = sim.aimDirectionX;
  const directionY = sim.aimDirectionY;
  const playerIndex = sim.playerIndex;
  const centreX = sim.positionX(playerIndex);
  const centreY = sim.positionY(playerIndex);
  let muzzleX = centreX + directionX * tuning.muzzleOffset;
  let muzzleY = centreY + directionY * tuning.muzzleOffset;
  if (!sim.room.isClear(muzzleX, muzzleY, tuning.shotRadius, CLEAR_IGNORE_PITS)) {
    muzzleX = centreX;
    muzzleY = centreY;
  }

  // Where the beam ends: the last clear point along the aim.
  let length = 0;
  while (length < LASER_LENGTH) {
    const next = length + 3;
    if (
      !sim.room.isClear(
        muzzleX + directionX * next,
        muzzleY + directionY * next,
        tuning.shotRadius,
        CLEAR_IGNORE_PITS,
      )
    ) {
      break;
    }
    length = next;
  }

  sim.lastShotTick = sim.tick;
  sim.laserBeam[0] = muzzleX;
  sim.laserBeam[1] = muzzleY;
  sim.laserBeam[2] = muzzleX + directionX * length;
  sim.laserBeam[3] = muzzleY + directionY * length;
  sim.laserBeamTick = sim.tick;
  sim.events.push(
    EventKind.ShotFired,
    playerIndex,
    NO_SLOT,
    muzzleX,
    muzzleY,
    directionX,
    directionY,
    0,
  );

  const slot = sim.projectiles.spawn(
    muzzleX,
    muzzleY,
    directionX * LASER_SPEED,
    directionY * LASER_SPEED,
    LASER_RADIUS,
    sim.stats.value(StatId.Damage) * LASER_DAMAGE_SCALE,
    Math.max(1, Math.ceil(length / LASER_SPEED) + 1),
    ProjectileTeam.Player,
    ProjectileTag.Piercing,
    0,
    PROJECTILE_TINT_INDEX.laser,
  );
  if (slot === NO_SLOT) {
    return;
  }
  finalizeProjectileTags(sim, slot);
  sim.projectiles.pierceRemaining[slot] = LASER_PIERCE;
  muzzleFlash(sim, muzzleX, muzzleY);
  addPush(sim, playerIndex, -directionX * tuning.kickback, -directionY * tuning.kickback);
}
