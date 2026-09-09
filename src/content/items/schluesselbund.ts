import type { ItemDefinition } from '../../sim/item/definition.js';

const KEY_AMOUNT = 1;

/**
 * Schlüsselbund — fits every lock in the Keller, and apparently knows where
 * every door is too. The floor's secret and supersecret rooms show on the
 * minimap the moment it is picked up, unfound, wherever they are; clearing a
 * room still hands over a Kellerschlüssel.
 *
 * The reveal goes through `GameSim.setSecretRoomsRevealed` — the "unlock
 * item" `render/minimap-hud.ts`'s `computeReveal` always left a door open
 * for — set on pickup and taken back on `onRemove`, so losing the item
 * returns the map to exactly what it was (`ItemRuntimeState`'s invariant).
 * The wall itself still has to be bombed or walked into: the item tells the
 * player *where*, not *how*.
 */
export const schluesselbund: ItemDefinition = {
  id: 'schluesselbund',
  name: 'Schlüsselbund',
  description: 'items.schluesselbund.description',
  flavourText: 'items.schluesselbund.flavourText',
  sprite: 'schluesselbund',
  pools: ['treasure', 'shop', 'secret'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.sim.setSecretRoomsRevealed(true);
    },
    onRemove: (ctx) => {
      ctx.sim.setSecretRoomsRevealed(false);
    },
    onRoomClear: (ctx) => {
      ctx.sim.addKeys(KEY_AMOUNT);
    },
  },
};
