import type { EnemyDefinition, EnemyTransition } from '../../sim/enemy/definition.js';

/**
 * The First Human (#437) — Die Alpen's boss. The name is English on purpose
 * and stays untranslated in every locale (the issue's own call: a man five
 * thousand years out of the ice has no Bavarian).
 *
 * The fight is a *pendulum*. He stalks — slow and jerky, a walk of a few
 * steps and a stop — until the player is close enough, then plants himself in
 * the Ötzi stance (one arm across the chest, one held out) and sweeps the
 * held-out arm across the player's position, flinging shots along it as it
 * goes (`fireSweep`): the ground the arm has already passed is safe, the
 * ground ahead of it is where the next shot lands. Swings alternate left →
 * right → left, every swing centred on where the player stood when its
 * wind-up began (the `telegraph` state's aim lock), and the stance before
 * each swing is the tell for which way it goes. Phase one alternates a
 * *narrow, quick* sweep with a *wide, slow* one.
 *
 * **Phase two** at half health (`whenHealthBelow`, declared on every phase-one
 * state so the threshold is read wherever he happens to be): he stops,
 * invulnerable, and pulls the arrowhead out of his own shoulder — a long
 * telegraph with nothing behind it, the one quiet beat of the fight — and
 * then swings faster, with an aimed arrow throw between the sweeps
 * (`fireAtPlayer`, art `arrow`): a single fast shot at the locked spot,
 * which punishes standing still behind a sweep the way the sweeps punish
 * running into one.
 *
 * Pacing (`tests/content/boss-pacing.test.ts`): health is set so the pendulum
 * plays several times in each phase against a player holding the trigger
 * from the first tick, and the arena's two boulders (`alpen-boss.json`) are
 * real cover against the sweep — its shots are plain projectiles and die on
 * a block like any other.
 */

/** Phase two is entered from any phase-one state at half health. */
const PHASE_TWO: EnemyTransition = { to: 'arrow-pull', whenHealthBelow: 0.5 };

/** The shot every sweep flings: a flint flake, short-lived, one half-Maß. */
const FLINT = {
  speed: 1.45,
  damage: 1,
  lifetimeTicks: 150,
  radius: 3,
  art: 'flint',
} as const;

const NARROW_ARC = 1.1;
const WIDE_ARC = 2.6;

/**
 * The aimed arrow between phase-two sweeps: one fast shot at the spot the
 * `draw` wind-up locked. `everyTicks` outlasts the state, so it fires once.
 */
const ARROW_THROW = {
  behaviour: 'fireAtPlayer',
  everyTicks: 999,
  speed: 2.8,
  damage: 1,
  lifetimeTicks: 110,
  radius: 3,
  art: 'arrow',
} as const;

export const theFirstHuman: EnemyDefinition = {
  id: 'the-first-human',
  name: 'The First Human',
  size: 'boss',
  deathEffect: 'dust',
  // Measured, not picked (#232's rule): see `boss-pacing.test.ts`. 150 at
  // 6 DPS is roughly three pendulum cycles a phase; at a run's starting 3 DPS,
  // about twice that.
  health: 150,
  // A brush with him is one half-Maß — the fight is the sweeps, not the body.
  contactDamage: 1,
  // Heavier than the boss default: a stream of shots must not walk him
  // backwards out of his own stance.
  mass: 32,
  bossBar: true,
  // From the arrowhead pull on, the strip without the arrowhead in his
  // shoulder (`the-first-human-phase-two`) — the same threshold as PHASE_TWO.
  phaseArtBelow: 0.5,
  title: 'enemies.the-first-human.title',
  epithet: 'enemies.the-first-human.epithet',
  initial: 'stalk',
  states: [
    // ---------------------------------------------------------- phase one
    {
      name: 'stalk',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.55 }],
      transitions: [
        PHASE_TWO,
        { to: 'windup-left', whenPlayerWithin: 110 },
        { to: 'hold', after: 30 },
      ],
    },
    {
      // The jerk in the stalk: a few steps, a stop, a few steps.
      name: 'hold',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [
        PHASE_TWO,
        { to: 'windup-left', whenPlayerWithin: 130 },
        { to: 'stalk', after: 16 },
      ],
    },
    {
      name: 'windup-left',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 44 }],
      transitions: [PHASE_TWO, { to: 'sweep-narrow', after: 44 }],
    },
    {
      name: 'sweep-narrow',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSweep',
          arc: NARROW_ARC,
          sweepTicks: 30,
          shotEveryTicks: 5,
          direction: -1,
          telegraphReach: 72,
          ...FLINT,
        },
      ],
      transitions: [PHASE_TWO, { to: 'windup-right', after: 46 }],
    },
    {
      name: 'windup-right',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 44 }],
      transitions: [PHASE_TWO, { to: 'sweep-wide', after: 44 }],
    },
    {
      name: 'sweep-wide',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSweep',
          arc: WIDE_ARC,
          sweepTicks: 66,
          shotEveryTicks: 5,
          direction: 1,
          telegraphReach: 72,
          ...FLINT,
        },
      ],
      transitions: [PHASE_TWO, { to: 'stalk', after: 86 }],
    },
    // ---------------------------------------------------------- phase two
    {
      // The arrowhead comes out. Invulnerable for the whole beat: the player
      // is meant to watch this, not farm it.
      name: 'arrow-pull',
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'telegraph', ticks: 72 },
        { behaviour: 'becomeInvulnerable', ticks: 72 },
      ],
      transitions: [{ to: 'stalk-2', after: 72 }],
    },
    {
      name: 'stalk-2',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.75 }],
      transitions: [
        { to: 'windup-left-2', whenPlayerWithin: 130 },
        { to: 'hold-2', after: 24 },
      ],
    },
    {
      name: 'hold-2',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [
        { to: 'windup-left-2', whenPlayerWithin: 150 },
        { to: 'stalk-2', after: 12 },
      ],
    },
    {
      name: 'windup-left-2',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 32 }],
      transitions: [{ to: 'sweep-narrow-2', after: 32 }],
    },
    {
      name: 'sweep-narrow-2',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSweep',
          arc: NARROW_ARC,
          sweepTicks: 22,
          shotEveryTicks: 4,
          direction: -1,
          telegraphReach: 72,
          ...FLINT,
        },
      ],
      transitions: [{ to: 'draw-1', after: 34 }],
    },
    {
      name: 'draw-1',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 24 }],
      transitions: [{ to: 'loose-1', after: 24 }],
    },
    {
      name: 'loose-1',
      behaviours: [{ behaviour: 'pause' }, ARROW_THROW],
      transitions: [{ to: 'windup-right-2', after: 18 }],
    },
    {
      name: 'windup-right-2',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 32 }],
      transitions: [{ to: 'sweep-wide-2', after: 32 }],
    },
    {
      name: 'sweep-wide-2',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSweep',
          arc: WIDE_ARC,
          sweepTicks: 48,
          shotEveryTicks: 4,
          direction: 1,
          telegraphReach: 72,
          ...FLINT,
        },
      ],
      transitions: [{ to: 'draw-2', after: 62 }],
    },
    {
      name: 'draw-2',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 24 }],
      transitions: [{ to: 'loose-2', after: 24 }],
    },
    {
      name: 'loose-2',
      behaviours: [{ behaviour: 'pause' }, ARROW_THROW],
      transitions: [{ to: 'stalk-2', after: 18 }],
    },
  ],
};
