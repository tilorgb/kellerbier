import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Reinheitsgebot 1516 — the purist's pact. Strips every raisin-tainted item
 * from your shots and permanently locks you out of them, in exchange for a
 * flat Stammwürze bonus.
 *
 * Retuned by #166 to answer the run's own question: the law it is named
 * after fixed water, barley and hops in 1516, and the run's premise
 * (`docs/DECISIONS.md` #24) is a raisin that got into the beer, not a soft
 * drink — so this now strips `rosinen`, not `impure`. `impure` (Radler,
 * Spezi, Russ'n, Colaweizen) is untouched and coexists with 1516 for the
 * first time, which is a deliberate balance change (#166's PR checks it in
 * the fuzz harness), not an oversight.
 *
 * "Locks out" is two things, both done once, on pickup, to every item in the
 * registry tagged `rosinen`: `ctx.sim.banItemFromPool` closes the pool off
 * for the rest of the run (`itemEligibleForOffer`, `sim/item/pool.ts`,
 * already refuses anything in `taken`), and any `rosinen` item already held
 * is stripped outright via `removeItem` — not merely blocked from future
 * offers. `sim.items.all` and `sim.inventory.has` are both public surface on
 * `ctx.sim`, the same "reach into sim, never import a value" rule every
 * other hook already follows. `sudordnung-1493.ts` is this same hook, widened
 * to strip both `rosinen` and `impure` at once.
 */
export const reinheitsgebot1516: ItemDefinition = {
  id: 'reinheitsgebot-1516',
  name: 'Reinheitsgebot 1516',
  description: 'Locks out every rosinen item. Stammwürze +50%',
  flavourText: 'Water, barley, hops. Written before anyone thought to mention raisins.',
  sprite: 'reinheitsgebot-1516',
  pools: ['shop', 'boss', 'devil'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: 1.5 }],
    onPickup: (ctx) => {
      const sim = ctx.sim;
      for (const item of sim.items.all) {
        if (!item.tags.includes('rosinen')) {
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
