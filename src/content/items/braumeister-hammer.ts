import type { ItemDefinition } from '../../sim/item/definition.js';

/** Shockwave radius and push strength on a kill. */
const SHOCKWAVE_RADIUS = 60;
const SHOCKWAVE_STRENGTH = 1.6;

/**
 * Braumeister-Hammer — the third piece of the Braumeister set (#137),
 * alongside `braumeister-visier.ts` (already in the game) and
 * `braumeister-schuerze.ts`. The tool he keeps at his belt for a cask that
 * will not tap the easy way. Every kill sends a shockwave through whatever
 * else is standing near it.
 *
 * Centred on the kill (`ctx.target`'s own position), not the player —
 * `perchtenrute.ts`'s own on-kill push is the precedent this mirrors, just
 * anchored at the body that died rather than at the player, and with no
 * drawback: Perchtenrute is `curse`-pooled and taxes Stammwürze for it,
 * this is a plain reward the way the rest of the set is.
 */
export const braumeisterHammer: ItemDefinition = {
  id: 'braumeister-hammer',
  name: 'Braumeister-Hammer',
  description: 'A kill sends a shockwave through whatever else is nearby',
  flavourText: "The casks that don't tap the easy way meet this instead.",
  sprite: 'braumeister-hammer',
  pools: ['boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onKill: (ctx) => {
      const sim = ctx.sim;
      sim.pushEnemiesNear(
        sim.positionX(ctx.target),
        sim.positionY(ctx.target),
        SHOCKWAVE_RADIUS,
        SHOCKWAVE_STRENGTH,
      );
    },
  },
};
