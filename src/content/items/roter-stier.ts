import type { ItemDefinition } from '../../sim/item/definition.js';

/** Move speed multiplier. */
export const ROTER_STIER_SPEED = 1.25;

/**
 * Roter Stier — a blue-and-silver can that gives you wings. Alois flies
 * (`GameSim.playerFlies`): furniture, puddles, ice and pits are all under him,
 * and only the room's walls and its enemies stop him — the same flight König
 * Ludwig has. Move speed +25%, and the shots are an ordinary Schlauch's.
 *
 * The wings are drawn on his back and flap while he moves
 * (`render/wings-view.ts`).
 */
export const roterStier: ItemDefinition = {
  id: 'roter-stier',
  name: 'Roter Stier',
  description: 'items.roter-stier.description',
  flavourText: 'items.roter-stier.flavourText',
  sprite: 'roter-stier',
  pools: ['treasure', 'shop', 'boss'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'moveSpeed', op: 'multiply', value: ROTER_STIER_SPEED }],
  },
};
