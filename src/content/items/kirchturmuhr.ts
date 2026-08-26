import type { ItemDefinition } from '../../sim/item/definition.js';

/** Cooldown (60/s), the freeze's radius, and how long it holds. */
const COOLDOWN_TICKS = 480;
const FREEZE_RADIUS = 100;
const FREEZE_TICKS = 180;

/**
 * Kirchturmuhr — a church clock tower. For three seconds, time stops for
 * everything nearby.
 *
 * `slowEnemiesNear` (added for #59's own `obazda.ts`) is the roster's first
 * *active* use of it — every other active area effect so far
 * (`lawine.ts`, `sonnwendfeuer.ts`, `boellerschmeisser.ts`) reaches for
 * `applySplashDamage`; this is a pure crowd-control button, no damage of
 * its own, the same "pull only" shape `jagdhorn.ts` already established.
 */
export const kirchturmuhr: ItemDefinition = {
  id: 'kirchturmuhr',
  name: 'Kirchturmuhr',
  description: 'Active: freezes every nearby enemy for a few seconds',
  flavourText: 'Rings on the hour. For three seconds, so does everything else.',
  sprite: 'kirchturmuhr',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  active: { maxCharge: COOLDOWN_TICKS },
  hooks: {
    onActivate: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      sim.slowEnemiesNear(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        FREEZE_RADIUS,
        FREEZE_TICKS,
      );
    },
    onTick: (ctx) => {
      ctx.sim.chargeActiveItem(ctx.itemId, 1);
    },
  },
};
