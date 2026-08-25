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
  description: 'Large stat boost. Costs more Biermarken every floor',
  flavourText: 'An unfinished wing, drawn in impressive detail.',
  sprite: 'neuschwanstein-bauplan',
  pools: ['shop', 'boss', 'devil'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'stammwuerze', op: 'multiply', value: 1.3 },
      { stat: 'wurfkraft', op: 'multiply', value: 1.2 },
      { stat: 'reichweite', op: 'multiply', value: 1.2 },
    ],
    onFloorStart: (ctx) => {
      ctx.sim.spendBiermarken(Math.max(0, ctx.floor) * COST_PER_FLOOR);
    },
  },
};
