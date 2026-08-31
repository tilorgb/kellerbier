import type { EnemyDefinition, SplitOnDeathBehaviour } from '../../sim/enemy/definition.js';

/**
 * Der Stier and the Maibaum-Dieb (#38, reworked #199) — Floor 2's boss, on the
 * same boss framework Die Große Kellerassel (#36) established: a `specialRole:
 * 'boss'` room (`content/rooms/dorf-boss.json`) holding a body built from the
 * same primitives every other enemy is.
 *
 * **Phase one** is Der Stier alone: Kuh's own approach/telegraph/charge/stunned
 * loop (`content/enemies/kuh.ts`), scaled up — "pure charge-and-punish,
 * teaching the loop the Kuh has been rehearsing all floor" is the issue's own
 * words. He fights his full 24 health; there is no mid-fight phase gate any
 * more.
 *
 * **Phase two** begins when Der Stier actually dies. `PHASE_TWO_SPLIT` (no
 * `atHealthBelow`, so it fires on the real killing blow) spawns
 * `der-stier-maibaum-dieb` — the thief, now *dismounted* and fighting on foot
 * with a fresh health pool. He spawns unarmed. The arena's own maypole
 * (`dorf-boss.json`'s `maypole` prop, one of three positions, ~7 hits, tall
 * enough to walk behind) is the weapon he is after:
 *
 * - **still standing** — `approach` heads for it (`approachProp`), `grab`
 *   picks it up (`grabProp` removes the prop from the room), and from there he
 *   only ever swings: a telegraphed wide `meleeArc` that damages and shoves.
 * - **already gone** — if the player brought the maypole down during phase
 *   one, `approachProp` has nothing to head for and falls back to chasing, the
 *   `whenPropWithin` transition never fires, and he drops into the `dash`
 *   states instead: Der Stier's charge, one thief lighter.
 *
 * There is no stored "armed" flag: which branch he is in is just which state
 * the machine walked into. Once `grab` has run, the swing states never
 * transition back to `approach`, so the maypole is his for good.
 */

const PHASE_TWO_SPLIT: SplitOnDeathBehaviour = {
  behaviour: 'splitOnDeath',
  into: 'der-stier-maibaum-dieb',
  count: 1,
  spread: 0,
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
 * Phase two: the dismounted Maibaum-Dieb (#199). Player-sized and a little
 * chubby (`normal`), not a second bull — the threat is the stolen maypole and
 * the dash, not his mass. Fresh 18 health; the boss bar refills to it on its
 * own, because `GameSim.bossHealth` sums whatever `locksRoom` bodies are
 * alive and Der Stier's 24 have just left the room.
 *
 * `initial: 'approach'`. From there the machine forks once, on whether he
 * reaches a live maypole (`whenPropWithin`) before he reaches the player
 * (`whenPlayerWithin`), and never forks again.
 */
export const maibaumDieb: EnemyDefinition = {
  id: 'der-stier-maibaum-dieb',
  name: 'Der Stier (Maibaum-Dieb)',
  size: 'normal',
  health: 18,
  contactDamage: 3,
  // Chubbier than the `normal` default of 3 so a dash is not shoved off line
  // by a player's own bump, the same reason Der Stier states his.
  mass: 6,
  initial: 'approach',
  states: [
    {
      name: 'approach',
      // Heads for the maypole. The only ways out are "reached it" and "it is
      // gone" — no player-proximity transition here, so a dieb still making
      // for a standing pole is never pulled into a charge for passing the
      // player on the way (#199).
      behaviours: [{ behaviour: 'approachProp', propKind: 'maypole', speed: 0.62 }],
      transitions: [
        { to: 'grab', whenPropWithin: 20, prop: 'maypole' },
        { to: 'chase', whenPropBeyond: 9000, prop: 'maypole' },
      ],
    },
    {
      name: 'grab',
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'grabProp', propKind: 'maypole', reach: 24 },
      ],
      transitions: [{ to: 'swing-telegraph', after: 14 }],
    },

    // --- armed: the swing loop, entered once and never left ---
    {
      name: 'swing-telegraph',
      // The wind-up: he cocks the pole back, and the warning has to last long
      // enough to read a heavy 90° swipe coming.
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 30 }],
      transitions: [{ to: 'swing', after: 30 }],
    },
    {
      name: 'swing',
      behaviours: [
        { behaviour: 'pause' },
        {
          // A deterministic 90° swipe: the pole (the weapon the renderer swings)
          // travels the arc over `sweepTicks` and only threatens the wedge it
          // is passing, so being behind it or outside its reach is safe. `reach`
          // matches the stubby pole — the player really has to be close.
          behaviour: 'meleeArc',
          arc: Math.PI / 2,
          reach: 40,
          damage: 3,
          knockback: 4,
          sweepTicks: 14,
          weapon: 'maibaum',
        },
      ],
      transitions: [{ to: 'swing-recover', after: 20 }],
    },
    {
      name: 'swing-recover',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'swing-approach', after: 16 }],
    },
    {
      name: 'swing-approach',
      // Close to just past the pole's reach before winding up, so the swipe
      // lands rather than whiffing at air.
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.6 }],
      transitions: [{ to: 'swing-telegraph', whenPlayerWithin: 46 }],
    },

    // --- disarmed: Der Stier's charge, one thief lighter ---
    {
      name: 'chase',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.62 }],
      transitions: [{ to: 'dash-telegraph', whenPlayerWithin: 72 }],
    },
    {
      name: 'dash-telegraph',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 24 }],
      transitions: [{ to: 'dash', after: 24 }],
    },
    {
      name: 'dash',
      behaviours: [{ behaviour: 'chargeAtPlayer', speed: 2.7 }],
      transitions: [
        { to: 'dash-stunned', onBlocked: true },
        { to: 'dash-stunned', after: 52 },
      ],
    },
    {
      name: 'dash-stunned',
      behaviours: [{ behaviour: 'pause' }],
      // Back to `chase`, not `approach`: the maypole is gone for good, so the
      // disarmed branch self-loops without re-checking for it.
      transitions: [{ to: 'chase', after: 46 }],
    },
  ],
};
