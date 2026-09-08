import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Der Ladewagen (#277) — Dorf & Acker's second mini-boss: the tractor and its
 * trailer, and the fight where the arena degrades while the player is
 * standing in it.
 *
 * It never chases. `orbitPoint` walks it round a circuit about the spot it
 * spawned on, slowly, and it sheds hay bales out the back as it goes
 * (`dropProp`, the terrain counterpart to `summon` — see
 * `sim/enemy/definition.ts`). The bales are real destructible props on the
 * `Obstacle` layer, exactly like an authored barrel: they block the player's
 * shots as well as the Ladewagen's own exhaust, and they do not go away on
 * their own. So the room fills up with cover that is useful at first — a wall
 * to duck behind — and is eventually a maze the player built themselves by
 * not killing the thing fast enough.
 *
 * The one idea is **a soft timer made of geometry**. It is a DPS check that
 * never says the words: nothing counts down, nothing enrages, no number
 * changes. What happens is that the lanes get narrower, the shots the player
 * needs to land start clipping hay, and the fight they could have had two
 * cycles ago is no longer available. That is the honest floor-2 counterpart
 * to floor 1's target-priority fight (#276's Der Rattenkönig), and it is a
 * different question from anything the floor's ordinary rooms ask.
 *
 * ## Deliberately not a charge
 *
 * Der Stier is the floor's boss and charge-and-stun is his signature (#38); a
 * mini-boss that charges would make the boss fight read as a repeat rather
 * than an escalation. This one is the opposite motion in every respect — it
 * ignores the player entirely and drives its own circle — which is also why
 * the Maibaum-Dieb was off limits (#199: he is Der Stier's phase two).
 *
 * ## Numbers
 *
 * `health` 28, tuned in `tests/content/boss-pacing.test.ts` against the real
 * fight the way `docs/DECISIONS.md` #66 asks: several `haul`/`unload` cycles
 * at base 3 DPS, and dead well before Der Stier's own fight ends. It reads
 * tanky rather than being tanky — the slow circuit and the `mid` body's mass
 * do that work, not a pool that outlasts the boss.
 *
 * The exhaust cough is the roster Traktor's (#37), unchanged in kind and
 * slower in rate. It is there so the room still has something in the air
 * between bales; it is not the threat, and it will happily chew a hole in the
 * Ladewagen's own hay if it is left running long enough, which is a fair
 * trade the player can notice and use.
 *
 * `bossBar: true` — one body, one bar. The bales carry no health bar and no
 * room lock: they are terrain, and a bar that crept upward every time a bale
 * dropped would read as the fight going backwards for standing still.
 */
export const derLadewagen: EnemyDefinition = {
  id: 'der-ladewagen',
  name: 'Der Ladewagen',
  size: 'mid',
  // A machine stopping, not a body — the same call the roster Traktor makes.
  deathEffect: 'ember',
  health: 28,
  contactDamage: 2,
  // Heavier than the Traktor it is a bigger version of: a loaded trailer a
  // player's own bump could nudge off its circuit would stop reading as one.
  mass: 34,
  bossBar: true,
  initial: 'haul',
  states: [
    {
      // The circuit. `radius` is picked against the arena rather than by feel:
      // 40px around a room-centre spawn keeps the whole loop inside
      // `dorf-miniboss`'s 15x9 floor with a body-length to spare on the short
      // axis, so the trail of bales lays down as a ring the player can still
      // get inside and outside of, rather than a line pressed against a wall.
      name: 'haul',
      behaviours: [
        { behaviour: 'orbitPoint', speed: 0.38, radius: 40, clockwise: true },
        {
          behaviour: 'dropProp',
          propKind: 'bale',
          everyTicks: 110,
          // The fairness cap, and the whole reason the room degrades instead
          // of sealing: ten bales of hay is about half the circumference of
          // the circuit, so the ring it lays is always something to get
          // through rather than a wall to be trapped behind.
          maxActive: 10,
          health: 6,
          radius: 7,
          // Far enough back that the machine is clear of its own bale before
          // the circuit curves it round again. At a body-length (the
          // primitive's default) the Ladewagen drove straight into the hay it
          // had just shed and spent the fight jammed against it — the bale is
          // solid to everything, its own tractor included.
          behind: 26,
        },
        {
          behaviour: 'fireBurst',
          shots: 3,
          gapTicks: 9,
          everyTicks: 84,
          speed: 0.6,
          damage: 1,
          lifetimeTicks: 44,
          radius: 5,
        },
      ],
      transitions: [{ to: 'unload', after: 300 }],
    },
    {
      // The readable "it is getting worse" beat, the same shape Der
      // Rattenkönig's `screech` has: telegraphed, short, and it does more of
      // the one thing the fight is about. It revs and runs its lap rather
      // than stopping — a dumping run, not a charge (it never leaves the
      // circuit and never aims at the player, which is what keeps Der
      // Stier's signature his). Speed matters mechanically as well as for
      // feel: a bale cannot land inside another one, so a *slow* dump would
      // pile four drops into one bale's worth of hay. At this speed the
      // drops land a bale-and-a-bit apart and the beat lays an arc.
      name: 'unload',
      behaviours: [
        { behaviour: 'orbitPoint', speed: 0.95, radius: 40, clockwise: true },
        { behaviour: 'telegraph', ticks: 26 },
        {
          behaviour: 'dropProp',
          propKind: 'bale',
          everyTicks: 30,
          maxActive: 10,
          health: 6,
          radius: 7,
          behind: 26,
        },
      ],
      transitions: [{ to: 'haul', after: 120 }],
    },
  ],
};
