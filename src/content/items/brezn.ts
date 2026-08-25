import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * `orbiting` (#27) circles a shot's fixed spawn point, not a moving anchor —
 * there is no "follow the player" tag, only "follow where you were fired
 * from." A held familiar has to track the player, so Brezn re-fires its
 * pretzel around the player's *current* position this often rather than
 * once — short enough that the drift between refreshes barely reads, long
 * enough not to spawn a projectile every tick for something that never
 * actually leaves play.
 */
const REFRESH_TICKS = 30;
const DAMAGE_SCALE = 0.5;

/**
 * Brezn — a pretzel that orbits the player, damaging whatever it touches.
 *
 * `piercing` rides along with `orbiting` so one pretzel survives several
 * contacts between refreshes instead of vanishing on the first enemy it
 * grazes — `sim/projectile/tags.ts`'s composition rules are what let the two
 * stack without this item knowing anything about how `orbiting` itself
 * works.
 */
export const brezn: ItemDefinition = {
  id: 'brezn',
  name: 'Brezn',
  description: 'An orbiting pretzel that damages enemies on contact',
  flavourText: 'Lightly salted. Heavily weaponised.',
  sprite: 'brezn',
  pools: ['treasure', 'shop'],
  quality: 1,
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
      sim.addProjectileTag(slot, 'piercing');
    },
  },
};
