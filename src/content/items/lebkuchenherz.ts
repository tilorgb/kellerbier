import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * The fixed slogans and their mechanical effects. `docs/CONTENT_BIBLE.md`
 * §4 asks for "randomly chosen" text and effect; see the file doc comment
 * for why this ships as a deterministic cycle keyed off the floor instead.
 */
const SLOGANS = [
  { text: 'Für mein Schatzi', modifier: { stat: 'dusel', op: 'add', value: 3 } },
  {
    text: 'Ein Herz und eine Seele',
    modifier: { stat: 'gschwindigkeit', op: 'multiply', value: 1.2 },
  },
  { text: 'Immer wieder gern', modifier: { stat: 'schluckfrequenz', op: 'multiply', value: 0.85 } },
  { text: 'Nur für dich allein', modifier: { stat: 'stammwuerze', op: 'multiply', value: 1.2 } },
] as const;

/**
 * Lebkuchenherz — a gingerbread heart on a ribbon, the kind sold by the
 * dozen on Floor 7. The slogan iced across the front is the whole item: a
 * cosmetic string that happens to carry a mechanical effect.
 *
 * Shares a name with Floor 7's `Lebkuchenherz` enemy (`docs/CONTENT_BIBLE.md`
 * §2, "the slogan is the attack") — deliberate, not a collision: the same
 * fairground trinket, one thrown at you and one carried by you. The seed
 * text's "randomly chosen" slogan runs into the same RNG-architecture
 * problem `wolpertinger-im-rucksack.ts` documents (no stream is meant for a
 * gameplay-affecting item roll), so this reads the current floor number
 * instead — still a different heart on a different run, since which floor
 * you find it on is itself procedural, but replay-safe without a new
 * stream. `state.charge` is set once, at pickup or at the floor's start,
 * whichever comes first, and never rerolled mid-floor — the heart you are
 * carrying stays the heart you are carrying until the next one.
 */
export const lebkuchenherz: ItemDefinition = {
  id: 'lebkuchenherz',
  name: 'Lebkuchenherz',
  description: 'A slogan overhead with a small stat effect that changes floor to floor',
  flavourText: '"Ein Prosit" was already taken by the mug next to it.',
  sprite: 'lebkuchenherz',
  pools: ['treasure', 'shop', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) => {
      const slogan = SLOGANS[state.charge % SLOGANS.length];
      return slogan === undefined ? [] : [slogan.modifier];
    },
    onPickup: (ctx) => {
      ctx.state.charge = Math.max(0, ctx.sim.currentFloor);
    },
    onFloorStart: (ctx) => {
      const state = ctx.state;
      const nextCharge = Math.max(0, ctx.floor);
      if (nextCharge === state.charge) {
        return;
      }
      state.charge = nextCharge;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
