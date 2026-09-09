import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Shots between an extra aimed volley, and its damage relative to Damage.
 *
 * Content can only hold translation *keys* (#52's `content-is-data` lint
 * rule bars a value import of `t()` here), so the description's "5" is a
 * hand-authored number in `src/i18n/dictionaries/*.ts` rather than derived
 * from this constant — retune it there too if this ever changes.
 */
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
  description: 'items.braumeister-visier.description',
  flavourText: 'items.braumeister-visier.flavourText',
  sprite: 'braumeister-visier',
  pools: ['shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  // Counting down to the volley, so the fifth shot is something a player
  // times a doorway peek around rather than a surprise.
  status: (ctx) => `volley in ${String(SHOTS_PER_VOLLEY - ctx.state.charge)}`,
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
      const damage = Math.max(1, Math.round(sim.stats.value('damage') * DAMAGE_SCALE));
      const slot = sim.spawnItemProjectile(originX, originY, ctx.directionX, ctx.directionY, {
        damage,
      });
      if (slot >= 0) {
        sim.addProjectileTag(slot, 'piercing');
      }
    },
  },
};
