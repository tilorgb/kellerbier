import type { ItemDefinition } from '../../sim/item/definition.js';

/** How long a Colaweizen shot's `freeze` slow lasts on whatever it sticks to, in ticks (60/s). */
const SLOW_TICKS = 90;

/**
 * Colaweizen — wheat beer cut with cola. Impure and everyone knows it. Shots
 * stick in whatever they hit and slow it there.
 *
 * `sticky` (#27) already embeds the shot in its target; `onHit` layers a
 * `freeze` status on top through `ctx.sim.applyStatusEffect` for the "slows"
 * half, since `sticky` alone only decides what the *shot* does, not what it
 * does to what it is stuck in. Tagged `impure` for Reinheitsgebot 1516.
 */
export const colaweizen: ItemDefinition = {
  id: 'colaweizen',
  name: 'Colaweizen',
  description: 'items.colaweizen.description',
  flavourText: 'items.colaweizen.flavourText',
  sprite: 'colaweizen',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  tags: ['impure'],
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'multiply', value: 0.8 }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'sticky');
      // Cola-dark: a sticky shot riding an enemy for a second and a half is
      // the item's whole effect, and beer-coloured it read as a shot that
      // forgot to despawn.
      ctx.sim.tintProjectile(ctx.projectile, 'cola');
    },
    onHit: (ctx) => {
      ctx.sim.applyStatusEffect(ctx.target, 'freeze', SLOW_TICKS);
    },
  },
};
