import type { ItemDefinition } from '../../sim/item/definition.js';

/** Recharge (60/s), the spin's reach, and its shove before each body's mass divides it. */
const COOLDOWN_TICKS = 300;
const PUSH_RADIUS = 50;
const PUSH_STRENGTH = 4;

/**
 * Karussell — Floor 7's room-scale rotating hazard (`docs/CONTENT_BIBLE.md`
 * §2), taken for one spin. Use it and everything close is flung outward:
 * enemies and anything else that can be shoved, a latched Zecke thrown off
 * the hat with them. No damage — it buys room to breathe, not a kill.
 *
 * Active, on a five-second recharge, because it used to be a passive that
 * shoved everything near the player away *whenever they moved*: always on,
 * it read as a bug rather than an item — the room's barrels sliding off on
 * their own, a charging Boar mysteriously braking a body-length before it
 * hit. As a button it is a choice the player makes and can see the result of.
 *
 * Mass-scaled (`pushEnemiesNear`'s `byMass`): a Kaninchen flies, a Boar
 * shifts a step, a boss barely notices.
 */
export const karussell: ItemDefinition = {
  id: 'karussell',
  name: 'Karussell',
  description: 'items.karussell.description',
  flavourText: 'items.karussell.flavourText',
  sprite: 'karussell',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  active: { maxCharge: COOLDOWN_TICKS },
  hooks: {
    onActivate: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const x = sim.positionX(playerIndex);
      const y = sim.positionY(playerIndex);
      sim.throwOffLatched();
      sim.pushEnemiesNear(x, y, PUSH_RADIUS, PUSH_STRENGTH, true);
      // The push is invisible on its own — the wind that does it is not.
      sim.windSwirl(x, y, PUSH_RADIUS);
    },
    onTick: (ctx) => {
      ctx.sim.chargeActiveItem(ctx.itemId, 1);
    },
  },
};
