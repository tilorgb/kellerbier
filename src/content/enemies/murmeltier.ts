import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Murmeltier — a marmot (#40, `docs/CONTENT_BIBLE.md`'s Floor 4 roster:
 * "burrows, resurfaces under the player, whistles a warning first").
 *
 * The one idea is *the warning is the attack's address*. It sits up for a
 * moment, then goes under (`burrow`: untouchable, drawn as a moving mound,
 * crossing the room's rocks since it is beneath them). Under the snow it
 * waits, then **whistles** — a `telegraph` state, so the room hears it and
 * the wind-up ring shows where it is — and the whistle locks where the
 * player is standing (`updateAimLock`). It then tunnels straight to that
 * spot (`chargeAtPlayer` with `untilTargetPoint`, the Specht's dive on the
 * ground) and comes up there with a burst of snow clods (`landing`, then a
 * `fireRing`). Then it stands blinking in the open for a long moment, which
 * is the hit window a clean sidestep earns, before it goes under again.
 *
 * It never hurts to touch while surfaced (`contactDamage: 0`): the eruption
 * is the whole of its damage, and it lands where the whistle said it would.
 */
export const murmeltier: EnemyDefinition = {
  id: 'murmeltier',
  name: 'Murmeltier',
  size: 'normal',
  deathEffect: 'dust',
  facing: 'mirror',
  health: 5,
  contactDamage: 0,
  lootTier: 'normal',
  initial: 'sit',
  states: [
    {
      name: 'sit',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'dig', after: { min: 40, max: 90 } }],
    },
    {
      // Under the snow, drifting about, unhittable: the mound is what the
      // player tracks.
      name: 'dig',
      behaviours: [
        { behaviour: 'wander', speed: 0.6, turnEveryTicks: 40 },
        { behaviour: 'burrow' },
      ],
      transitions: [{ to: 'whistle', after: { min: 60, max: 120 } }],
    },
    {
      // The whistle: still under the snow, and the one moment the player's
      // position is read. Where they stand now is where it comes up.
      name: 'whistle',
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'telegraph', ticks: 36 },
        { behaviour: 'burrow' },
      ],
      transitions: [{ to: 'tunnel', after: 36 }],
    },
    {
      name: 'tunnel',
      behaviours: [
        {
          behaviour: 'chargeAtPlayer',
          speed: 2.2,
          untilTargetPoint: true,
          // Coming up under the player: the clods in the air are the ring
          // below; this is the ground heaving under their boots.
          landing: { radius: 11, damage: 1 },
        },
        { behaviour: 'burrow' },
      ],
      transitions: [
        { to: 'erupt', onArrived: true },
        { to: 'erupt', onBlocked: true },
        { to: 'erupt', after: 120 },
      ],
    },
    {
      name: 'erupt',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireRing',
          shots: 6,
          everyTicks: 999,
          speed: 1.3,
          damage: 1,
          lifetimeTicks: 50,
          radius: 3,
          art: 'snow-clod',
        },
      ],
      transitions: [{ to: 'blink', after: 8 }],
    },
    {
      // Up and in the open: the hit window.
      name: 'blink',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'dig', after: 75 }],
    },
  ],
};
