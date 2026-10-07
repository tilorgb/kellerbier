import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Bachforelle — a brown trout that lives in the Waldbach (#408,
 * `docs/CONTENT_BIBLE.md`'s Floor 3 roster).
 *
 * Most of the time all the player sees is its shadow gliding along the
 * stream (`swimInZone`, `submerge`): nothing can touch it, and shots pass over
 * the water as if it is not there. At a random moment it breaks the surface
 * (`after: { min, max }`), waits long enough to be read and shot, fires four
 * shots, one down each diagonal (`fireRing`), lingers a moment, and dives.
 *
 * It never leaves the water — placed in its stream at spawn, kept there
 * every tick — and only rooms with a Waldbach may spawn it, which the content
 * suite holds authored rooms to. When it is the last enemy in the room it does
 * nothing special: the player waits for the next surface, same as ever.
 */
export const bachforelle: EnemyDefinition = {
  id: 'bachforelle',
  name: 'Bachforelle',
  // `mini`, not the issue's starting `normal`: the body a player can hit is
  // the head half out of the water (14 pixels across), and a `normal`
  // collider is twice that — a hitbox reaching past the fish it belongs to.
  size: 'mini',
  // Water — the splash every beer death throws is the right one for a fish.
  deathEffect: 'splash',
  health: 4,
  contactDamage: 1,
  initial: 'swim',
  states: [
    {
      name: 'swim',
      behaviours: [
        { behaviour: 'swimInZone', zone: 'waldbach', speed: 0.6 },
        { behaviour: 'submerge' },
      ],
      transitions: [{ to: 'surface', after: { min: 90, max: 240 } }],
    },
    {
      name: 'surface',
      // Out of the water and hittable for the whole wind-up: half a second
      // to see it, step off its diagonals, and get a shot in.
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 30 }],
      transitions: [{ to: 'fire', after: 30 }],
    },
    {
      name: 'fire',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireRing',
          shots: 4,
          angleOffset: Math.PI / 4,
          everyTicks: 999,
          speed: 1.6,
          damage: 1,
          lifetimeTicks: 120,
        },
      ],
      transitions: [{ to: 'linger', after: 1 }],
    },
    {
      name: 'linger',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'swim', after: 25 }],
    },
  ],
};
