import type { ItemDefinition } from '../../sim/item/definition.js';

/** Cooldown (60/s) and how long the guided-aim window lasts once sounded. */
const COOLDOWN_TICKS = 540;
const BUFF_TICKS = 300;

/**
 * Wilde-Gjoad-Horn — a horn out of `Die Wilde Gjoad`
 * (`docs/CONTENT_BIBLE.md` §3), the Wild Hunt's procession sweeping the
 * arena on a fixed path while the huntsman is fought in the gaps. Sound it,
 * and for a few seconds your own shots hunt exactly the way theirs do.
 *
 * `state.timer` is the buff window, independent of `state.charge` (the
 * ordinary cooldown meter `useActiveItem` already understands) — unlike
 * `enzian.ts`'s dual-purpose `charge`, the two never need to share one
 * field here, so `onTick` can call `chargeActiveItem` unconditionally every
 * tick the same way `jagdhorn.ts` and `lawine.ts` already do.
 */
export const wildeGjoadHorn: ItemDefinition = {
  id: 'wilde-gjoad-horn',
  name: 'Wilde-Gjoad-Horn',
  description: 'Active: shots home in on enemies for a few seconds',
  flavourText: 'The Hunt never misses. Borrow that, briefly, at your own risk.',
  sprite: 'wilde-gjoad-horn',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'rausch',
  active: { maxCharge: COOLDOWN_TICKS },
  hooks: {
    onActivate: (ctx) => {
      ctx.state.timer = BUFF_TICKS;
    },
    onProjectileSpawn: (ctx) => {
      if (ctx.state.timer > 0) {
        ctx.sim.addProjectileTag(ctx.projectile, 'homing');
      }
    },
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.timer > 0) {
        state.timer -= 1;
      }
      ctx.sim.chargeActiveItem(ctx.itemId, 1);
    },
  },
};
