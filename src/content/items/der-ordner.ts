import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Der Ordner — a bouncer familiar you can see: he walks at Alois's side,
 * strides over to the nearest mob that comes too close and shoves *that one*
 * back out of the player's space — no damage, mass-scaled — then walks back
 * and catches his breath before the next. All of it is
 * `sim/systems/ordner.ts`, tuned under `tuning.ordner`.
 *
 * It used to be an invisible aura shoving everything within 40 units away
 * every tick, which stacked into more push than any Floor 3 mob could walk
 * against: holding it was invulnerability.
 */
export const derOrdner: ItemDefinition = {
  id: 'der-ordner',
  name: 'Der Ordner',
  description: 'items.der-ordner.description',
  flavourText: 'items.der-ordner.flavourText',
  sprite: 'der-ordner',
  pools: ['treasure', 'shop', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.summonOrdner();
    },
    onTick: (ctx) => {
      ctx.sim.stepOrdner();
    },
  },
};
