import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * The fixed cycle of buffs — see the file doc comment for why a cycle
 * rather than a real roll. Index order is itself arbitrary; only the length
 * (`BEHAVIOURS.length`, used for the wrap) matters mechanically.
 */
const BEHAVIOURS = [
  { stat: 'stammwuerze', op: 'multiply', value: 1.3 },
  { stat: 'gschwindigkeit', op: 'multiply', value: 1.25 },
  { stat: 'schluckfrequenz', op: 'multiply', value: 0.75 },
] as const;

/**
 * Wolpertinger im Rucksack — the mythical hybrid, riding along in a
 * rucksack, a different creature every time you look. A different buff
 * every room.
 *
 * `docs/CONTENT_BIBLE.md` §4 asks for "a different random behaviour every
 * room." A genuine per-tick random roll would have to draw from one of
 * `sim/rng/streams.ts`'s four fixed streams, and none of them is "an item
 * hook rolling a gameplay-affecting number mid-run" — that file's own rule
 * ("a system draws from its own stream only") exists precisely to keep one
 * stream's consumption from perturbing another's sequence, and inventing a
 * fifth stream for one item is a decision bigger than #59's content-only
 * scope. This ships as the honest alternative: a fixed three-step cycle,
 * advanced by `state.charge` on every `onRoomClear`, so the buff is still
 * genuinely different from room to room (and still varies run to run,
 * because which room you clear first is itself procedural) without
 * touching the RNG architecture.
 */
export const wolpertingerImRucksack: ItemDefinition = {
  id: 'wolpertinger-im-rucksack',
  name: 'Wolpertinger im Rucksack',
  description: 'A different stat buff every room you clear',
  flavourText: 'Nobody has ever agreed on how many legs it had.',
  sprite: 'wolpertinger-im-rucksack',
  pools: ['treasure', 'shop', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) => {
      const behaviour = BEHAVIOURS[state.charge % BEHAVIOURS.length];
      return behaviour === undefined ? [] : [behaviour];
    },
    onRoomClear: (ctx) => {
      ctx.state.charge += 1;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
