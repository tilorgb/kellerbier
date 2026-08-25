import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Haferlschuh — a nailed leather shoe, built for grip. Flat move speed.
 *
 * The seed text's "traction on ice and slick floors" half has no stat or
 * hazard system to hook yet — there is no floor-friction mechanic in the
 * engine today (Floor 1's slick puddles are #35's job) — so this ships as
 * the speed half alone, honestly under-scoped rather than faked.
 */
export const haferlschuh: ItemDefinition = {
  id: 'haferlschuh',
  name: 'Haferlschuh',
  description: 'Move speed +15%',
  flavourText: 'Every nail hand-driven by someone who takes this far too seriously.',
  sprite: 'haferlschuh',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'gschwindigkeit', op: 'multiply', value: 1.15 }],
  },
};
