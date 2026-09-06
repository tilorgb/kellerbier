import type { ItemDefinition } from '../../sim/item/definition.js';

/** Shot-speed bonus off the whip's crack. */
const SHOT_SPEED_BONUS = 0.15;

/**
 * Peitschn — a farmhand's whip, cracked overhead. Shots snap out faster and
 * carom off whatever they hit instead of stopping dead.
 *
 * `bouncing` is applied through `onProjectileSpawn`, the same "every shot the
 * player fires, main gun included" scope `alpengluehen.ts`/`colaweizen.ts`
 * already document — a whip crack has no separate companion shot to be
 * careful about, so there is nothing to exclude.
 */
export const peitschn: ItemDefinition = {
  id: 'peitschn',
  name: 'Peitschn',
  description: 'Shots gain bouncing. Shot Speed +15%',
  flavourText: 'The crack is the sound barrier losing an argument with a cow herder.',
  sprite: 'peitschn',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'shotSpeed', op: 'multiply', value: 1 + SHOT_SPEED_BONUS }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'bouncing');
    },
  },
};
