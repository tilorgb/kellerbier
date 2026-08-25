import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { vectorLength } from '../math.js';
import { type InputFrame, InputAction, axisToUnit, isActionDown } from '../input/frame.js';
import { NO_SLOT } from '../pool/slot-pool.js';
import { ProjectileTeam } from '../projectile/store.js';
import { StatId } from '../stats/definition.js';
import { addPush } from './movement.js';

/**
 * Firing, and everything in flight.
 *
 * Aim is fully independent of movement — the whole point of a twin-stick
 * shooter is that where you are going and where you are shooting are two
 * separate decisions.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepShooting(sim: GameSim, input: Readonly<InputFrame>): void {
  // Umgfalln (#17): knocked down, cannot fire. The cooldown simply does not
  // age this tick — nothing is lost, firing just resumes where it left off
  // once the player is back up.
  if (sim.umgfallnTicks > 0) {
    return;
  }

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
    fire(sim, aimX, aimY, input.analogAim);
    // Schluckfrequenz (#25): resolved through the stat pipeline, which is
    // what applies Promille's fire-rate bonus and floors the result at one
    // tick — the zero-guard a delay-based fire rate needs lives in the cap,
    // not here.
    sim.fireCooldown += Math.round(sim.stats.value(StatId.Schluckfrequenz));
  }
}

function fire(sim: GameSim, aimX: number, aimY: number, analogAim: boolean): void {
  const tuning = sim.tuning.shooting;
  const length = vectorLength(aimX, aimY);
  let directionX = aimX / length;
  let directionY = aimY / length;

  // Promille aim wobble (#17): a slow, deterministic sinusoid rotates the
  // shot direction — everything below reads `directionX`/`directionY`, so
  // muzzle position, projectile velocity and kickback all pick up the same
  // rotated aim consistently. Driven by tick count rather than RNG, since a
  // "slow sinusoidal offset" is exactly what a sine already is.
  const wobbleAmplitude = sim.promilleWobbleAmplitude;
  if (wobbleAmplitude > 0) {
    const wobbleAngle =
      Math.sin((sim.tick / sim.tuning.promille.wobblePeriodTicks) * Math.PI * 2) * wobbleAmplitude;
    const angle = Math.atan2(directionY, directionX) + wobbleAngle;
    directionX = Math.cos(angle);
    directionY = Math.sin(angle);
  }

  const playerIndex = sim.playerIndex;
  const playerBase = playerIndex * 2;
  const playerVelocityX = sim.velocity.data[playerBase] ?? 0;
  const playerVelocityY = sim.velocity.data[playerBase + 1] ?? 0;

  // The muzzle sits further from the player's centre than the player's own
  // radius, so a player standing against a wall and firing into it puts the
  // spawn point inside the wall: the shot dies on its first tick and firing
  // produces nothing at all — no shot, no splash, no sound. Falling back to the
  // player's centre costs one clearance test and turns that case into a shot
  // that leaves the barrel and immediately splashes off the wall, which is what
  // it looks like it should do.
  const centreX = sim.positionX(playerIndex);
  const centreY = sim.positionY(playerIndex);
  let muzzleX = centreX + directionX * tuning.muzzleOffset;
  let muzzleY = centreY + directionY * tuning.muzzleOffset;
  if (!sim.room.isClear(muzzleX, muzzleY, tuning.shotRadius)) {
    muzzleX = centreX;
    muzzleY = centreY;
  }

  // How much of the player's motion the shot carries depends on how they are
  // aiming. Eight-way aim holds the angle between running and aiming still, so
  // the sway is a constant slant a player reads and shoots through; aim that
  // tracks a point rotates that angle continuously, and the same sway becomes
  // wobble. Same feature, two numbers — see the tuning docs.
  const inheritance = analogAim ? tuning.analogVelocityInheritance : tuning.velocityInheritance;

  // Stammwürze (#25): resolved through the stat pipeline — base damage plus
  // Promille's tier bonus today, an item's `modifyStats` hook once #25's
  // consumers exist. Baked in here rather than read live at impact — damage
  // is written once into the projectile at spawn (`ProjectileStore.spawn`)
  // and never re-read, so firing is the only correct hook point.
  const damage = Math.round(sim.stats.value(StatId.Stammwuerze));

  const slot = sim.projectiles.spawn(
    muzzleX,
    muzzleY,
    directionX * tuning.shotSpeed + playerVelocityX * inheritance,
    directionY * tuning.shotSpeed + playerVelocityY * inheritance,
    tuning.shotRadius,
    damage,
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
 * is collision's business.
 *
 * The per-projectile work is a hoisted module function rather than an arrow at
 * the call site, for the same reason the collision system is written that way:
 * an arrow function inside a system is a fresh object every tick, and this loop
 * exists to run thousands of times a tick without producing anything for the
 * collector.
 */
let flightSim: GameSim | null = null;

export function stepProjectiles(sim: GameSim): void {
  flightSim = sim;
  sim.projectiles.forEachLive(advanceProjectile);
  flightSim = null;
}

function advanceProjectile(index: number): void {
  const sim = flightSim;
  if (sim === null) {
    return;
  }
  const projectiles = sim.projectiles;
  const room = sim.room;

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
  // tick than a wall is thick, and testing only the endpoint would let it pass
  // straight through — a bug that appears the first time an item raises shot
  // speed and is maddening to attribute after the fact.
  const distance = vectorLength(velocityX, velocityY);
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
