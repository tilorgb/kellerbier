import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { vectorLength } from '../math.js';
import { ParticleKind } from '../particle/store.js';
import { addPush } from './movement.js';

/**
 * What a hit does.
 *
 * This is the most important file in the game. Everything else is content;
 * this is the reason the content is worth playing. A hit fires the whole
 * package at once — flash, freeze, knockback, shake, foam — and none of the
 * individual pieces is expensive or clever. What matters is that they all
 * happen, together, on the same frame.
 *
 * It reads the event queue rather than being called by collision, which is what
 * lets any of it be retuned, weakened for accessibility, or switched off
 * entirely without touching the code that decided a hit happened.
 */
export function stepImpact(sim: GameSim): void {
  const events = sim.events;
  const count = events.capacity;

  // A plain index walk rather than `forEach`, because this loop pushes new
  // events (deaths) while it runs, and appending to a list being iterated is
  // how a system ends up processing its own output.
  const live = collectHits(sim);
  for (let entry = 0; entry < live; entry++) {
    const slot = hitSlots[entry] ?? 0;
    if (slot >= count) {
      continue;
    }
    applyHit(sim, slot);
  }
}

/**
 * Hit event slots for this tick.
 *
 * A module-level buffer sized to the event queue, so the pass that reads hits
 * and the pass that writes deaths do not interleave — and so neither of them
 * allocates.
 */
const hitSlots = new Int32Array(1024);
let collectSim: GameSim | null = null;
let collected = 0;

function collectHits(sim: GameSim): number {
  collectSim = sim;
  collected = 0;
  sim.events.forEach(collectHit);
  collectSim = null;
  return collected;
}

function collectHit(slot: number): void {
  const sim = collectSim;
  if (sim === null || collected >= hitSlots.length) {
    return;
  }
  if (sim.events.kind[slot] !== EventKind.ProjectileHit) {
    return;
  }
  hitSlots[collected] = slot;
  collected += 1;
}

function applyHit(sim: GameSim, slot: number): void {
  const events = sim.events;
  const tuning = sim.tuning.impact;

  const target = events.subject[slot] ?? 0;
  const damage = events.value[slot] ?? 0;
  const hitX = events.x[slot] ?? 0;
  const hitY = events.y[slot] ?? 0;
  const normalX = events.normalX[slot] ?? 0;
  const normalY = events.normalY[slot] ?? 0;

  const health = sim.health.data;
  const remaining = (health[target * 2] ?? 0) - damage;
  const killed = (health[target * 2 + 1] ?? 0) > 0 && remaining <= 0;
  health[target * 2] = Math.max(0, remaining);

  // Flash. One tick of solid white, and the whole read of "that connected".
  sim.flash.data[target] = Math.min(
    255,
    Math.round(killed ? tuning.deathFlashTicks : tuning.flashTicks),
  );

  // Hitstop. Scaled by damage, capped hard — past about four ticks it stops
  // reading as impact and starts reading as a dropped frame.
  const hitstop = killed
    ? tuning.deathHitstopTicks
    : Math.min(tuning.maxHitstopTicks, tuning.hitstopTicks + damage * tuning.hitstopPerDamage);
  sim.requestHitstop(Math.round(hitstop));

  // Knockback, along the way the shot was travelling, divided by mass. A heavy
  // enemy shrugging off what throws a light one is how mass becomes something
  // the player reads off the screen.
  const mass = Math.max(0.01, sim.body.data[target * 2 + 1] ?? 1);
  const impulse = (damage * tuning.knockback) / mass;
  addPush(sim, target, -normalX * impulse, -normalY * impulse);

  // Screenshake, directional and capped.
  sim.addShake(-normalX, -normalY, killed ? tuning.deathShake : damage * tuning.shakePerDamage);

  spray(
    sim,
    hitX,
    hitY,
    normalX,
    normalY,
    killed ? tuning.particlesOnDeath : tuning.particlesPerHit,
    killed ? ParticleKind.Splash : ParticleKind.Foam,
  );

  if (tuning.damageNumbers) {
    sim.damageNumbers.spawn(
      hitX,
      hitY,
      normalX * 0.4,
      -1.4,
      Math.round(tuning.damageNumberLifeTicks),
      damage,
    );
  }

  if (killed) {
    events.push(EventKind.Death, target, events.other[slot] ?? 0, hitX, hitY, normalX, normalY, 0);
    sim.kill(target);
  }
}

/**
 * A burst of foam along the impact normal.
 *
 * Drawn from the cosmetic random stream, which exists exactly for this: a
 * particle effect that rolled from the shared generator would shift every
 * subsequent draw in the run, so adding one spark would silently rewrite every
 * floor layout in the game.
 */
function spray(
  sim: GameSim,
  x: number,
  y: number,
  normalX: number,
  normalY: number,
  count: number,
  kind: number,
): void {
  const tuning = sim.tuning.impact;
  const random = sim.random.cosmetic;

  const length = vectorLength(normalX, normalY);
  const baseAngle = length === 0 ? 0 : Math.atan2(normalY, normalX);

  for (let particle = 0; particle < count; particle++) {
    const angle = baseAngle + (random.nextFloat() * 2 - 1) * tuning.particleSpread;
    const speed = tuning.particleSpeed * (0.4 + random.nextFloat() * 0.8);
    sim.particles.spawn(
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      Math.round(tuning.particleLifeTicks * (0.6 + random.nextFloat() * 0.6)),
      1 + random.nextFloat() * 1.5,
      kind === ParticleKind.Splash ? ParticleKind.Splash : ParticleKind.Foam,
    );
  }
}

/** Ages every particle, and drags it toward a stop. */
export function stepParticles(sim: GameSim): void {
  particleSim = sim;
  sim.particles.forEachLive(advanceParticle);
  sim.damageNumbers.forEachLive(advanceDamageNumber);
  particleSim = null;
}

let particleSim: GameSim | null = null;

function advanceParticle(index: number): void {
  const sim = particleSim;
  if (sim === null) {
    return;
  }
  const particles = sim.particles;

  const remaining = (particles.life[index] ?? 0) - 1;
  if (remaining <= 0) {
    particles.despawn(index);
    return;
  }
  particles.life[index] = remaining;

  const x = particles.x[index] ?? 0;
  const y = particles.y[index] ?? 0;
  particles.previousX[index] = x;
  particles.previousY[index] = y;

  const drag = sim.tuning.impact.particleDrag;
  const velocityX = (particles.velocityX[index] ?? 0) * drag;
  const velocityY = (particles.velocityY[index] ?? 0) * drag;
  particles.velocityX[index] = velocityX;
  particles.velocityY[index] = velocityY;
  particles.x[index] = x + velocityX;
  particles.y[index] = y + velocityY;
}

/** Damage numbers pop upward and arc away. */
function advanceDamageNumber(index: number): void {
  const sim = particleSim;
  if (sim === null) {
    return;
  }
  const numbers = sim.damageNumbers;

  const remaining = (numbers.life[index] ?? 0) - 1;
  if (remaining <= 0) {
    numbers.despawn(index);
    return;
  }
  numbers.life[index] = remaining;

  const x = numbers.x[index] ?? 0;
  const y = numbers.y[index] ?? 0;
  numbers.previousX[index] = x;
  numbers.previousY[index] = y;

  // Rises, slows, then falls: the arc is what makes it read as a pop rather
  // than a label sliding up the screen.
  const velocityY = (numbers.velocityY[index] ?? 0) + 0.09;
  numbers.velocityY[index] = velocityY;
  numbers.x[index] = x + (numbers.velocityX[index] ?? 0);
  numbers.y[index] = y + velocityY;
}
