import type { ItemDefinition } from '../../sim/item/definition.js';

/** Keys granted every room cleared. */
const KEY_AMOUNT = 1;

/**
 * Schlüsselbund — a keyring that fits every lock in the Keller. Explaining
 * why is above your pay grade; the mechanical effect is simply a key on
 * every room cleared.
 */
export const schluesselbund: ItemDefinition = {
  id: 'schluesselbund',
  name: 'Schlüsselbund',
  description: 'Clearing a room grants a key',
  flavourText: 'Fits every lock in the Keller. Explaining why is above your pay grade.',
  sprite: 'schluesselbund',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    onRoomClear: (ctx) => {
      ctx.sim.addKeys(KEY_AMOUNT);
    },
  },
};
