import type { ItemDefinition } from '../../sim/item/definition.js';

const DAMAGE_MULTIPLIER = 1.4;

/**
 * Ruhige Hand — a steady hand. +40% damage while under 0.5 Promille.
 * Actively fights every beer pickup in the game, which is the point:
 * `sober`-gated, so it never appears in a run where drinking has not been
 * unlocked, and it is the one item that makes staying under a threshold a
 * build worth playing for.
 *
 * Pre-#32 this item carried its own bespoke `onTick` toggling `state.charge`
 * against a hardcoded 0.5 constant, because nothing else in the engine
 * turned a `sober`/`rausch` item's hooks off outside its tier. #32's generic
 * gate (`GameSim.syncItemStatModifiers`, via `promilleRequirementMet`) now
 * does exactly that for every gated item's `modifyStats`, and 0.5 was never
 * a number specific to this item — it is `PromilleTier.Nuchtern`'s own upper
 * edge (`ANGEHEITERT_AT` in `sim/game/promille.ts`), the same boundary the
 * generic gate already uses for every `sober` item. So `modifyStats` can go
 * back to being a pure, unconditional function of `state` alone, and the
 * `onTick` hook is gone entirely: the engine now supplies exactly the
 * behaviour it used to hand-roll.
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
    modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: DAMAGE_MULTIPLIER }],
  },
};
