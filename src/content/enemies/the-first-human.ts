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
 * invulnerable, and pulls the arrowhead out of his own shoulder and sticks it
 * to his forehead — a long beat with a sting and a shudder, the one quiet
 * moment of the fight — and his eyes open, red and glowing. Then he swings
 * faster, with an eye laser between the sweeps (`fireBeam`, mode `aim`): the
 * eyes glow for `EYES_GLOW` ticks (the telegraph, and the line it will light is
 * drawn on the snow), then one big laser — two half-Maß — along the bearing
 * locked as the glow began. It punishes standing still behind a sweep the way
 * the sweeps punish running into one, and it is a line, so a boulder is cover
 * from it.
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

/** Ticks his eyes glow before the laser: long enough to step off the line the warning draws. */
const EYES_GLOW = 40;
/** Ticks the laser stays lit. */
const EYE_BEAM_TICKS = 16;

/** The eye laser between phase-two sweeps: one big beam along the bearing the glow locked. */
const EYE_LASER = {
  behaviour: 'fireBeam',
  mode: 'aim',
  beamTicks: EYE_BEAM_TICKS,
  halfWidth: 6,
  damage: 2,
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
        { behaviour: 'phaseShift', shake: 5 },
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
      transitions: [{ to: 'eyes-1', after: 34 }],
    },
    {
      name: 'eyes-1',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: EYES_GLOW }],
      transitions: [{ to: 'laser-1', after: EYES_GLOW }],
    },
    {
      name: 'laser-1',
      behaviours: [{ behaviour: 'pause' }, EYE_LASER],
      transitions: [{ to: 'windup-right-2', after: EYE_BEAM_TICKS + 6 }],
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
      transitions: [{ to: 'eyes-2', after: 62 }],
    },
    {
      name: 'eyes-2',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: EYES_GLOW }],
      transitions: [{ to: 'laser-2', after: EYES_GLOW }],
    },
    {
      name: 'laser-2',
      behaviours: [{ behaviour: 'pause' }, EYE_LASER],
      transitions: [{ to: 'stalk-2', after: EYE_BEAM_TICKS + 6 }],
    },
  ],
};
