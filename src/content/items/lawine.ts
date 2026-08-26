import type { ItemDefinition } from '../../sim/item/definition.js';

/** Cooldown between avalanches (60/s), the blast's radius, its damage relative to Stammwürze, and its knockback strength. */
const COOLDOWN_TICKS = 600;
const BLAST_RADIUS = 80;
const DAMAGE_SCALE = 1.8;
const PUSH_STRENGTH = 2.0;

/**
 * Lawine — bring the mountain down on the room. A big, slow-charging active
 * that damages and scatters everything near you at once.
 *
 * Combines `applySplashDamage` and `pushEnemiesNear` in the same call the
 * way `watschn.ts` already does for a *reactive* effect — this is the
 * proactive, `rausch`-gated version, bigger and on a much longer cooldown
 * than either `sonnwendfeuer.ts`'s nova (damage only) or `jagdhorn.ts`'s
 * pull (crowd control only).
 */
export const lawine: ItemDefinition = {
  id: 'lawine',
  name: 'Lawine',
  description: 'Active: a big blast of damage and knockback around you',
  flavourText: 'The Bergwacht has a pamphlet about this. Nobody reads it until afterward.',
  sprite: 'lawine',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'rausch',
  active: { maxCharge: COOLDOWN_TICKS },
  hooks: {
    onActivate: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const x = sim.positionX(playerIndex);
      const y = sim.positionY(playerIndex);
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.applySplashDamage(x, y, BLAST_RADIUS, damage, playerIndex);
      sim.pushEnemiesNear(x, y, BLAST_RADIUS, PUSH_STRENGTH);
    },
    onTick: (ctx) => {
      ctx.sim.chargeActiveItem(ctx.itemId, 1);
    },
  },
};
