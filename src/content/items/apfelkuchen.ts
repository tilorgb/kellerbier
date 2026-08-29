import type { ItemDefinition } from '../../sim/item/definition.js';

/** The one-time heal and the permanent Stammwürze bump Oma's cake leaves behind. */
const HEAL_AMOUNT = 4;
const STAMMWUERZE_MULTIPLIER = 1.05;

/**
 * Apfelkuchen — Oma's. Heals generously once, on pickup, and leaves a small
 * permanent Stammwürze bump behind. Uncomplicated and quite boring — the
 * plain half of the pattern pair `apfelkuchen-mit-rosinen.ts` sets itself
 * against, per #166.
 */
export const apfelkuchen: ItemDefinition = {
  id: 'apfelkuchen',
  name: 'Apfelkuchen',
  description: 'Heals 4. Stammwürze +5%',
  flavourText: "Oma's. Still warm, if you get down there before Opa does.",
  sprite: 'apfelkuchen',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: STAMMWUERZE_MULTIPLIER }],
    onPickup: (ctx) => {
      ctx.sim.addPlayerHealth(HEAL_AMOUNT);
    },
  },
};
