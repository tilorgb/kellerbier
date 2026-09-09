import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Reinheitsgebot 1516 — the purist's pact. Strips every raisin-tainted item
 * from your shots and permanently locks you out of them, in exchange for a
 * flat Damage bonus.
 *
 * Retuned by #166 to answer the run's own question: the law it is named
 * after fixed water, barley and hops in 1516, and the run's premise
 * (`docs/DECISIONS.md` #24) is a raisin that got into the beer, not a soft
 * drink — so this now strips `rosinen`, not `impure`. `impure` (Radler,
 * Spezi, Russ'n, Colaweizen) is untouched and coexists with 1516 for the
 * first time, which is a deliberate balance change (#166's PR checks it in
 * the fuzz harness), not an oversight.
 *
 * **Retuned from +50% to +35% by #237**, and the change is not a nerf so much
 * as the first time the number was measured against a real cost. It was
 * written when the pool contained *one* `rosinen` item — an apple cake whose
 * own text reads "Permanently Range -15%", which many players would decline
 * on sight — so a flat +50% damage for locking out a set of size one was
 * simply always correct, which is the opposite of a pact. With eleven of
 * them in the pool the lockout costs a measured ~1.25 offers a run
 * (76.8% of runs offer at least one, against 16.1% before), including two
 * quality-3 items and several build-defining quality-2s. +35% flat is on the
 * same order as that, which is what makes it a decision: worth taking early,
 * when there is a whole run left to spend the damage on and the pool is
 * mostly unseen — much less obvious on floor 2, or when a raisin build is
 * already assembled.
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
  description: 'items.reinheitsgebot-1516.description',
  flavourText: 'items.reinheitsgebot-1516.flavourText',
  sprite: 'reinheitsgebot-1516',
  pools: ['shop', 'boss', 'devil'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'multiply', value: 1.35 }],
    // The pure pour: gold shots for the rest of the run, so the pact a
    // player signed is on every shot they fire.
    onProjectileSpawn: (ctx) => {
      ctx.sim.tintProjectile(ctx.projectile, 'gold');
    },
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
