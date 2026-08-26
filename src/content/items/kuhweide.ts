import type { ItemDefinition } from '../../sim/item/definition.js';

/** Soul health granted per copy picked up. */
const SOUL_HEALTH = 1;

/**
 * Kuhweide — a fenced cow pasture, `docs/CONTENT_BIBLE.md` §2's village
 * green. A quiet, one-time grant rather than anything that runs during
 * play — the roster's plainest `onPickup`, the same shape `feuerwasser.ts`'s
 * charge setup uses for its own one-off state, just spent on a soul heart
 * instead. Fires again on every additional copy, same as any other stack.
 */
export const kuhweide: ItemDefinition = {
  id: 'kuhweide',
  name: 'Kuhweide',
  description: 'Grants a soul heart on pickup',
  flavourText: 'Grazing rights, sublet. The cows were not consulted.',
  sprite: 'kuhweide',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.addSoulHealth(SOUL_HEALTH);
    },
  },
};
