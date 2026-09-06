import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Krautstampfer — somebody has to stomp the sauerkraut. Today, mechanically,
 * it's you. The roster's plainest quality-0 filler: flat Damage, no
 * conditions attached.
 */
export const krautstampfer: ItemDefinition = {
  id: 'krautstampfer',
  name: 'Krautstampfer',
  description: 'Damage +1',
  flavourText: "Somebody has to stomp it. Today, mechanically, that's you.",
  sprite: 'krautstampfer',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'add', value: 1 }],
  },
};
