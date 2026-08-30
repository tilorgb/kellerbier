import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Konterbier — hair of the dog. Drinking through a hangover instantly clears
 * the Kater debuff, per `docs/CONTENT_BIBLE.md` §4's "Obviously."
 *
 * `any`-gated: it does nothing until Kater is actually running, and Kater
 * can be running whether the player is currently sober or deep in rausch —
 * there is no tier this item cares about, only the one event it watches.
 * `onBeerPickup` (#32) is a new hook point, added alongside this item rather
 * than for it specifically — see that hook's doc comment in
 * `sim/item/definition.ts` for why it is named for the event and not for
 * this item.
 *
 * Without this item, `sim/systems/pickup.ts`'s `case 'promille'` branch never
 * clears Kater on its own — only `food` pickups do that (a smaller, gentler
 * effect). Konterbier is what makes the *bigger*, riskier drink also the
 * cure, which is the joke.
 */
export const konterbier: ItemDefinition = {
  id: 'konterbier',
  name: 'Konterbier',
  description: 'Drinking while hungover instantly clears the Kater',
  flavourText: 'Hair of the dog. The dog remembers you fondly.',
  sprite: 'konterbier',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  // No tier gate — but it is Promille machinery all the same (clears a Kater that cannot happen),
  // so a sober run never offers it (#85).
  needsPromille: true,
  hooks: {
    onBeerPickup: (ctx) => {
      if (ctx.sim.hasKater) {
        ctx.sim.clearKater();
      }
    },
  },
};
