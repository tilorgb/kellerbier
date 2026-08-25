import type { ItemDefinition } from '../../sim/item/definition.js';

/** The four directions the staves fly, and their damage scale off Stammwürze. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DAMAGE_SCALE = 1;

/**
 * Fassldauben — the keg's own staves. When a Bierfassl goes off, they fly
 * out in four directions on top of the ordinary blast.
 *
 * Formerly Böllerschütze — renamed once the bomb itself became a Bierfassl
 * rather than a Böller (#22); "staves fly out when the keg goes" is what
 * actually happens now, rather than the old name's implied firework. Uses
 * `onBombDetonate` (#29), the hook added for exactly this item — the moment
 * did not exist in #26's original nine because nothing needed it until now.
 */
export const fassldauben: ItemDefinition = {
  id: 'fassldauben',
  name: 'Fassldauben',
  description: 'Bierfassl blasts throw out four flying staves',
  flavourText: 'The keg goes quiet. The staves do not.',
  sprite: 'fassldauben',
  pools: ['treasure', 'shop', 'secret'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onBombDetonate: (ctx) => {
      const sim = ctx.sim;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      for (const [dirX, dirY] of DIRECTIONS) {
        sim.spawnItemProjectile(ctx.x, ctx.y, dirX, dirY, { damage });
      }
    },
  },
};
