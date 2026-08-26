import type { ItemDefinition } from '../../sim/item/definition.js';

/** Pull radius and per-tick pull strength — strong, since it never stops running. */
const PULL_RADIUS = 140;
const PULL_STRENGTH = 0.5;

/**
 * Kesseltreiben — the old way to hunt: stand still and let the valley come
 * to you. Extra damage, in exchange for continuously dragging every enemy
 * in the room toward you rather than letting you pick your fights. The
 * roster's sixth `curse`-pooled item.
 */
export const kesseltreiben: ItemDefinition = {
  id: 'kesseltreiben',
  name: 'Kesseltreiben',
  description: 'Stammwürze +25%. Continuously pulls every enemy in the room toward you',
  flavourText: 'The old way to hunt: stand still and let the valley come to you.',
  sprite: 'kesseltreiben',
  pools: ['shop', 'boss', 'secret', 'curse'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: 1.25 }],
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
