import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * The Wirtshaus shopkeeper. Stands behind the counter, sells nothing by
 * force, and reacts if shot.
 *
 * Deliberately built on the same state-machine primitives every other enemy
 * uses rather than a bespoke "NPC" system: `peaceful` is inert (no movement,
 * no contact damage, no firing) until the first hit flips it to `angry`,
 * which fires back. That single `onHit` transition is the whole of "shooting
 * the shopkeeper has a consequence" (#23) — no separate reaction system to
 * keep in sync with the one every enemy already has.
 *
 * `locksRoom: false` is what keeps the shop browsable: without it, being an
 * ordinary `enemySpawns` entry would count it into `GameSim.roomEnemyCount`
 * from the moment the room loads and seal the doors on a shopkeeper nobody
 * has provoked. With it, a peaceful (or angered, or dead) shopkeeper never
 * affects the door lock at all — shooting it gets you gunfire, not a
 * mandatory fight to leave.
 */
export const shopkeeper: EnemyDefinition = {
  id: 'shopkeeper',
  name: 'Wirt',
  size: 'normal',
  health: 6,
  // Bumping into the counter is not the insult; shooting at it is.
  contactDamage: 0,
  mass: 30,
  initial: 'peaceful',
  lootTier: 'weak',
  locksRoom: false,
  states: [
    {
      name: 'peaceful',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'angry', onHit: true }],
    },
    {
      name: 'angry',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 50,
          speed: 1.8,
          damage: 1,
          lifetimeTicks: 70,
        },
      ],
    },
  ],
};
