import type { ItemDefinition } from '../../sim/item/definition.js';

/** Health regained and Promille shed at the start of every floor. */
const HEAL_AMOUNT = 2;
const PROMILLE_RELIEF = 0.2;

/**
 * Almhüttn-Feuer — the fireplace in `docs/CONTENT_BIBLE.md`'s Die Almhütte,
 * "a peaceful shortcut/rest room. No enemies. Somebody is yodelling."
 * Carried past the room itself, it keeps giving you a small piece of that
 * rest at the start of every floor.
 *
 * `sober`-gated deliberately: `feierabendbier.ts` is this item's `any`-gated
 * mirror, a heal that costs Promille rather than sheds it — the Almhütte's
 * whole point is that nothing in it costs you anything.
 */
export const almhuettnFeuer: ItemDefinition = {
  id: 'almhuettn-feuer',
  name: 'Almhüttn-Feuer',
  description: 'Sober. Heals a little and lowers Promille a little at the start of every floor',
  flavourText: "Somebody is yodelling. It's the least threatening sound in the whole run.",
  sprite: 'almhuettn-feuer',
  pools: ['treasure', 'secret'],
  quality: 1,
  promilleRequirement: 'sober',
  hooks: {
    onFloorStart: (ctx) => {
      ctx.sim.addPlayerHealth(HEAL_AMOUNT);
      ctx.sim.lowerPromille(PROMILLE_RELIEF);
    },
  },
};
