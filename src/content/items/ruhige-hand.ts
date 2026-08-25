import type { ItemDefinition } from '../../sim/item/definition.js';

/** Below this Promille the bonus applies — the Angeheitert tier boundary (`sim/game/promille.ts`'s `ANGEHEITERT_AT`), i.e. still fully sober. */
const SOBER_THRESHOLD = 0.5;
const DAMAGE_MULTIPLIER = 1.4;

/**
 * Ruhige Hand — a steady hand. +40% damage while under 0.5 Promille.
 * Actively fights every beer pickup in the game, which is the point:
 * `sober`-gated, so it never appears in a run where drinking has not been
 * unlocked, and it is the one item that makes staying under a threshold a
 * build worth playing for.
 *
 * `modifyStats` is a pure function of `state` alone — it never sees `sim`,
 * so it cannot read live Promille itself. `onTick` is what watches
 * `ctx.sim.promille` and flips `state.charge` between 0 and 1, calling
 * `ctx.sim.refreshItemStats` only on the tick the flag actually changes.
 */
export const ruhigeHand: ItemDefinition = {
  id: 'ruhige-hand',
  name: 'Ruhige Hand',
  description: 'Damage +40% while under 0.5 Promille',
  flavourText: 'The only item in the tent trying to talk you out of another round.',
  sprite: 'ruhige-hand',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'sober',
  hooks: {
    modifyStats: (state) =>
      state.charge === 1 ? [{ stat: 'stammwuerze', op: 'multiply', value: DAMAGE_MULTIPLIER }] : [],
    onTick: (ctx) => {
      const state = ctx.state;
      const active = ctx.sim.promille < SOBER_THRESHOLD ? 1 : 0;
      if (state.charge === active) {
        return;
      }
      state.charge = active;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
