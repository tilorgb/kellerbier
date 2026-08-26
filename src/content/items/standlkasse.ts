import type { ItemDefinition } from '../../sim/item/definition.js';

/** Biermarken spent per floor, and the permanent Stammwürze each successful payment buys. */
const COST_PER_FLOOR = 3;
const DAMAGE_PER_PAYMENT = 0.05;

/**
 * Standlkasse — a market stall's cash box. Everything has a price today;
 * yesterday's price does not come back. Each floor, spends Biermarken for a
 * small, permanent Stammwürze gain — `spendBiermarken` fails silently if the
 * run cannot afford it, `teufelsbraten.ts`'s and `neuschwanstein-bauplan.ts`'s
 * own precedent for an upkeep item that never bricks a poor run.
 *
 * The roster's fifth `devil`-pool item — unlike `teufelsbraten.ts`'s
 * recurring per-kill toll or `teufelstritt-russ.ts`'s recurring Promille
 * toll, this one's cost is capped by what you actually have on hand each
 * floor, so `state.charge` (how many payments have landed, mirrored into
 * `modifyStats`) only ever grows when the run can afford it.
 */
export const standlkasse: ItemDefinition = {
  id: 'standlkasse',
  name: 'Standlkasse',
  description: 'Each floor, spend 3 Biermarken for permanent Stammwürze if you can afford it',
  flavourText: "Everything has a price today. Yesterday's price does not come back.",
  sprite: 'standlkasse',
  pools: ['shop', 'devil', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) =>
      state.charge <= 0
        ? []
        : [{ stat: 'stammwuerze', op: 'add', value: state.charge * DAMAGE_PER_PAYMENT }],
    onFloorStart: (ctx) => {
      if (!ctx.sim.spendBiermarken(COST_PER_FLOOR)) {
        return;
      }
      ctx.state.charge += 1;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
