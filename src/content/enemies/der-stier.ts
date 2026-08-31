import type { EnemyDefinition, SplitOnDeathBehaviour } from '../../sim/enemy/definition.js';

/**
 * Der Stier and the Maibaum-Dieb (#38) — Floor 2's boss, riding the same
 * boss framework Die Große Kellerassel (#36) established: a `specialRole:
 * 'boss'` room (`content/rooms/dorf-boss.json`) holding a body built from
 * the same primitives every other enemy is.
 *
 * **Phase one** is Kuh's own graze/telegraph/charge/stunned loop
 * (`content/enemies/kuh.ts`), scaled up: "pure charge-and-punish, teaching
 * the loop the Kuh has been rehearsing all floor" is the issue's own words,
 * and the fight is authored to read as literally that lesson, one body
 * heavier and one telegraph longer. `approach` replaces Kuh's `graze` —
 * a boss does not wander harmlessly until noticed, it is already hunting —
 * everything past that point is the same four-state shape.
 *
 * **Phase two** is the same health-gated split Die Große Kellerassel uses
 * (`PHASE_TWO_SPLIT`'s `atHealthBelow`), just spawning one body instead of
 * three: at exactly half health, Der Stier "dies" into `der-stier-maibaum-
 * dieb`, the Maibaum-Dieb having mounted him mid-fight with the maypole he
 * stole. The total health budget does not change across the split — 24 in
 * phase one, threshold at 12, then the Maibaum-Dieb spawns with 12 of his
 * own — the same 24 either way, same as Kellerassel's 18-then-9-times-three.
 *
 * Phase two does not just add damage to the same loop: `charge` and `swing`
 * are chained into one fixed cycle (`approach2` → telegraph-charge → charge
 * → stunned → telegraph-swing → swing → recover → `approach2`) rather than
 * either firing on its own timer independently, so every lap of the fight
 * asks the player to read two differently-timed threats in sequence instead
 * of the same one twice as often — "changes the fight's rhythm rather than
 * just adding damage," per the issue. `swing` is `fireSpread` with a near-
 * full arc: the Maibaum-Dieb clearing a wide ring around the pair with the
 * stolen maypole, the area attack the mount is supposed to add, distinct
 * from the charge's single dodgeable line.
 *
 * The arena's own maypole (`content/rooms/dorf-boss.json`'s `maypole` prop)
 * is separate destructible cover, not wired to this split — it can fall to
 * player fire or to Der Stier's own charge slamming into it, at any point in
 * the fight, the same way any other obstacle can.
 */

const PHASE_TWO_SPLIT: SplitOnDeathBehaviour = {
  behaviour: 'splitOnDeath',
  into: 'der-stier-maibaum-dieb',
  count: 1,
  spread: 0,
  atHealthBelow: 0.5,
};

export const derStier: EnemyDefinition = {
  id: 'der-stier',
  name: 'Der Stier',
  // `boss` since #193 (`sim/enemy/size.ts`, `docs/DECISIONS.md` #56).
  size: 'boss',
  health: 24,
  contactDamage: 3,
  // The boss class already masses 20 — heavier than Kuh's own 9, so a charge a
  // player's own bump could shove off its line would stop reading as "needs a
  // wall to stop." Left explicit so the fight's feel does not move if the class
  // default ever does.
  mass: 20,
  initial: 'approach',
  states: [
    {
      name: 'approach',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.5 }, PHASE_TWO_SPLIT],
      transitions: [{ to: 'telegraph', whenPlayerWithin: 80 }],
    },
    {
      name: 'telegraph',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 26 }, PHASE_TWO_SPLIT],
      transitions: [{ to: 'charge', after: 26 }],
    },
    {
      name: 'charge',
      behaviours: [{ behaviour: 'chargeAtPlayer', speed: 2.6 }, PHASE_TWO_SPLIT],
      transitions: [
        { to: 'stunned', onBlocked: true },
        // An open arena never finds a wall — the safety net so a clean field
        // still eventually ends the charge rather than running forever.
        { to: 'stunned', after: 55 },
      ],
    },
    {
      name: 'stunned',
      behaviours: [{ behaviour: 'pause' }, PHASE_TWO_SPLIT],
      transitions: [{ to: 'approach', after: 50 }],
    },
  ],
};

/**
 * What phase two actually is: the Maibaum-Dieb, mounted, spawned by
 * `PHASE_TWO_SPLIT` at whatever point in phase one crossed the threshold.
 *
 * The cycle is fixed rather than either attack running on its own clock:
 * a charge, then a swing, then back to a charge, every lap. That is what
 * gives the two threats "different timings" without needing the engine to
 * grow a random-choice transition just for this one boss.
 */
export const maibaumDieb: EnemyDefinition = {
  id: 'der-stier-maibaum-dieb',
  name: 'Der Stier (Maibaum-Dieb)',
  // Phase two is Der Stier with a rider, so it reads at the same boss scale
  // (#193): its art moved to `floor-2-rural/bosses/` for the shadow and the
  // silhouette check the class brings with it.
  size: 'boss',
  health: 12,
  contactDamage: 3,
  mass: 20,
  initial: 'approach2',
  states: [
    {
      name: 'approach2',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.55 }],
      transitions: [{ to: 'telegraph-charge', whenPlayerWithin: 80 }],
    },
    {
      name: 'telegraph-charge',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 26 }],
      transitions: [{ to: 'charge', after: 26 }],
    },
    {
      name: 'charge',
      behaviours: [{ behaviour: 'chargeAtPlayer', speed: 2.6 }],
      transitions: [
        { to: 'stunned', onBlocked: true },
        { to: 'stunned', after: 55 },
      ],
    },
    {
      name: 'stunned',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'telegraph-swing', after: 40 }],
    },
    {
      name: 'telegraph-swing',
      // Longer than the charge's own telegraph: a wider, heavier read for a
      // wider, heavier attack — "no attack can be unavoidable given correct
      // positioning" needs the warning to actually cover the area it swings.
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 34 }],
      transitions: [{ to: 'swing', after: 34 }],
    },
    {
      name: 'swing',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSpread',
          shots: 10,
          arc: 5.8,
          everyTicks: 60,
          speed: 1.5,
          damage: 2,
          lifetimeTicks: 34,
        },
      ],
      transitions: [{ to: 'recover', after: 20 }],
    },
    {
      name: 'recover',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'approach2', after: 20 }],
    },
  ],
};
