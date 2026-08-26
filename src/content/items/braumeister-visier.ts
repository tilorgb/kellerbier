import type { ItemDefinition } from '../../sim/item/definition.js';

/** Shots between an extra aimed volley, and its damage relative to Stammwürze. */
const SHOTS_PER_VOLLEY = 5;
const DAMAGE_SCALE = 0.7;

/**
 * Braumeister-Visier — sighted the way `Braumeister` (Floor 6's first
 * genuinely competent enemy, `docs/CONTENT_BIBLE.md` §2) aims: precise
 * rather than sprayed. Every fifth shot is joined by a second, aimed
 * exactly the same way.
 *
 * `state.charge` counts shots fired in `onShoot`, the same counter shape
 * `sauwetter.ts` uses for its own per-shot cycle — the first item to spend
 * that count on an extra shot instead of a tag. The origin math mirrors
 * `spezi.ts`'s own companion shot exactly (muzzle-offset from the player,
 * along the aimed direction) rather than diverging from it, since this
 * volley is meant to read as the *same* shot, not a second one.
 */
export const braumeisterVisier: ItemDefinition = {
  id: 'braumeister-visier',
  name: 'Braumeister-Visier',
  description: `Every ${String(SHOTS_PER_VOLLEY)}th shot fires an extra, piercing volley`,
  flavourText: 'He has fired the same shot ten thousand times. It has never once missed.',
  sprite: 'braumeister-visier',
  pools: ['shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onShoot: (ctx) => {
      const state = ctx.state;
      state.charge += 1;
      if (state.charge < SHOTS_PER_VOLLEY) {
        return;
      }
      state.charge = 0;
      const sim = ctx.sim;
      const tuning = sim.tuning.shooting;
      const playerIndex = sim.playerIndex;
      const originX = sim.positionX(playerIndex) + ctx.directionX * tuning.muzzleOffset;
      const originY = sim.positionY(playerIndex) + ctx.directionY * tuning.muzzleOffset;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      const slot = sim.spawnItemProjectile(originX, originY, ctx.directionX, ctx.directionY, {
        damage,
      });
      if (slot >= 0) {
        sim.addProjectileTag(slot, 'piercing');
      }
    },
  },
};
