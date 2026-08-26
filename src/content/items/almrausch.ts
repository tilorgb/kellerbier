import type { ItemDefinition } from '../../sim/item/definition.js';

/** How finely Promille is bucketed (half-point steps) and the damage each bucket is worth. */
const BUCKET_SIZE = 0.5;
const DAMAGE_PER_BUCKET = 0.06;

/**
 * Almrausch — alpenrose, and the word Bavarian German already uses for the
 * particular giddiness of high altitude. The higher your Promille climbs,
 * the harder you hit.
 *
 * `modifyStats` (`sim/item/definition.ts`) takes no `sim`, only `state` — it
 * cannot read `sim.promille` directly. `onTick` mirrors the current tier
 * into `state.charge` in half-point buckets and calls `refreshItemStats`
 * only when the bucket actually changes, the same "read a live sim value
 * into state, then let `modifyStats` read state" shape `wolpertinger-im-rucksack.ts`
 * and `lebkuchenherz.ts` already use for a different live value (room count,
 * floor number).
 */
export const almrausch: ItemDefinition = {
  id: 'almrausch',
  name: 'Almrausch',
  description: 'The higher your Promille, the harder you hit',
  flavourText: 'The flower is mildly toxic. Nobody involved considers that the concerning part.',
  sprite: 'almrausch',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) =>
      state.charge <= 0
        ? []
        : [{ stat: 'stammwuerze', op: 'add', value: state.charge * DAMAGE_PER_BUCKET }],
    onTick: (ctx) => {
      const sim = ctx.sim;
      const state = ctx.state;
      const bucket = Math.floor(sim.promille / BUCKET_SIZE);
      if (bucket === state.charge) {
        return;
      }
      state.charge = bucket;
      sim.refreshItemStats(ctx.itemId);
    },
  },
};
