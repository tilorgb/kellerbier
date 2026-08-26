import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Feuerwehrhelm — a fire brigade helmet, rated to withstand heat, impact,
 * and at least one Böllerschmeißer. A plain, unconditional utility item.
 */
export const feuerwehrhelm: ItemDefinition = {
  id: 'feuerwehrhelm',
  name: 'Feuerwehrhelm',
  description: 'Gschwindigkeit +10%, Wurfkraft +10%',
  flavourText: 'Rated to withstand heat, impact, and at least one Böllerschmeißer.',
  sprite: 'feuerwehrhelm',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'gschwindigkeit', op: 'multiply', value: 1.1 },
      { stat: 'wurfkraft', op: 'multiply', value: 1.1 },
    ],
  },
};
