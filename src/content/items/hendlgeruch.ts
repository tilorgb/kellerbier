import type { ItemDefinition } from '../../sim/item/definition.js';

/** Pull radius and per-tick pull strength — gentle, since it never stops running. */
const PULL_RADIUS = 100;
const PULL_STRENGTH = 0.15;

/**
 * Hendlgeruch — the smell of a rotisserie chicken, carrying for a kilometre
 * across the Wiesn. Constantly drags distant enemies toward you — a mild,
 * always-on version of `jagdhorn.ts`'s on-demand pull, deliberately weaker
 * per tick since it never has a cooldown to earn its keep.
 */
export const hendlgeruch: ItemDefinition = {
  id: 'hendlgeruch',
  name: 'Hendlgeruch',
  description: 'Constantly pulls distant enemies toward you',
  flavourText: 'Carries for a kilometre. Everyone within a kilometre now has plans.',
  sprite: 'hendlgeruch',
  pools: ['treasure', 'shop', 'secret'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onTick: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      sim.pullEnemiesNear(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        PULL_RADIUS,
        PULL_STRENGTH,
      );
    },
  },
};
