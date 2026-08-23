import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Zapfhahn — a tap in the wall that sprays a cone of foam.
 *
 * The first enemy in the game that shoots, and therefore the first one whose
 * telegraph has to actually work: it winds up for half a second before every
 * fan, and the whole exchange is the player reading that ring and stepping out
 * of the cone. If the telegraph is not legible this enemy is unfair, which is
 * why `enemy.telegraphScale` is a tuning knob rather than a constant.
 */
export const zapfhahn: EnemyDefinition = {
  id: 'zapfhahn',
  name: 'Zapfhahn',
  size: 'normal',
  health: 3,
  // It is fixed to the wall. Touching it is rude, not dangerous.
  contactDamage: 0,
  mass: 20,
  initial: 'idle',
  states: [
    {
      name: 'idle',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'wind', whenPlayerWithin: 110 }],
    },
    {
      name: 'wind',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 30 }],
      transitions: [{ to: 'spray', after: 30 }],
    },
    {
      name: 'spray',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSpread',
          shots: 5,
          arc: 0.9,
          // One fan per visit to this state: the volley leaves on the tick the
          // state begins, and the state is over well before the next one is due.
          everyTicks: 60,
          speed: 1.6,
          damage: 1,
          lifetimeTicks: 60,
        },
      ],
      transitions: [{ to: 'idle', after: 14 }],
    },
  ],
};
