import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Heldensaal-Fackel — a torch lifted from Walhalla's hall of heroes
 * (`docs/CONTENT_BIBLE.md`'s secret areas, `ahnenbueste.ts`'s own source).
 * A flat, unconditional Wurfkraft bump — a plain reward for having found
 * the place at all, no pact and no trade-off attached.
 */
export const heldensaalFackel: ItemDefinition = {
  id: 'heldensaal-fackel',
  name: 'Heldensaal-Fackel',
  description: 'Wurfkraft +20%',
  flavourText: 'The bust does not move. The plinth it stands on is a different story after dark.',
  sprite: 'heldensaal-fackel',
  pools: ['boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'wurfkraft', op: 'multiply', value: 1.2 }],
  },
};
