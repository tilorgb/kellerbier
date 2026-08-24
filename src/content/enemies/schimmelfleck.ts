import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Schimmelfleck — a mould patch that does not move and does not forgive.
 *
 * Its one idea is that killing it makes the room worse before it makes it
 * better. `splitOnDeath` sits on the state rather than on the enemy, so the
 * spores it leaves behind are a property of how it died — which is the same
 * machinery Die Große Kellerassel's second phase (#36) needs.
 */
export const schimmelfleck: EnemyDefinition = {
  id: 'schimmelfleck',
  name: 'Schimmelfleck',
  size: 'normal',
  health: 3,
  contactDamage: 1,
  // Heavier than its size class, because a body that cannot move must not be
  // shoved around the room by the player walking into it.
  mass: 12,
  initial: 'sit',
  states: [
    {
      name: 'sit',
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'splitOnDeath', into: 'schimmelspore', count: 2, spread: 7 },
      ],
    },
  ],
};

/** What is left behind. Slow, harmless to shoot at, unpleasant to ignore. */
export const schimmelspore: EnemyDefinition = {
  id: 'schimmelspore',
  name: 'Schimmelspore',
  size: 'mini',
  health: 1,
  contactDamage: 1,
  lootTier: 'weak',
  initial: 'creep',
  states: [
    {
      name: 'creep',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.4 }],
    },
  ],
};
