import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Skier (#40, `docs/CONTENT_BIBLE.md`'s Floor 4 roster; English name, pitched as
 * written) — fast, never after you, and unreadable on purpose.
 *
 * He zig-zags down the room like a piste (`slalom`: sharp turns every half second, a new
 * general direction every second or so) and never steers at Alois;
 * his body is no weapon (`contactDamage` 0 — he only shoves you aside as he
 * goes past). At random moments he stops with a hockey-stop: a short crouch with
 * a puff of snow on the side he is about to throw his skis to (the slight tell),
 * then the drift, which roughs up the snow and flings a fan of clods off *that
 * side* of the way he was travelling (`aimSide`) — nowhere near where you stand
 * unless you are standing in his line. You never know when, or which side.
 */

/** The crouch before the drift: a flicker of warning, not a countdown. */
const CROUCH = 14;
const DRIFT = 24;

export const skier: EnemyDefinition = {
  id: 'skier',
  name: 'Skier',
  size: 'normal',
  deathEffect: 'dust',
  // Side-on art: turns to face the way he is carving.
  facing: 'mirror',
  health: 5,
  contactDamage: 0,
  // Heavy and fast: whatever he passes through, he shoves.
  mass: 18,
  lootTier: 'normal',
  initial: 'carve',
  states: [
    {
      name: 'carve',
      behaviours: [{ behaviour: 'slalom', speed: 2.4, swing: 0.95, periodTicks: 30, legTicks: 75 }],
      transitions: [{ to: 'crouch', after: { min: 35, max: 105 } }],
    },
    {
      name: 'crouch',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: CROUCH }],
      transitions: [{ to: 'drift', after: CROUCH }],
    },
    {
      name: 'drift',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSpread',
          shots: 5,
          arc: 1.3,
          everyTicks: 999,
          aimSide: 'random',
          speed: 1.5,
          damage: 1,
          lifetimeTicks: 75,
          radius: 3,
          art: 'snow-clod',
        },
      ],
      transitions: [{ to: 'carve', after: DRIFT }],
    },
  ],
};
