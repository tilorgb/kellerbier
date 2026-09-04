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
 * words. He fights his full health (see below); there is no mid-fight phase
 * gate any more.
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
 *
 * **#232: both health pools were an order of magnitude too small.** At 24
 * health Der Stier's own `approach → telegraph → charge → stunned` loop
 * (~131 ticks, ~2.2s) ran two or three times before he died — a full cycle
 * or two short of a player ever having to answer it as a loop rather than
 * a one-off. The pool is tuned, not computed, but the target was the same
 * one #232 states directly: 12-20 seconds against a realistic mid-run 4-6
 * DPS, which is roughly 60-100 health, and 80 landed in that band.
 *
 * **#260: 80 overshot it, same as Die Große Kellerassel's own pool did.**
 * Play reports called the second floor's boss the same "too long" as the
 * first's. 60 keeps `tests/content/boss-pacing.test.ts`'s "at least four
 * `charge`s before he dies" floor with room either side of the boundary
 * (8 loops at 3 DPS, 4 at 6 DPS) while trimming the fight from the 11/6 loops
 * 80 gave. The dieb's armed pool (`maibaumDieb.health`) is scaled down by
 * the same 0.75 ratio #232 first picked, 45 rather than 60, for the same
 * reason: nothing here says phase one and phase two have to move in lockstep,
 * they are just both long by the same proportion.
 *
 * **#260 also splits the dieb's own pool in two.** "Depending on if the dieb
 * could get the maibaum or not" — a disarmed dieb (the player already broke
 * the maypole during phase one) is meant to be a shorter, sadder fight than
 * an armed one, not the same 45-health pool wearing a different animation.
 * `PHASE_TWO_SPLIT.healthWithoutProp` reads whether a live `maypole` prop is
 * still in the room at the instant Der Stier dies (`sim/systems/enemy.ts`'s
 * `splitFromEvent`, the same moment the dieb's own `approach` state will
 * later re-check on its own) and spawns him at 20 health instead of 45 when
 * it is gone — the disarmed `chase`/`dash` loop that gets fewer, quicker
 * turns before he goes down, rather than the melee one's full run.
 */

const PHASE_TWO_SPLIT: SplitOnDeathBehaviour = {
  behaviour: 'splitOnDeath',
  into: 'der-stier-maibaum-dieb',
  count: 1,
  spread: 0,
  // #260: "the Dieb is sad and thus can be disposed quicker" without the
  // maypole he was heading for — see the module doc comment above.
  healthWithoutProp: { propKind: 'maypole', health: 20 },
};

export const derStier: EnemyDefinition = {
  id: 'der-stier',
  name: 'Der Stier',
  // `boss` since #193 (`sim/enemy/size.ts`, `docs/DECISIONS.md` #56).
  size: 'boss',
  // #260: was 80; #232 before that: was 24. See the module doc comment —
  // tuned by feel against `tests/content/boss-pacing.test.ts`'s loop-count
  // floor, not computed.
  health: 60,
  // #232: was 3. There is one `contactDamage` field for both an idle touch
  // and a connected charge (`sim/systems/contact.ts` reads it either way),
  // and at 3 against a 6-health player two touches were most of a run —
  // `docs/DECISIONS.md` #65's "pressure from a shot, not a body" applies to
  // a charge too: it is punishable exactly because it is telegraphed, and a
  // longer fight (the health pool above) is the intended lever, not a
  // harder-hitting one.
  contactDamage: 1,
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
 * the dash, not his mass. `health` here (45, #260: was 60, #232: was 18 —
 * scaled with Der Stier's own by the same 0.75 ratio each time) is what he
 * spawns at when he still has a maypole to reach; the boss bar refills to
 * whichever pool he actually spawned with on its own, because
 * `GameSim.bossHealth` sums whatever `locksRoom` bodies are alive and Der
 * Stier's have just left the room. `PHASE_TWO_SPLIT.healthWithoutProp`
 * (`der-stier.ts`'s own doc comment) spawns him at 20 instead when no live
 * maypole remains — this field is only ever the armed number.
 *
 * `initial: 'approach'`. From there the machine forks once, on whether he
 * reaches a live maypole (`whenPropWithin`) before he reaches the player
 * (`whenPlayerWithin`), and never forks again.
 */
export const maibaumDieb: EnemyDefinition = {
  id: 'der-stier-maibaum-dieb',
  name: 'Der Stier (Maibaum-Dieb)',
  size: 'normal',
  health: 45,
  // #232: was 3, same "length over damage" reasoning as Der Stier's own —
  // both the passive touch and the disarmed `dash`'s charge read this one
  // field, and `meleeArc`'s telegraphed swing (below) is the armed branch's
  // real punish, not incidental contact.
  contactDamage: 1,
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
