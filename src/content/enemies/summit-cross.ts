import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Summit cross (#40, `docs/CONTENT_BIBLE.md`'s Floor 4 roster; English name,
 * pitched as written) — a rooted mountaintop cross that fires a big laser along
 * its whole row when the player crosses it.
 *
 * It waits. The moment Alois crosses its horizontal line (`whenPlayerCrossesRow`,
 * from either side) it loads: the crossbars charge for `LOAD` ticks, which is
 * the telegraph — the line it is about to light is drawn on the snow — and
 * then a big laser (two half-Maß) lights the full row, both ways, until a wall
 * or a boulder stops it. Then it rests, and only a crossing after the rest
 * wakes it again. The answer is to cross where you can leave the line before
 * it lights, or to cross behind a boulder.
 */

/** Ticks the crossbars charge: long enough to leave a row from the middle of it. */
const LOAD = 40;
const BEAM_TICKS = 14;
const REST = 150;

export const summitCross: EnemyDefinition = {
  id: 'summit-cross',
  remains: 'wood',
  name: 'Summit cross',
  size: 'mid',
  deathEffect: 'dust',
  rooted: true,
  health: 14,
  contactDamage: 0,
  lootTier: 'normal',
  initial: 'wait',
  states: [
    {
      name: 'wait',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'load', whenPlayerCrossesRow: true }],
    },
    {
      name: 'load',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: LOAD }],
      transitions: [{ to: 'fire', after: LOAD }],
    },
    {
      name: 'fire',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireBeam',
          mode: 'row',
          beamTicks: BEAM_TICKS,
          halfWidth: 4,
          damage: 2,
          // Out of the crossbar, not the foot of the cross.
          height: 14,
        },
      ],
      transitions: [{ to: 'rest', after: BEAM_TICKS + 4 }],
    },
    {
      name: 'rest',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'wait', after: REST }],
    },
  ],
};
