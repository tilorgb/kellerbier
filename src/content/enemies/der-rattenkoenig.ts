import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Der Rattenkönig (#276) — Der Keller's second mini-boss, and the one that
 * needed the engine to grow a primitive: `summon` (`sim/enemy/definition.ts`),
 * the live-body counterpart to `splitOnDeath`.
 *
 * He sits in the middle of the arena and does not chase (`pause` throughout).
 * The one idea is **target priority**: the room is survivable indefinitely and
 * unwinnable until the player stops shooting the nearest Bierratte and starts
 * shooting the thing producing them. Built from the Bierratte the floor already
 * taught (#228's "lead your shots" enemy) plus the spawner, and it directly
 * rehearses Die Große Kellerassel's phase-two split — a crowd of small things
 * you have to pick a target out of.
 *
 * `throne` spawns one rat every ~2s, capped at four alive at once
 * (`maxActive` — the whole fairness knob, per the primitive's doc comment: the
 * pressure plateaus instead of compounding into an unclearable screen). Every
 * ~6s he drops into `screech`, a telegraphed beat that spawns a short fast
 * burst — the readable "it is getting worse" tell, and the moment that should
 * make a new player realise the rats are not the problem.
 *
 * `health` (16) is deliberately low and tuned in `tests/content/boss-pacing.
 * test.ts` the way `docs/DECISIONS.md` #66 asks — against the real fight: a
 * player who targets him correctly ends it quickly, and it ends well before Die
 * Große Kellerassel's would. He is floor 1, the tutorial, so he must be
 * beatable by someone who has never played the genre; the wave rate is what
 * keeps that true.
 *
 * `bossBar: true` — his health feeds the top bar. His summoned Bierratten do
 * *not* (they `locksRoom` like any add, but a bar that jumped up every time a
 * rat spawned would read as losing ground for doing the right thing).
 */
export const derRattenkoenig: EnemyDefinition = {
  id: 'der-rattenkoenig',
  name: 'Der Rattenkönig',
  size: 'mid',
  health: 16,
  contactDamage: 1,
  // Enthroned. Nothing shoves the nest.
  mass: 30,
  bossBar: true,
  initial: 'throne',
  states: [
    {
      name: 'throne',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'summon',
          enemyId: 'bierratte',
          everyTicks: 120,
          countPerWave: 1,
          maxActive: 4,
          spread: 22,
        },
      ],
      transitions: [{ to: 'screech', after: 360 }],
    },
    {
      // The telegraphed ramp: a short window of fast spawning, capped one
      // higher than `throne`'s so it can actually add pressure, behind a
      // `telegraph` ring so the player is shown it coming.
      name: 'screech',
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'telegraph', ticks: 24 },
        {
          behaviour: 'summon',
          enemyId: 'bierratte',
          everyTicks: 18,
          countPerWave: 1,
          maxActive: 5,
          spread: 26,
        },
      ],
      transitions: [{ to: 'throne', after: 72 }],
    },
  ],
};
