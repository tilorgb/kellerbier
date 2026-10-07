import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Das Waldradl (#413) — Floor 3's boss, phase two: the Waldradler is beaten and
 * only one wheel of his bike survived. The *Radler* is gone; the *Radl* is left,
 * spinning in place and filling the screen with shots — with gaps.
 *
 * It spawns where the Waldradler died (`splitOnDeath`), rolls to the arena
 * centre during a short invulnerable intro (`glideToPoint`, `becomeInvulnerable`,
 * `telegraph`), and spins there: a ring of 28 shots every 14 ticks with two
 * opposite gaps of three slots, the whole pattern turning slowly
 * (`fireRotatingRing`). The pattern is a pure function of the volley number — no
 * RNG, the same in every fight, so it can be learnt — and the shots are plain
 * damage: the poison finale was phase one, and the Maß the Waldradler dropped
 * stays useful.
 *
 * **There is always a safe gap with a line of fire to the wheel.** A gap is the
 * same number of slots wherever the pattern has turned to, and the registry
 * refuses a pattern whose gap is narrower than the player at `minSafeDistance`
 * (`sim/enemy/rotating-ring.ts`); the player shoots it down from inside one.
 *
 * **Position is an implementer default**, flagged in the PR: the arena centre,
 * because a gap pattern only reads fairly from the middle of an empty arena. If
 * "where he died" is preferred, it is a one-state change (drop `roll`).
 *
 * `size: 'mid'` is a placeholder canvas decision pending art sign-off: a wheel
 * is not a boss-sized body.
 */
export const waldradl: EnemyDefinition = {
  id: 'waldradl',
  name: 'Waldradl',
  size: 'mid',
  deathEffect: 'dust',
  // ~40% of phase one's, tuned against `tests/content/boss-pacing.test.ts`.
  health: 32,
  contactDamage: 1,
  // The bar continues from phase one.
  bossBar: true,
  initial: 'roll',
  states: [
    {
      name: 'roll',
      behaviours: [
        { behaviour: 'glideToPoint', point: 'roomCentre', ticks: 60 },
        { behaviour: 'becomeInvulnerable', ticks: 60 },
        { behaviour: 'telegraph', ticks: 60 },
      ],
      transitions: [{ to: 'spin', after: 60 }],
    },
    {
      name: 'spin',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireRotatingRing',
          shots: 28,
          everyTicks: 14,
          rotationPerVolley: 0.06,
          gaps: [
            { at: 0, width: 3 },
            { at: Math.PI, width: 3 },
          ],
          speed: 1.5,
          damage: 1,
          lifetimeTicks: 240,
          // Where the corridor is narrowest that still matters: a player
          // standing against the wheel is a player the wheel's own collider
          // keeps further out than this.
          minSafeDistance: 36,
        },
      ],
    },
  ],
};
