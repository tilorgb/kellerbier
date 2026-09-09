import type { ItemDefinition } from '../../sim/item/definition.js';

/** Biermarken spent per floor scales with the floor number itself — the debt grows exactly the way the castle's did. */
const COST_PER_FLOOR = 5;

/**
 * Neuschwanstein-Bauplan — the blueprint for a castle nobody could afford. A
 * large permanent stat buff, paid for every floor with a sum that grows as
 * the run goes on. Ludwig went bankrupt too.
 *
 * `onFloorStart` fires once per floor (`GameSim.applyCompiledRoom`) with the
 * floor number already in `ctx.floor` — `spendBiermarken` fails silently
 * rather than punishing a run that cannot pay, matching the item's own
 * "went bankrupt too" framing rather than bricking a build over it.
 */
export const neuschwansteinBauplan: ItemDefinition = {
  id: 'neuschwanstein-bauplan',
  name: 'Neuschwanstein-Bauplan',
  description: 'items.neuschwanstein-bauplan.description',
  flavourText: 'items.neuschwanstein-bauplan.flavourText',
  sprite: 'neuschwanstein-bauplan',
  pools: ['shop', 'boss', 'devil'],
  quality: 2,
  promilleRequirement: 'any',
  // The bill for the next floor, up front — the item is a loan, and a loan
  // whose next instalment is a surprise is not a decision, it is a trap.
  status: (ctx) =>
    `next floor costs ${String(Math.max(0, ctx.sim.currentFloor + 1) * COST_PER_FLOOR)} Biermarken`,
  hooks: {
    modifyStats: () => [
      { stat: 'damage', op: 'multiply', value: 1.3 },
      { stat: 'shotSpeed', op: 'multiply', value: 1.2 },
      { stat: 'range', op: 'multiply', value: 1.2 },
    ],
    onFloorStart: (ctx) => {
      ctx.sim.spendBiermarken(Math.max(0, ctx.floor) * COST_PER_FLOOR);
    },
  },
};
