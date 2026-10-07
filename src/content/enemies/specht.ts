import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Specht — a woodpecker (#411, `docs/CONTENT_BIBLE.md`'s Floor 3 roster).
 *
 * It perches on the room's wall (`returnToPerch`, which also puts it there at
 * spawn) and waits a random while. Then it takes off and flies small wavy
 * loops about a point drifting slowly through the room (`flyLoops`) — not
 * after the player: a player keeping their distance just watches it circle,
 * and after a while it goes back to a wall and starts over.
 *
 * Only a player who comes within `STRIKE_RANGE` of it gets the attack. It
 * stops in the air and drums (`telegraphLook: 'drum'`, a drumroll you can
 * hear), and dives at where the player stood as the drumming stopped
 * (`chargeAtPlayer` with `untilTargetPoint`): any angle, the one body on the
 * floor not held to the axes, and never further than the player could get in
 * the wind-up. The drumming marks where it will land, not the way it will
 * fly: a circle on the floor that follows the player until the dive begins,
 * then stays put. That circle is the only thing that hurts — the beak hitting
 * the floor (`landing`); touching the bird itself does nothing
 * (`contactDamage: 0`). Its beak sticks where it lands (`land`) — the hit
 * window a clean dodge earns — and then it flies back to the nearest wall.
 *
 * It flies (`flying`): logs, the Waldbach and the Borkenkäfer's pits are no
 * obstacle, only the room's walls are. A dive that meets a wall before its
 * point stops there and sticks just the same.
 */

/** Room units from the bird within which the player draws its dive. */
const STRIKE_RANGE = 72;

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
  // Rooted (in the ground, the stream, on the wall): shots do not push it.
  rooted: true,
  telegraphLook: 'drum',
  // Side-view art: faces the way it flies, and the player while it sits.
  facing: 'mirror',
  initial: 'perch',
  states: [
    {
      name: 'perch',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'takeoff', after: { min: 60, max: 150 } }],
    },
    {
      // A short flight it always makes before it may strike, so a player
      // standing under its wall does not get dived on straight off the perch.
      name: 'takeoff',
      behaviours: [{ behaviour: 'flyLoops', speed: 1.1, radius: 12, wobble: 4, drift: 0.3 }],
      transitions: [{ to: 'circle', after: 45 }],
    },
    {
      name: 'circle',
      behaviours: [{ behaviour: 'flyLoops', speed: 1.1, radius: 12, wobble: 4, drift: 0.3 }],
      transitions: [
        { to: 'drum', whenPlayerWithin: STRIKE_RANGE },
        // Nobody came near: back to a wall, and round again.
        { to: 'return', after: { min: 360, max: 540 } },
      ],
    },
    {
      name: 'drum',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 40 }],
      transitions: [{ to: 'dive', after: 40 }],
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
