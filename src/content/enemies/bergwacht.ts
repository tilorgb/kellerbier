import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Bergwacht — mountain rescue (#40, `docs/CONTENT_BIBLE.md`'s Floor 4
 * roster: "fires a flare that illuminates and marks you for others").
 *
 * The one idea is *being seen*. The rescuer keeps their distance — closing
 * when the player is far, backing off when they are near — and now and then
 * raises the pistol (`telegraph`) and fires a slow, bright flare at where the
 * player stood (`fireAtPlayer` with `mark`). A flare barely hurts; what it
 * does is mark the player: for the mark's duration every enemy in the room
 * sees them through cover and fires faster (`ProjectileTag.Marking`,
 * `tuning.projectileTags.playerMarkDurationTicks`). Alone it is a nuisance.
 * Behind a Sennerin and a shoal of Kuhglocken it is what turns a room from a
 * fight into a hunt — which is why the roster prices it like a support body
 * and places it rarely.
 */
export const bergwacht: EnemyDefinition = {
  id: 'bergwacht',
  name: 'Bergwacht',
  size: 'normal',
  health: 4,
  contactDamage: 1,
  lootTier: 'normal',
  initial: 'patrol',
  states: [
    {
      name: 'patrol',
      behaviours: [{ behaviour: 'wander', speed: 0.5, turnEveryTicks: 35 }],
      transitions: [
        { to: 'aim', whenPlayerWithin: 120 },
        { to: 'approach', whenPlayerBeyond: 120 },
      ],
    },
    {
      name: 'approach',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 0.9 }],
      transitions: [{ to: 'aim', whenPlayerWithin: 110 }],
    },
    {
      name: 'retreat',
      behaviours: [{ behaviour: 'fleeFromPlayer', speed: 1.1 }],
      transitions: [
        { to: 'aim', whenPlayerBeyond: 70 },
        { to: 'aim', after: 70 },
      ],
    },
    {
      name: 'aim',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 45 }],
      transitions: [{ to: 'flare', after: 45 }],
    },
    {
      name: 'flare',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 999,
          speed: 1.1,
          damage: 1,
          lifetimeTicks: 130,
          radius: 4,
          art: 'flare',
          mark: true,
        },
      ],
      transitions: [
        { to: 'retreat', whenPlayerWithin: 50 },
        { to: 'patrol', after: 90 },
      ],
    },
  ],
};
