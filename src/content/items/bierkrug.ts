import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Bierkrug — a stone mug, heavier every time you pick up another one.
 *
 * The proof item for #26's `modifyStats` hook, the same role Bierratte plays
 * for #14's enemy primitives: nothing engine-side changed to add it, and
 * `sim/item/registry.ts`/`sim/game/sim.ts` never mention its id. Real balance
 * is #29's job — this exists so the format has one working, shipped example
 * rather than only ones invented for a test file.
 */
export const bierkrug: ItemDefinition = {
  id: 'bierkrug',
  name: 'Bierkrug',
  description: 'Damage +1 per stack',
  sprite: 'bierkrug',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    // Scales with `state.count` rather than a flat +1, so a second Bierkrug
    // is worth taking rather than dead weight in the pool once one is held.
    // 'stammwuerze' — Stammwürze, damage — is the `StatId` literal rather
    // than an import of it: content may import types, never values, and
    // `StatId` (`sim/stats/definition.js`) is a value the pipeline reads its
    // string ids off of.
    modifyStats: (state) => [{ stat: 'stammwuerze', op: 'add', value: state.count }],
  },
};
