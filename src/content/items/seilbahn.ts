import type { ItemDefinition } from '../../sim/item/definition.js';

/** Range bonus per floor of altitude gained. */
const REICHWEITE_PER_FLOOR = 0.04;

/**
 * Seilbahn — the cable car up. The higher it has carried you, the further
 * you can see and throw.
 *
 * `state.charge` mirrors the current floor, the same "read a live sim
 * value into state at `onFloorStart`, let `modifyStats` read it back"
 * shape `lebkuchenherz.ts` already uses — here for a permanently growing
 * bonus rather than a cycling one, since altitude, unlike a slogan, never
 * goes back down mid-run.
 */
export const seilbahn: ItemDefinition = {
  id: 'seilbahn',
  name: 'Seilbahn',
  description: 'Reichweite grows with every floor you reach',
  flavourText: 'The view from the top is worth it. The queue at the bottom is not.',
  sprite: 'seilbahn',
  pools: ['treasure', 'shop', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) =>
      state.charge <= 0
        ? []
        : [{ stat: 'reichweite', op: 'multiply', value: 1 + state.charge * REICHWEITE_PER_FLOOR }],
    onPickup: (ctx) => {
      ctx.state.charge = Math.max(0, ctx.sim.currentFloor);
    },
    onFloorStart: (ctx) => {
      const state = ctx.state;
      const nextCharge = Math.max(0, ctx.floor);
      if (nextCharge === state.charge) {
        return;
      }
      state.charge = nextCharge;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
