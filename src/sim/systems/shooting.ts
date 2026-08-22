import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { type InputFrame, InputAction, axisToUnit, isActionDown } from '../input/frame.js';
import { NO_SLOT } from '../pool/slot-pool.js';
import { ProjectileTeam } from '../projectile/store.js';
import { addPush } from './movement.js';

/**
 * Firing, and everything in flight.
 *
 * Aim is fully independent of movement — the whole point of a twin-stick
 * shooter is that where you are going and where you are shooting are two
 * separate decisions.
 */
export function stepShooting(sim: GameSim, input: Readonly<InputFrame>): void {
  const aimX = axisToUnit(input.aimX);
  const aimY = axisToUnit(input.aimY);
  const wantsToFire = isActionDown(input, InputAction.Fire) && (aimX !== 0 || aimY !== 0);

  // The cooldown ticks down whether or not fire is held, and a shot *adds* the
  // delay rather than assigning it. That is what makes a held-down stream
  // evenly spaced: the rhythm is set by the delay, not by when the tick
  // happened to notice the button.
  if (sim.fireCooldown > 0) {
    sim.fireCooldown -= 1;
  }

  if (wantsToFire && sim.fireCooldown === 0) {
    fire(sim, aimX, aimY);
    sim.fireCooldown += Math.max(1, Math.round(sim.tuning.shooting.fireDelayTicks));
  }
}

function fire(sim: GameSim, aimX: number, aimY: number): void {
  const tuning = sim.tuning.shooting;
  const length = Math.hypot(aimX, aimY);
  const directionX = aimX / length;
  const directionY = aimY / length;

  const playerIndex = sim.playerIndex;
  const playerBase = playerIndex * 2;
  const playerVelocityX = sim.velocity.data[playerBase] ?? 0;
  const playerVelocityY = sim.velocity.data[playerBase + 1] ?? 0;

  const slot = sim.projectiles.spawn(
    sim.positionX(playerIndex) + directionX * tuning.muzzleOffset,
    sim.positionY(playerIndex) + directionY * tuning.muzzleOffset,
    directionX * tuning.shotSpeed + playerVelocityX * tuning.velocityInheritance,
    directionY * tuning.shotSpeed + playerVelocityY * tuning.velocityInheritance,
    tuning.shotRadius,
    tuning.shotDamage,
    Math.max(1, Math.round(tuning.shotLifetimeTicks)),
    ProjectileTeam.Player,
  );
  if (slot === NO_SLOT) {
    return;
  }

  addPush(sim, playerIndex, -directionX * tuning.kickback, -directionY * tuning.kickback);
}

/**
 * Advances everything in flight by one tick.
 *
 * A projectile ends in one of three ways: it runs out of lifetime, which is
 * what gives a weapon its range; it meets a wall; or something hits it, which
 * is collision's business and arrives in #11.
 */
export function stepProjectiles(sim: GameSim): void {
  const projectiles = sim.projectiles;
  const room = sim.room;

  projectiles.forEachLive((index) => {
    const x = projectiles.x[index] ?? 0;
    const y = projectiles.y[index] ?? 0;
    projectiles.previousX[index] = x;
    projectiles.previousY[index] = y;

    const remaining = (projectiles.lifetime[index] ?? 0) - 1;
    if (remaining <= 0) {
      spend(sim, index, x, y, 0, 0);
      return;
    }
    projectiles.lifetime[index] = remaining;

    const velocityX = projectiles.velocityX[index] ?? 0;
    const velocityY = projectiles.velocityY[index] ?? 0;
    const radius = projectiles.radius[index] ?? 0;

    // The step is walked rather than jumped. A fast shot moves further in one
    // tick than a wall is thick, and testing only the endpoint would let it
    // pass straight through — a bug that appears the first time an item raises
    // shot speed and is maddening to attribute after the fact.
    const distance = Math.hypot(velocityX, velocityY);
    const substeps = Math.max(1, Math.ceil(distance / Math.max(1, radius)));
    let currentX = x;
    let currentY = y;
    for (let substep = 0; substep < substeps; substep++) {
      const stepX = currentX + velocityX / substeps;
      const stepY = currentY + velocityY / substeps;
      if (!room.isClear(stepX, stepY, radius)) {
        // The impact normal points back the way the shot came, which is the
        // direction a spray of foam should leave the wall in.
        const normalX = distance === 0 ? 0 : -velocityX / distance;
        const normalY = distance === 0 ? 0 : -velocityY / distance;
        spend(sim, index, currentX, currentY, normalX, normalY);
        return;
      }
      currentX = stepX;
      currentY = stepY;
    }

    projectiles.x[index] = currentX;
    projectiles.y[index] = currentY;
  });
}

/** Ends a projectile and reports it, so whatever draws the puff can hear about it. */
function spend(
  sim: GameSim,
  index: number,
  x: number,
  y: number,
  normalX: number,
  normalY: number,
): void {
  sim.events.push(EventKind.ProjectileSpent, index, NO_SLOT, x, y, normalX, normalY, 0);
  sim.projectiles.despawn(index);
}
