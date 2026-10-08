import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * The First Human (#437) — Floor 4's boss. Placeholder state machine: the
 * stalk-and-sweep loop is built out in its own change with the `fireSweep`
 * primitive; this stands in so the arena compiles.
 */
export const theFirstHuman: EnemyDefinition = {
  id: 'the-first-human',
  name: 'The First Human',
  size: 'boss',
  deathEffect: 'dust',
  health: 300,
  contactDamage: 1,
  bossBar: true,
  title: 'enemies.the-first-human.title',
  epithet: 'enemies.the-first-human.epithet',
  initial: 'stalk',
  states: [
    {
      name: 'stalk',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.45 }],
      transitions: [{ to: 'windup', after: 90 }],
    },
    {
      name: 'windup',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 40 }],
      transitions: [{ to: 'swing', after: 40 }],
    },
    {
      name: 'swing',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSpread',
          shots: 9,
          arc: 2.2,
          everyTicks: 999,
          speed: 1.4,
          damage: 1,
          lifetimeTicks: 160,
          radius: 4,
        },
      ],
      transitions: [{ to: 'stalk', after: 40 }],
    },
  ],
};
