import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks between bites (60/s), the radius the bite reaches, and its damage scale off Stammwürze. */
const BITE_INTERVAL_TICKS = 90;
const BITE_RADIUS = 20;
const DAMAGE_SCALE = 0.75;

/**
 * Wadlbeißer — a Dackel familiar that bites ankles. Every couple of seconds
 * it takes a snap at whatever is standing close to the player.
 *
 * `ctx.sim.applySplashDamage` centred on the player is the bite: an area hit
 * rather than a projectile, since there is nothing to aim — the dog just
 * bites whoever is there.
 */
export const wadlbeisser: ItemDefinition = {
  id: 'wadlbeisser',
  name: 'Wadlbeißer',
  description: 'Familiar dog that bites nearby enemies every couple of seconds',
  flavourText: 'Twelve centimetres of shoulder height. Zero centimetres of restraint.',
  sprite: 'wadlbeisser',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.timer = BITE_INTERVAL_TICKS;
    },
    onTick: (ctx) => {
      const state = ctx.state;
      state.timer -= 1;
      if (state.timer > 0) {
        return;
      }
      state.timer = BITE_INTERVAL_TICKS;
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.applySplashDamage(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        BITE_RADIUS,
        damage,
        playerIndex,
      );
    },
  },
};
