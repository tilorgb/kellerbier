import type { ItemDefinition } from '../../sim/item/definition.js';

/** Health regained per sticky hit landed. */
const HEAL_PER_HIT = 1;

/**
 * Zuckerrohrsirup — syrup from the bottling line's own tank. Shots stick
 * in whatever they hit, and somewhere in the mess you come out ahead.
 *
 * `sticky` (#27) already embeds the shot — `colaweizen.ts`'s own tag —
 * paired here with a small heal on every sticky hit instead of a slow,
 * a different `onHit` payoff for the same tag.
 */
export const zuckerrohrsirup: ItemDefinition = {
  id: 'zuckerrohrsirup',
  name: 'Zuckerrohrsirup',
  description: 'Shots stick. Every sticky hit heals a little',
  flavourText: 'The tank was rated for beer. Nobody consulted the tank.',
  sprite: 'zuckerrohrsirup',
  pools: ['shop', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'sticky');
    },
    onHit: (ctx) => {
      ctx.sim.addPlayerHealth(HEAL_PER_HIT);
    },
  },
};
