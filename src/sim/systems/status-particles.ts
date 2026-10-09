import type { GameSim } from '../game/sim.js';
import { PARTICLE_CAPACITY, ParticleKind } from '../particle/store.js';

/**
 * The ambient particles a body gives off while it carries a status: embers
 * off a burning one, snow off a frozen one, green motes off a poisoned one,
 * heavy dust off a slowed one, a ring of stars round a dazed one. The body's
 * tint and glow (`render/status-look.ts`) say *that* it is afflicted; these
 * say *what with*, in motion, so a status is legible at a glance even on a
 * dark sprite in a dark room.
 *
 * Deliberately not random: the offsets come from the tick and the body's slot
 * through sin and cos, so emitting here never draws from the cosmetic stream
 * and cannot shift any other effect's rolls. Each status has its own cadence,
 * staggered per body so a room of burning enemies does not pulse in unison.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Ticks between two particles of each status. */
const BURN_EVERY = 2;
const FREEZE_EVERY = 3;
const POISON_EVERY = 4;
const SLOW_EVERY = 5;
const DAZE_EVERY = 4;

const BURN_LIFE = 22;
const FREEZE_LIFE = 30;
const POISON_LIFE = 36;
const SLOW_LIFE = 26;
const DAZE_LIFE = 16;

/**
 * Ambience gives way before feedback: once this share of the particle pool is
 * live, status particles stop, so a room full of afflicted bodies never
 * recycles away the foam and sparks that say a hit landed.
 */
const AMBIENT_POOL_SHARE = 0.6;

/** How far from the body's centre a particle is born. */
const SCATTER = 4;
/** The radius of a dazed body's ring of stars. */
const DAZE_ORBIT = 7;

export function emitStatusParticles(
  sim: GameSim,
  index: number,
  burning: boolean,
  frozen: boolean,
  poisoned: boolean,
  slowed: boolean,
  dazed: boolean,
): void {
  if (!burning && !frozen && !poisoned && !slowed && !dazed) {
    return;
  }
  if (sim.particles.liveCount > PARTICLE_CAPACITY * AMBIENT_POOL_SHARE) {
    return;
  }
  const phase = sim.tick + index * 3;
  const x = sim.positionX(index);
  const y = sim.positionY(index);
  const size = sim.tuning.impact.particleSize;
  const angle = phase * 0.9 + index * 2.3;
  const scatterX = Math.cos(angle) * SCATTER;
  const scatterY = Math.sin(angle * 1.3) * SCATTER * 0.6;
  const particles = sim.particles;

  if (burning && phase % BURN_EVERY === 0) {
    particles.spawn(
      x + scatterX,
      y + scatterY,
      scatterX * 0.01,
      -0.05,
      BURN_LIFE,
      size * 2.4,
      ParticleKind.Ember,
    );
  }
  if (frozen && phase % FREEZE_EVERY === 0) {
    particles.spawn(
      x + scatterX,
      y + scatterY,
      scatterY * 0.01,
      0.02,
      FREEZE_LIFE,
      size * 2.4,
      ParticleKind.Snow,
    );
  }
  if (poisoned && phase % POISON_EVERY === 0) {
    particles.spawn(
      x + scatterX,
      y + scatterY,
      scatterX * 0.008,
      -0.02,
      POISON_LIFE,
      size * 2.8,
      ParticleKind.Miasma,
    );
  }
  if (slowed && phase % SLOW_EVERY === 0) {
    particles.spawn(x + scatterX, y + SCATTER, 0, 0.01, SLOW_LIFE, size * 2.6, ParticleKind.Dust);
  }
  if (dazed && phase % DAZE_EVERY === 0) {
    const orbit = phase * 0.35;
    particles.spawn(
      x + Math.cos(orbit) * DAZE_ORBIT,
      y + Math.sin(orbit) * DAZE_ORBIT * 0.5,
      0,
      0,
      DAZE_LIFE,
      size * 2.6,
      ParticleKind.Glint,
    );
  }
}
