import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Bierratte — fast, erratic, one hit point.
 *
 * Written second, and written to prove a point: nothing in the engine was
 * touched to add it. It is the same twelve primitives the Kellerassel is built
 * from, arranged differently.
 *
 * Its one idea is leading your shots. It scurries in changing directions while
 * it is far away, which is impossible to hit by aiming at where it is, and
 * commits to a straight run once it is close, which is the moment it can be
 * punished.
 */
export const bierratte: EnemyDefinition = {
  id: 'bierratte',
  name: 'Bierratte',
  size: 'mini',
  health: 1,
  contactDamage: 1,
  initial: 'scurry',
  states: [
    {
      name: 'scurry',
      behaviours: [{ behaviour: 'wander', speed: 1.1, turnEveryTicks: 14 }],
      transitions: [{ to: 'rush', whenPlayerWithin: 45 }],
    },
    {
      name: 'rush',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 1.5 }],
      // Hysteresis on purpose: the same distance for both directions makes a
      // rat on the boundary flicker between states once a tick.
      transitions: [{ to: 'scurry', whenPlayerBeyond: 75 }],
    },
  ],
};
