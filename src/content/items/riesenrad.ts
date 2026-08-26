import type { ItemDefinition } from '../../sim/item/definition.js';

/** How often the gondola re-fires around the player, and its damage share. */
const REFRESH_TICKS = 60;
const DAMAGE_SCALE = 0.9;

/**
 * Riesenrad — the Wiesn's Ferris wheel, "officially rated for six people."
 * `brezn.ts`'s own orbiting-familiar shape, tuned the other way: wider,
 * slower, hits harder, and freezes rather than pierces — a second orbital
 * for a build that wants one but already has a pretzel.
 */
export const riesenrad: ItemDefinition = {
  id: 'riesenrad',
  name: 'Riesenrad',
  description: 'A slow-orbiting gondola that damages and freezes on contact',
  flavourText: 'Officially rated for six people. You are, at this point, the only one who fits.',
  sprite: 'riesenrad',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.timer = REFRESH_TICKS;
    },
    onTick: (ctx) => {
      const state = ctx.state;
      state.timer -= 1;
      if (state.timer > 0) {
        return;
      }
      state.timer = REFRESH_TICKS;
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const x = sim.positionX(playerIndex);
      const y = sim.positionY(playerIndex);
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      const slot = sim.spawnItemProjectile(x, y, 1, 0, { damage });
      if (slot < 0) {
        return;
      }
      sim.addProjectileTag(slot, 'orbiting');
      sim.addProjectileTag(slot, 'freezing');
    },
  },
};
