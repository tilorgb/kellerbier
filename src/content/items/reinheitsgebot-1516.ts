import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Reinheitsgebot 1516 — the purist's pact. Strips every soft-drink modifier
 * from your shots and permanently locks you out of them, in exchange for a
 * flat Stammwürze bonus.
 *
 * "Locks out" is two things, both done once, on pickup, to every item in the
 * registry tagged `impure` (Radler, Spezi, Russ'n, Colaweizen — anything
 * that mixes beer with a soft drink): `ctx.sim.banItemFromPool` closes the
 * pool off for the rest of the run (`itemEligibleForOffer`,
 * `sim/item/pool.ts`, already refuses anything in `taken`), and any impure
 * item already held is stripped outright via `removeItem` — not merely
 * blocked from future offers. `sim.items.all` and `sim.inventory.has` are
 * both public surface on `ctx.sim`, the same "reach into sim, never import a
 * value" rule every other hook already follows.
 */
export const reinheitsgebot1516: ItemDefinition = {
  id: 'reinheitsgebot-1516',
  name: 'Reinheitsgebot 1516',
  description: 'Locks out every impure item. Stammwürze +50%',
  flavourText: 'Water, barley, hops. It says nothing about lemonade, and everyone knows why.',
  sprite: 'reinheitsgebot-1516',
  pools: ['shop', 'boss', 'devil'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: 1.5 }],
    onPickup: (ctx) => {
      const sim = ctx.sim;
      for (const item of sim.items.all) {
        if (!item.tags.includes('impure')) {
          continue;
        }
        sim.banItemFromPool(item.id);
        const index = sim.items.indexOf(item.id);
        while (sim.inventory.has(index)) {
          sim.removeItem(item.id);
        }
      }
    },
  },
};
