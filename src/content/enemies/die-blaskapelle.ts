import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Die Blaskapelle (#277) — Dorf & Acker's first mini-boss, and the one built
 * almost entirely out of a body the floor already has.
 *
 * Three Blaskapellisten stand in formation and play. None of them moves,
 * none of them chases, and there is nothing to dodge in the sense floor 1
 * teaches: **the room is the attack**. Each fires the expanding sound ring
 * the roster Blaskapellist (#37) already fires, on the same 30-tick beat —
 * 120 BPM at the simulation's fixed 60 ticks/second — but on *offset* beats,
 * an eighth apart, so the three rings never arrive together. What the player
 * stands in is the lattice their overlap makes: a pattern that moves through
 * the room on the bar rather than a body that walks at them.
 *
 * That is what `beatOffset` (`sim/enemy/definition.ts`) exists for, and why
 * the offset lives on the *clock* rather than in the state machine. These are
 * three separate bodies with three separate state timers; an offset counted
 * from "when this body entered its state" would drift with whatever order
 * they happened to spawn in. Counted against `sim.tick` — the one
 * deterministic clock, the same one `fireOnBeat` was already written against
 * for exactly this reason (#37's "drive it from the tick counter, not from
 * audio playback position") — an eighth behind the tuba stays an eighth
 * behind it for the whole fight. Whatever M8's real Floor 2 track turns out
 * to be only has to share this tick rate to land on it, and this is the fight
 * that makes the roster's "fires on the beat of the floor music" promise
 * legible rather than incidental.
 *
 * **Killing one changes the pattern rather than reducing it.** Drop the
 * Trompete and the lattice loses its fast, sparse layer — the room gets
 * easier to read and much harder to leave, because what is left is the
 * Tuba's slow dense wall with a hole in the bar where the trumpet used to be.
 * Drop the Tuba first and the walls go, but everything remaining is quick.
 * Kill order is a real decision, and the healths are staggered (16/12/10) so
 * that it costs something: the layer that is easiest to remove is not the one
 * doing the most work.
 *
 * ## The step up from floor 1
 *
 * Not the health pool. The three of them together are 38, against Die
 * Zapfhahn-Orgel's 34 — the same order of number, deliberately (#231's
 * cautionary tale: floor 2's difficulty pass once went to +55%/+70% and made
 * the floor read as a final stage rather than a second one). The step up is
 * the *question*. The Orgel asks "can you read one rhythm and keep
 * perpendicular to it"; this asks "can you read three at once, and which one
 * do you take away first" — footwork plus a target-priority decision the
 * floor-1 pair each only asked half of.
 *
 * ## Art
 *
 * Three sprites rather than one wide one (`tools/art/authoring/
 * floor2-minibosses.mjs`): three bodies with three healths need three
 * silhouettes to shoot at, and the formation only reads as a formation if the
 * gaps between them are real room the player can stand in. Each is the roster
 * Blaskapellist's build scaled to `mid`, told apart by its instrument — the
 * one thing at 640x360 that can carry "this is the one firing the fast ring".
 */

/** The floor's beat: 30 ticks at 60 ticks/second is 120 BPM, a marching-band tempo. */
const BEAT_TICKS = 30;

/**
 * Die Tuba — the downbeat, and the wall.
 *
 * The widest, slowest, densest ring, and the one that persists longest: it is
 * what makes the lattice a *shape* rather than three sprays. Toughest of the
 * three (16), because the layer a player most wants gone should be the one
 * they have to commit to.
 */
export const blaskapelleTuba: EnemyDefinition = {
  id: 'die-blaskapelle-tuba',
  name: 'Die Blaskapelle (Tuba)',
  size: 'mid',
  health: 16,
  contactDamage: 1,
  // Planted. A band that a player's own bump could shove out of formation
  // would stop being a formation.
  mass: 30,
  bossBar: true,
  initial: 'oompah',
  states: [
    {
      name: 'oompah',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireOnBeat',
          shots: 10,
          everyTicks: BEAT_TICKS,
          beatOffset: 0,
          speed: 0.7,
          damage: 1,
          lifetimeTicks: 84,
          art: 'blas-note',
        },
      ],
    },
  ],
};

/**
 * Die Trompete — the offbeat, and the one that catches a player moving.
 *
 * Sparse and fast: fewer notes, so there is room between them, but they cross
 * the gap the Tuba's ring left before a player who was watching only the Tuba
 * has finished stepping into it. Thinnest of the three (10) — the layer that
 * is quickest to take away, which is the whole of the kill-order question.
 */
export const blaskapelleTrompete: EnemyDefinition = {
  id: 'die-blaskapelle-trompete',
  name: 'Die Blaskapelle (Trompete)',
  size: 'mid',
  health: 10,
  contactDamage: 1,
  mass: 30,
  bossBar: true,
  initial: 'oompah',
  states: [
    {
      name: 'oompah',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireOnBeat',
          shots: 7,
          everyTicks: BEAT_TICKS,
          // A third of the bar behind the tuba. Triplets, not a chord.
          beatOffset: 10,
          speed: 1.4,
          damage: 1,
          lifetimeTicks: 52,
          art: 'blas-note',
        },
      ],
    },
  ],
};

/**
 * Die Posaune — the third beat, and the one that fills in.
 *
 * Between the other two on every axis, which is what turns two overlapping
 * rings into a lattice: on its own it is the least interesting of the three,
 * and it is the reason the other two are hard.
 */
export const blaskapellePosaune: EnemyDefinition = {
  id: 'die-blaskapelle-posaune',
  name: 'Die Blaskapelle (Posaune)',
  size: 'mid',
  health: 12,
  contactDamage: 1,
  mass: 30,
  bossBar: true,
  initial: 'oompah',
  states: [
    {
      name: 'oompah',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireOnBeat',
          shots: 9,
          everyTicks: BEAT_TICKS,
          // Two thirds of the bar behind the tuba.
          beatOffset: 20,
          speed: 1.0,
          damage: 1,
          lifetimeTicks: 66,
          art: 'blas-note',
        },
      ],
    },
  ],
};
