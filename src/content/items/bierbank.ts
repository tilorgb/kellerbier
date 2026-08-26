import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Bierbank — a beer-tent bench, `docs/CONTENT_BIBLE.md`'s own skipped
 * `Bierzelt-Garnitur` (it still needs a destructible-obstacle entity type
 * that does not exist yet — the reason it stays skipped batch after batch)
 * shipped instead as a plain quality-0 stat stick, the seat rather than the
 * furniture set.
 */
export const bierbank: ItemDefinition = {
  id: 'bierbank',
  name: 'Bierbank',
  description: 'Dusel +1, Reichweite +5%',
  flavourText: 'Reserved. Nobody has ever admitted to reserving it.',
  sprite: 'bierbank',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [
      { stat: 'dusel', op: 'add', value: 1 },
      { stat: 'reichweite', op: 'multiply', value: 1.05 },
    ],
  },
};
