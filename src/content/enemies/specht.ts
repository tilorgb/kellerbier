import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Specht — a woodpecker (#411, `docs/CONTENT_BIBLE.md`'s Floor 3 roster).
 *
 * It perches on the room's wall (`returnToPerch`, which also puts it there at
 * spawn) and waits a random while. Then it drums — hammering on the wall,
 * wood chips flying, a drumroll you can hear (`telegraphLook: 'drum'`) — and
 * dives straight at where the player stood as the drumming stopped
 * (`chargeAtPlayer` with `untilTargetPoint`): any angle, the one body on the
 * floor not held to the axes. The drumming marks where it will land, not the
 * way it will fly: a circle on the floor that follows the player until the
 * dive begins, then stays put. That circle is the only thing that hurts —
 * the beak hitting the floor (`landing`); touching the bird itself does
 * nothing (`contactDamage: 0`). Its beak sticks where it lands (`land`) —
 * the hit window a clean dodge earns — and then it flies back to the
 * nearest wall and starts over.
 *
 * It flies (`flying`): logs, the Waldbach and the Borkenkäfer's pits are no
 * obstacle, only the room's walls are. A dive that meets a wall before its
 * point stops there and sticks just the same.
 */
export const specht: EnemyDefinition = {
  id: 'specht',
  name: 'Specht',
  size: 'mini',
  // A bird comes apart as a puff of feathers, which the dust reads as.
  deathEffect: 'dust',
  health: 4,
  // The landing is the attack; the bird itself is harmless to touch.
  contactDamage: 0,
  lootTier: 'normal',
  flying: true,
  telegraphLook: 'drum',
  initial: 'perch',
  states: [
    {
      name: 'perch',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'drum', after: { min: 60, max: 150 } }],
    },
    {
      name: 'drum',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 50 }],
      transitions: [{ to: 'dive', after: 50 }],
    },
    {
      name: 'dive',
      behaviours: [
        {
          behaviour: 'chargeAtPlayer',
          speed: 3.6,
          untilTargetPoint: true,
          landing: { radius: 10, damage: 1 },
        },
      ],
      transitions: [
        { to: 'stuck', onArrived: true },
        { to: 'stuck', onBlocked: true },
        // A dive always meets its point or a wall; this is only the floor under it.
        { to: 'stuck', after: 120 },
      ],
    },
    {
      name: 'stuck',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'land' }],
      transitions: [{ to: 'return', after: 55 }],
    },
    {
      name: 'return',
      behaviours: [{ behaviour: 'returnToPerch', speed: 1.4 }],
      transitions: [
        { to: 'perch', onArrived: true },
        { to: 'perch', after: 400 },
      ],
    },
  ],
};
