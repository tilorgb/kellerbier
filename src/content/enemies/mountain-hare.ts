import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Mountain hare (#40, `docs/CONTENT_BIBLE.md`'s Floor 4 roster; English name,
 * pitched as written) — the Kaninchen upgraded.
 *
 * Everything the Kaninchen does it still does: it hops at random along the four
 * axes, and bites from a pawn's capture square. It adds a second way to be
 * threatened on a line: when Alois stands on one of its four axes it flattens
 * its ears (the telegraph) and fires one small laser along that axis, toward
 * him — a rook's file to the pawn's diagonal. A hare you can see is a hare you
 * can be on the line of, so the dodge is the same one the Boar taught: do not
 * stand on its axes, and now not on its diagonals either.
 */
export const mountainHare: EnemyDefinition = {
  id: 'mountain-hare',
  name: 'Mountain hare',
  size: 'mini',
  deathEffect: 'dust',
  // Side-on art: turns to face the way it hops, and the player it winds up at.
  facing: 'mirror',
  health: 3,
  contactDamage: 1,
  lootTier: 'weak',
  initial: 'hop',
  states: [
    {
      name: 'hop',
      behaviours: [{ behaviour: 'hopCardinal', hopDistance: 16, hopTicks: 10, restTicks: 30 }],
      transitions: [
        { to: 'windup', whenPlayerDiagonalAdjacent: { distance: 16, tolerance: 6 } },
        { to: 'flatten', whenPlayerOnAxis: { tolerance: 7 } },
      ],
    },
    {
      name: 'windup',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 10 }],
      transitions: [{ to: 'strike', after: 10 }],
    },
    {
      name: 'strike',
      behaviours: [{ behaviour: 'chargeAtPlayer', speed: 2.2, snap: 'diagonal', maxDistance: 26 }],
      transitions: [
        { to: 'hop', onBlocked: true },
        { to: 'hop', after: 14 },
      ],
    },
    {
      name: 'flatten',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 24 }],
      transitions: [{ to: 'zap', after: 24 }],
    },
    {
      name: 'zap',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireBeam',
          mode: 'axis',
          beamTicks: 10,
          halfWidth: 2.5,
          damage: 1,
          height: 3,
        },
      ],
      transitions: [{ to: 'rest', after: 14 }],
    },
    {
      name: 'rest',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'hop', after: 90 }],
    },
  ],
};
