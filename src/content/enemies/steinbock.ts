import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Steinbock — an ibex (#40, `docs/CONTENT_BIBLE.md`'s Floor 4 roster:
 * "charges and can climb over obstacles").
 *
 * Floor 2's Kuh taught the charge-and-punish loop and Floor 3's Boar held it
 * to the axes; the Steinbock takes the Boar's charge and takes away the one
 * answer a player has learnt for it — cover. Its charge `climbsBlocks`: a
 * boulder in the line is bounded over, not stopped at, so standing behind a
 * rock does not stop the ibex, only a wall does. The wind-up is long enough
 * to read (the floor is about committing to a line on ice, and so is this),
 * and the charge itself is straight at where the player stood when the
 * pawing began (`updateAimLock`), so stepping aside is the dodge.
 *
 * Lower contact damage than the Boar, no door-smashing: the idea is "cover
 * is not safe", one idea only, and the impact carries it. `mass` keeps a
 * player's bump from shoving a charging ibex off its line.
 */
export const steinbock: EnemyDefinition = {
  id: 'steinbock',
  name: 'Steinbock',
  size: 'mid',
  deathEffect: 'dust',
  // Side-on art: faces the way it runs, and the player it winds up at.
  facing: 'mirror',
  health: 8,
  contactDamage: 1,
  mass: 9,
  lootTier: 'tough',
  initial: 'graze',
  states: [
    {
      name: 'graze',
      behaviours: [{ behaviour: 'wander', speed: 0.4, turnEveryTicks: 60 }],
      transitions: [{ to: 'paw', whenPlayerWithin: 110 }],
    },
    {
      name: 'paw',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 40 }],
      transitions: [{ to: 'bound', after: 40 }],
    },
    {
      name: 'bound',
      behaviours: [
        {
          behaviour: 'chargeAtPlayer',
          speed: 3,
          climbsBlocks: true,
          impact: {
            bodyDamageMultiplier: 2,
            knockback: 4,
            breaksBlocks: false,
            breaksDoors: false,
          },
        },
      ],
      transitions: [
        { to: 'stand', onBlocked: true },
        // A charge always meets a wall; this is only the floor under it.
        { to: 'stand', after: 200 },
      ],
    },
    {
      name: 'stand',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'graze', after: 55 }],
    },
  ],
};
