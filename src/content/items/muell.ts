import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Müll — a bin, and "(No) Littering!". The Schlauch's shots turn into
 * rubbish: a banana peel, a nail, an apple core, a sheet of paper. Wherever a
 * shot ends, the trash stays on the floor for the rest of the room.
 *
 * Deliberately no effect on how the game plays — the damage, speed and range
 * are exactly what they were. It is a joke you can see: the only change is on
 * screen. Which piece a shot is comes from the cosmetic stream, so it can never
 * move a replay.
 */
export const muell: ItemDefinition = {
  id: 'muell',
  name: 'Müll',
  description: 'items.muell.description',
  flavourText: 'items.muell.flavourText',
  sprite: 'muell',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    onProjectileSpawn: (ctx) => {
      const sim = ctx.sim;
      const piece = sim.random.cosmetic.nextInt(0, sim.litterVariants);
      sim.setProjectileLook(ctx.projectile, piece + 1);
    },
  },
};
