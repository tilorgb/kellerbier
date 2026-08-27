import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Bauer — farmer with a pitchfork (`docs/CONTENT_BIBLE.md`'s Floor 2 roster).
 *
 * Walks and lunges. The lunge is `chargeAtPlayer` behind a `telegraph`, the
 * same shape Zapfhahn's wind-up already teaches on Floor 1 — this is that
 * lesson applied to a body that closes distance first instead of standing
 * still, so the player has to read the telegraph while still moving.
 */
export const bauer: EnemyDefinition = {
  id: 'bauer',
  name: 'Bauer',
  size: 'normal',
  health: 3,
  contactDamage: 1,
  initial: 'plow',
  states: [
    {
      name: 'plow',
      behaviours: [{ behaviour: 'wander', speed: 0.5, turnEveryTicks: 30 }],
      transitions: [{ to: 'stalk', whenPlayerWithin: 100 }],
    },
    {
      name: 'stalk',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.7 }],
      transitions: [
        { to: 'telegraph', whenPlayerWithin: 44 },
        { to: 'plow', whenPlayerBeyond: 140 },
      ],
    },
    {
      name: 'telegraph',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 24 }],
      transitions: [{ to: 'lunge', after: 24 }],
    },
    {
      name: 'lunge',
      behaviours: [{ behaviour: 'chargeAtPlayer', speed: 2.2 }],
      transitions: [
        { to: 'stalk', onBlocked: true },
        { to: 'stalk', after: 20 },
      ],
    },
  ],
};
