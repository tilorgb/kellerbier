import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Gockel — rooster (`docs/CONTENT_BIBLE.md`'s Floor 2 roster).
 *
 * Aggressive, dashes in short hops, "wakes the room when it crows." What
 * "wakes the room" means here, honestly: the crow is not a cross-enemy alert
 * — nothing in the engine tracks a dormant/alerted state for a body to be
 * woken into, and giving every enemy on every floor a sleep state it did not
 * have before is a bigger change than one Floor 2 bird earns. Instead the
 * crow is `fireSpread` with a full circle's arc — a ring of weak shots that
 * reaches every corner of a typical room in one burst, unlike anything else
 * in the roster, which is the sense in which it changes the room when it
 * fires. A real cross-enemy wake mechanic, if the room-scale version above
 * is not enough, is a follow-up rather than something to bolt onto this file.
 */
export const gockel: EnemyDefinition = {
  id: 'gockel',
  name: 'Gockel',
  size: 'normal',
  // Feathers read closer to dust than to beer.
  deathEffect: 'dust',
  health: 2,
  contactDamage: 1,
  initial: 'roost',
  states: [
    {
      name: 'roost',
      behaviours: [{ behaviour: 'wander', speed: 0.6, turnEveryTicks: 18 }],
      transitions: [{ to: 'telegraph', whenPlayerWithin: 85 }],
    },
    {
      name: 'telegraph',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 16 }],
      transitions: [{ to: 'crow', after: 16 }],
    },
    {
      name: 'crow',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSpread',
          shots: 10,
          // A full circle: (2 * Math.PI), written as a literal — content
          // imports types only (tools/eslint/architecture.js), never values.
          arc: 6.283185307179586,
          everyTicks: 60,
          speed: 1.1,
          damage: 1,
          lifetimeTicks: 45,
        },
      ],
      transitions: [{ to: 'hop', after: 10 }],
    },
    {
      name: 'hop',
      behaviours: [{ behaviour: 'chargeAtPlayer', speed: 1.8 }],
      transitions: [
        { to: 'roost', onBlocked: true },
        { to: 'roost', after: 12 },
      ],
    },
  ],
};
