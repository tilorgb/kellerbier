import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Rescue dog (#40, `docs/CONTENT_BIBLE.md`'s Floor 4 roster; English name,
 * pitched as written) — a small dog that searches the snow for lost people and
 * has, apparently, found Alois.
 *
 * It nosing about at random, then runs up to him, sits down in range, barks —
 * the bark is one snow clod thrown at where he was when it sat — and runs off
 * again in a random direction for a while before it comes back. An annoyance,
 * not a threat: small, two hits, one weak shot a cycle (about six seconds), and
 * the moment it sits is the moment it can be shot.
 */
export const rescueDog: EnemyDefinition = {
  id: 'rescue-dog',
  name: 'Rescue dog',
  size: 'mini',
  deathEffect: 'dust',
  // Side-on art: faces the way it runs, and toward whom it is about to bark.
  facing: 'mirror',
  health: 2,
  contactDamage: 1,
  lootTier: 'weak',
  initial: 'search',
  states: [
    {
      name: 'search',
      behaviours: [{ behaviour: 'wander', speed: 0.9, turnEveryTicks: 45 }],
      transitions: [{ to: 'run', after: { min: 50, max: 130 } }],
    },
    {
      name: 'run',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 1.9 }],
      transitions: [
        { to: 'sit', whenPlayerWithin: 52 },
        // Cut off by a boulder, or just not getting anywhere: nose about again.
        { to: 'search', after: 160 },
      ],
    },
    {
      name: 'sit',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 26 }],
      transitions: [{ to: 'bark', after: 26 }],
    },
    {
      name: 'bark',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 999,
          speed: 1.2,
          damage: 1,
          lifetimeTicks: 120,
          radius: 3,
          art: 'snow-clod',
        },
      ],
      transitions: [{ to: 'flee', after: 16 }],
    },
    {
      name: 'flee',
      behaviours: [{ behaviour: 'wander', speed: 1.8, turnEveryTicks: 25 }],
      transitions: [{ to: 'search', after: { min: 90, max: 150 } }],
    },
  ],
};
