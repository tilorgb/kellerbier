import type { ItemDefinition } from '../../sim/item/definition.js';

/** Half-Wurst healed for a room cleared without taking a hit. */
const CLEAN_CLEAR_HEAL = 2;
const RANGE_MULTIPLIER = 0.85;

/**
 * Zwetschgendatschi — the plum sheet cake, with raisins nobody asked for.
 * Clear a room without being hit and it pays you back; the raisins sit
 * heavy, so shots do not carry as far.
 *
 * `state.timer`, not `state.charge`, holds the "have I been hit in this
 * room" flag: `charge` is the Rosinenklauber's suppression flag on every
 * `rosinen` item (`der-rosinenklauber.ts`), so a `rosinen` item that needs a
 * counter of its own has exactly one field left, and this is it.
 *
 * The flag is cleared on the room-clear itself rather than on room *entry*:
 * there is no `onRoomEnter` hook, and clearing it at the moment the reward
 * resolves gives every room the same fresh start without one.
 */
export const zwetschgendatschi: ItemDefinition = {
  id: 'zwetschgendatschi',
  name: 'Zwetschgendatschi',
  description: 'Clearing a room without being hit heals 1. Range -15%',
  flavourText: 'The plums are the point. The raisins are an opinion.',
  sprite: 'zwetschgendatschi',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  tags: ['rosinen'],
  status: (ctx) => (ctx.state.timer > 0 ? 'hit — no cake' : 'clean'),
  hooks: {
    modifyStats: (state) =>
      state.charge > 0 ? [] : [{ stat: 'range', op: 'multiply', value: RANGE_MULTIPLIER }],
    onDamageTaken: (ctx) => {
      ctx.state.timer = 1;
    },
    onRoomClear: (ctx) => {
      if (ctx.state.timer === 0) {
        ctx.sim.addPlayerHealth(CLEAN_CLEAR_HEAL);
      }
      ctx.state.timer = 0;
    },
  },
};
