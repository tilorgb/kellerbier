import type { ItemDefinition } from '../../sim/item/definition.js';

/** Cooldown (60/s) and how long the burning window lasts once triggered. */
const COOLDOWN_TICKS = 540;
const BUFF_TICKS = 300;

/**
 * Feuerschlucker — a Wiesn fire eater. Swallows the flame for the crowd,
 * exhales it into your shots for a few seconds instead.
 *
 * The same buff-window shape `wilde-gjoad-horn.ts` already established —
 * `state.timer` independent of the engine-owned `state.charge` cooldown, so
 * `onTick` can unconditionally charge every tick — just paying out `burning`
 * instead of `homing`.
 */
export const feuerschlucker: ItemDefinition = {
  id: 'feuerschlucker',
  name: 'Feuerschlucker',
  description: 'Active: shots burn on hit for a few seconds',
  flavourText: 'Swallows fire for the crowd. Exhales it into you, mechanically speaking.',
  sprite: 'feuerschlucker',
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
        ctx.sim.addProjectileTag(ctx.projectile, 'burning');
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
