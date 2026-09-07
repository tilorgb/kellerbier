import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Die Zapfhahn-Orgel (#276) — Der Keller's first mini-boss, and the cheap one:
 * three brass taps on one wall firing their foam cones in sequence rather than
 * together, built entirely from the Zapfhahn's (#35) existing `fireSpread` with
 * no engine change.
 *
 * The one idea is **a safe lane that moves**. The room is a rhythm to read, not
 * a body to dodge: `wind` telegraphs, then `spray1`/`spray2`/`spray3` fan three
 * cones one after another — each a beat wider than the last — and then a long
 * `rest`. The answer is footwork, keeping perpendicular so each cone lands where
 * you were, not DPS. It never moves and it never chases (`pause` throughout);
 * touching it is rude, not dangerous (`contactDamage: 0`, like the tap it is
 * three of). A floor-1 tutorial fight: beatable by someone who has never played
 * the genre, because the pattern is fixed and legible.
 *
 * `health` (34) is tuned the way `docs/DECISIONS.md` #66 says — against its own
 * cycle in `tests/content/boss-pacing.test.ts`: the `wind`/spray loop runs
 * several times over at the base 3 DPS and at least twice at 6 DPS (a
 * mini-boss has no phase two and is meant to be shorter than a boss — the "at
 * least four" bar is a boss rule), and it dies well before Die Große
 * Kellerassel does. A mini-boss that outlasts the floor's real boss is the
 * failure this is measured against.
 *
 * `bossBar: true` — it feeds the top-of-screen bar (`GameSim.bossHealth`),
 * which the mini-boss room now shows the same as a boss room.
 */
export const dieZapfhahnOrgel: EnemyDefinition = {
  id: 'die-zapfhahn-orgel',
  name: 'Die Zapfhahn-Orgel',
  size: 'mid',
  health: 34,
  // Wall apparatus. Standing next to it is not the threat; the cones are.
  contactDamage: 0,
  // It is bolted to the wall. Nothing shoves it.
  mass: 40,
  bossBar: true,
  initial: 'wind',
  states: [
    {
      name: 'wind',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 34 }],
      transitions: [{ to: 'spray1', after: 34 }],
    },
    {
      // `everyTicks` far past the state's own `after`: one fan on the tick the
      // state begins (`FiringBehaviourBase`'s rule), never a second before the
      // next spray state takes over. Aimed at the player like every Zapfhahn
      // cone — the "safe lane" is the ground the fan is not crossing, and it
      // moves because the next fan re-aims at wherever you went.
      name: 'spray1',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSpread',
          shots: 4,
          arc: 1.0,
          everyTicks: 999,
          speed: 1.5,
          damage: 1,
          lifetimeTicks: 70,
        },
      ],
      transitions: [{ to: 'spray2', after: 16 }],
    },
    {
      name: 'spray2',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSpread',
          shots: 5,
          arc: 1.5,
          everyTicks: 999,
          speed: 1.5,
          damage: 1,
          lifetimeTicks: 70,
        },
      ],
      transitions: [{ to: 'spray3', after: 16 }],
    },
    {
      name: 'spray3',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSpread',
          shots: 6,
          arc: 2.0,
          everyTicks: 999,
          speed: 1.5,
          damage: 1,
          lifetimeTicks: 70,
        },
      ],
      transitions: [{ to: 'rest', after: 16 }],
    },
    {
      // The long gap the whole rhythm rests on: enough to cross the room and
      // reset your footing before the next `wind`.
      name: 'rest',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'wind', after: 64 }],
    },
  ],
};
