import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Snow cannon (#40, `docs/CONTENT_BIBLE.md`'s Floor 4 roster; English name,
 * pitched as written) — a rooted cannon that lobs one big, slow snowball at
 * where the player stood when it started winding up.
 *
 * A direct hit is double damage and freezes Alois (all but rooted for 0.7 s,
 * he can still shoot). Wherever the ball ends — on him, on a wall, on a
 * boulder, or at the end of its flight — it bursts into four plain clods that
 * deal one half-Maß and freeze too. So the ball is dodged by stepping out of
 * its line, and the burst is dodged by not standing next to where it ends.
 * It fires only at a player in range, one ball at a time.
 */
export const snowCannon: EnemyDefinition = {
  id: 'snow-cannon',
  name: 'Snow cannon',
  size: 'mid',
  deathEffect: 'dust',
  rooted: true,
  health: 16,
  contactDamage: 0,
  lootTier: 'normal',
  initial: 'idle',
  states: [
    {
      name: 'idle',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'aim', whenPlayerWithin: 190 }],
    },
    {
      name: 'aim',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 44 }],
      transitions: [{ to: 'fire', after: 44 }],
    },
    {
      name: 'fire',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 999,
          speed: 0.9,
          damage: 2,
          lifetimeTicks: 300,
          radius: 7,
          art: 'snow-clod',
          freeze: true,
          burst: true,
        },
      ],
      transitions: [{ to: 'idle', after: 150 }],
    },
  ],
};
