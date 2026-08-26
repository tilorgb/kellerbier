import type { ItemDefinition } from '../../sim/item/definition.js';

/** Cooldown between calls (60/s), and the pull's radius and strength. */
const COOLDOWN_TICKS = 300;
const PULL_RADIUS = 120;
const PULL_STRENGTH = 0.9;

/**
 * Jagdhorn — a hunting horn, sounded to call the hounds and the quarry
 * both. Every use hauls everything nearby in close, ready for whatever
 * hits next.
 *
 * A pure setup item — no damage of its own, `pullEnemiesNear` (added for
 * #59's own `fingerhakeln.ts`) doing the entire job — deliberately built
 * to combo with anything that pays off a crowd already standing close:
 * `sonnwendfeuer.ts`'s nova, `watschn.ts`'s retaliation,
 * `schuhplattler.ts`'s shockwave. The fuzz harness (#30) is what will
 * actually surface how strong that combo gets, not this file.
 */
export const jagdhorn: ItemDefinition = {
  id: 'jagdhorn',
  name: 'Jagdhorn',
  description: 'Active: pulls every nearby enemy toward you',
  flavourText: 'Every hunter in the valley owns one. Every hunter in the valley denies this.',
  sprite: 'jagdhorn',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  active: { maxCharge: COOLDOWN_TICKS },
  hooks: {
    onActivate: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      sim.pullEnemiesNear(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        PULL_RADIUS,
        PULL_STRENGTH,
      );
    },
    onTick: (ctx) => {
      ctx.sim.chargeActiveItem(ctx.itemId, 1);
    },
  },
};
