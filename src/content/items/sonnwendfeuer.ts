import type { ItemDefinition } from '../../sim/item/definition.js';

/** Cooldown between jumps (60/s), the nova's radius, and its damage relative to Stammwürze. */
const COOLDOWN_TICKS = 480;
const NOVA_RADIUS = 64;
const DAMAGE_SCALE = 2.0;

/**
 * Sonnwendfeuer — the solstice bonfire, jumped for luck. Every jump lets off
 * a burst of heat around you.
 *
 * The first active item in the roster whose `onActivate` deals damage rather
 * than buffing or healing — `feuerwasser.ts`, `enzian.ts` and
 * `masskrugstemmen.ts`'s active-adjacent charge mechanic are all
 * self-targeted. Not `consumable`: a bonfire gets jumped more than once a
 * run, it just needs to build back up first — the same non-consumable,
 * `chargeActiveItem`-refilled shape `enzian.ts` already uses for its own
 * cooldown.
 */
export const sonnwendfeuer: ItemDefinition = {
  id: 'sonnwendfeuer',
  name: 'Sonnwendfeuer',
  description: 'Active: jump the solstice fire for a burst of damage around you',
  flavourText: 'Jump it and your wish comes true. The wish is usually "please do not catch fire."',
  sprite: 'sonnwendfeuer',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'rausch',
  active: { maxCharge: COOLDOWN_TICKS },
  hooks: {
    onActivate: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.applySplashDamage(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        NOVA_RADIUS,
        damage,
        playerIndex,
      );
    },
    onTick: (ctx) => {
      ctx.sim.chargeActiveItem(ctx.itemId, 1);
    },
  },
};
