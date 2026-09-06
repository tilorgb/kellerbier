import type { ItemDefinition } from '../../sim/item/definition.js';

/** Flat Damage added while held. */
const DAMAGE_BONUS = 0.2;

/**
 * Braumeister-Schürze — the second piece of the Braumeister set (#137),
 * alongside `braumeister-visier.ts` (already in the game) and
 * `braumeister-hammer.ts`. His brewer's apron: heavy leather, caught more
 * of the batch than the floor ever has. A plain flat stat bonus, the same
 * shape `bierbank.ts`'s Luck line already uses, rather than a hook — the
 * set's own combined identity is what `content/item-sets/braumeister.ts`
 * carries; each individual piece can afford to be simple.
 */
export const braumeisterSchuerze: ItemDefinition = {
  id: 'braumeister-schuerze',
  name: 'Braumeister-Schürze',
  description: `Damage +${String(DAMAGE_BONUS)}`,
  flavourText: 'He aims the way he pours. It never spills.',
  sprite: 'braumeister-schuerze',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'add', value: DAMAGE_BONUS }],
  },
  /** Der Losbrunnen's rarest roll (#218): the apron reinforced, triple the flat bonus. */
  legendaryRoll: [{ stat: 'damage', op: 'add', value: DAMAGE_BONUS * 3 }],
};
