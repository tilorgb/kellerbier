import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Sennerin — the dairymaid of the Alm (#40, `docs/CONTENT_BIBLE.md`'s Floor 4
 * roster: "throws cheese wheels that roll and ricochet").
 *
 * Floor 1's Zapfhahn and Floor 2's Bauer taught the aimed shot; the Sennerin
 * teaches that a shot can come *back*. She stands her ground, winds up
 * (`telegraph`) and rolls a wheel of cheese at where the player stood
 * (`fireAtPlayer` with `bounce`): big, slow, and it bounces off the walls and
 * off whatever it hits for `tuning.projectileTags.bounceMaxCount` bounces
 * before it stops. The second thing to dodge from one throw is the wheel
 * coming back off the wall behind you — and on ice, where the floor has
 * taken your braking away, that is the lesson the floor is about. She backs
 * off when crowded, since a wheel rolled at point-blank range is just a
 * contact hit.
 */
export const sennerin: EnemyDefinition = {
  id: 'sennerin',
  name: 'Sennerin',
  size: 'normal',
  health: 4,
  contactDamage: 1,
  lootTier: 'normal',
  initial: 'tend',
  states: [
    {
      name: 'tend',
      behaviours: [{ behaviour: 'wander', speed: 0.45, turnEveryTicks: 40 }],
      transitions: [{ to: 'heft', whenPlayerWithin: 130 }],
    },
    {
      name: 'heft',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 38 }],
      transitions: [{ to: 'roll', after: 38 }],
    },
    {
      name: 'roll',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 999,
          speed: 1.5,
          damage: 1,
          lifetimeTicks: 220,
          radius: 5,
          art: 'cheese-wheel',
          bounce: true,
        },
      ],
      transitions: [{ to: 'step', after: 20 }],
    },
    {
      // A step back if the player is close, else a breather, then the next wheel.
      name: 'step',
      behaviours: [{ behaviour: 'fleeFromPlayer', speed: 0.9 }],
      transitions: [
        { to: 'heft', whenPlayerBeyond: 60 },
        { to: 'heft', after: 60 },
      ],
    },
  ],
};
