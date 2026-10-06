import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Kaninchen — a rabbit that moves like a chess pawn (#407,
 * `docs/CONTENT_BIBLE.md`'s Floor 3 roster).
 *
 * It hops at random along the four axes (`hopCardinal`) and never seeks the
 * player. It attacks only from a pawn's capture square, one step away on a
 * diagonal (`whenPlayerDiagonalAdjacent`), and then only with a short diagonal
 * leap (`chargeAtPlayer` with `snap: 'diagonal'` and `maxDistance`). The
 * wind-up before it is the one warning, and its line points along the
 * diagonal it will take.
 *
 * Deliberately one of the easiest things on the floor: three hits, a short
 * reach, a long clear wind-up. The lesson is the pattern: never stand on its
 * diagonal, and it can never touch you.
 */
export const kaninchen: EnemyDefinition = {
  id: 'kaninchen',
  name: 'Kaninchen',
  size: 'mini',
  // An animal, like the Kuh and the Gockel.
  deathEffect: 'dust',
  health: 3,
  contactDamage: 1,
  lootTier: 'weak',
  initial: 'hop',
  states: [
    {
      name: 'hop',
      behaviours: [{ behaviour: 'hopCardinal', hopDistance: 16, hopTicks: 10, restTicks: 30 }],
      transitions: [{ to: 'windup', whenPlayerDiagonalAdjacent: { distance: 16, tolerance: 6 } }],
    },
    {
      name: 'windup',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 20 }],
      transitions: [{ to: 'strike', after: 20 }],
    },
    {
      name: 'strike',
      // 26 units along the diagonal covers the ~22.6 to the capture square
      // with a little to spare, then stops: a leap, not a charge.
      behaviours: [{ behaviour: 'chargeAtPlayer', speed: 2.2, snap: 'diagonal', maxDistance: 26 }],
      transitions: [
        { to: 'hop', onBlocked: true },
        { to: 'hop', after: 14 },
      ],
    },
  ],
};
