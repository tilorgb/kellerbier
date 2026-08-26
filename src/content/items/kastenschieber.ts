import type { ItemDefinition } from '../../sim/item/definition.js';

/** Push radius and strength on a hit taken. */
const PUSH_RADIUS = 64;
const PUSH_STRENGTH = 1.6;

/**
 * Kastenschieber — a crate, shoved between you and whatever hits you.
 * Getting hit scatters everything nearby, no damage of its own — pure
 * breathing room rather than `watschn.ts`'s retaliation.
 */
export const kastenschieber: ItemDefinition = {
  id: 'kastenschieber',
  name: 'Kastenschieber',
  description: 'Getting hit shoves every nearby enemy back',
  flavourText:
    'The crate is empty. The crate has always been empty. Nobody asks why he carries it.',
  sprite: 'kastenschieber',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onDamageTaken: (ctx) => {
      if (ctx.amount <= 0) {
        return;
      }
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      sim.pushEnemiesNear(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        PUSH_RADIUS,
        PUSH_STRENGTH,
      );
    },
  },
};
