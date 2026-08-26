import type { ItemDefinition } from '../../sim/item/definition.js';

/** Soul health granted for a room cleared without taking a hit. */
const REWARD_SOUL_HP = 1;

/**
 * Sankt Anzelm Klostersud — a monastery brew from `docs/CONTENT_BIBLE.md`
 * §0's invented Sankt Anzelm brand. A quiet blessing: clear a room without
 * taking damage and it grants a soul heart.
 *
 * `state.charge` is a per-room flag, not a stack count — set the instant any
 * damage lands (`onDamageTaken`) and read/reset at `onRoomClear`. Nothing
 * fires between one room's clear and the next room's first hit to disturb
 * it, so a plain 0/1 flag is enough; no separate "room started" hook exists
 * to reset it explicitly, so `onRoomClear` resets it for the room that is
 * about to start rather than the one that just ended.
 */
export const sanktAnzelmKlostersud: ItemDefinition = {
  id: 'sankt-anzelm-klostersud',
  name: 'Sankt Anzelm Klostersud',
  description: 'Clear a room without taking damage for a soul heart',
  flavourText: 'The monks will not say what is in it. The monks never do.',
  sprite: 'sankt-anzelm-klostersud',
  pools: ['shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onDamageTaken: (ctx) => {
      ctx.state.charge = 1;
    },
    onRoomClear: (ctx) => {
      const state = ctx.state;
      if (state.charge === 0) {
        ctx.sim.addSoulHealth(REWARD_SOUL_HP);
      }
      state.charge = 0;
    },
  },
};
