import type { ItemDefinition } from '../../sim/item/definition.js';

/** Damage multiplier the telegraphed opening shot gets. */
const BONUS_MULTIPLIER = 1.8;

/**
 * Bauern-Mistgabel — the `Bauer`'s pitchfork lunge (`docs/CONTENT_BIBLE.md`
 * §2), "telegraph before the lunge" turned into a player-side reward rather
 * than a tell to dodge: the first shot fired in a fresh room hits harder,
 * exactly the way a lunge that has been wound up lands harder than a jab.
 *
 * `state.charge` is a plain ready flag (1 = armed), set on pickup and again
 * on every room clear; `onProjectileSpawn` is where the bonus actually lands
 * because that is the first hook that sees the fired shot's own damage
 * field, not `onShoot`.
 */
export const bauernMistgabel: ItemDefinition = {
  id: 'bauern-mistgabel',
  name: 'Bauern-Mistgabel',
  description: 'The first shot fired in every room deals bonus damage',
  flavourText: 'Telegraphs the whole thing from a mile off. Still works every single time.',
  sprite: 'bauern-mistgabel',
  pools: ['treasure', 'shop', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.charge = 1;
    },
    onRoomClear: (ctx) => {
      ctx.state.charge = 1;
    },
    onProjectileSpawn: (ctx) => {
      const state = ctx.state;
      if (state.charge <= 0) {
        return;
      }
      state.charge = 0;
      const projectiles = ctx.sim.projectiles;
      projectiles.damage[ctx.projectile] = Math.round(
        (projectiles.damage[ctx.projectile] ?? 0) * BONUS_MULTIPLIER,
      );
    },
  },
};
