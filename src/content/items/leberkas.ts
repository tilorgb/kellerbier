import type { ItemDefinition } from '../../sim/item/definition.js';

/** A new Semmel every eight seconds while there is still something to fight. */
export const LEBERKAS_SPAWN_TICKS = 480;
/** At most this many lying in the room at once. */
export const LEBERKAS_MAX_IN_ROOM = 3;

/**
 * Leberkas — every lunchtime, without fail. While a fight is on, a
 * Leberkas-Semmel turns up on the floor every eight seconds (three at most).
 * Pick one up and it is thrown from your hand in a high arc at the nearest
 * enemy: three times your damage where it lands, and four more blasts on the
 * diagonals around it at one and a half times (`systems/lobs.ts`).
 *
 * `state.timer` is the clock to the next Semmel. It only runs while enemies
 * remain, so a cleared room is not littered, and it is held at zero on
 * pickup so the first one arrives a full interval after you take the item.
 */
export const leberkas: ItemDefinition = {
  id: 'leberkas',
  name: 'Leberkas',
  description: 'items.leberkas.description',
  flavourText: 'items.leberkas.flavourText',
  sprite: 'leberkas',
  pools: ['treasure', 'shop'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onTick: (ctx) => {
      const sim = ctx.sim;
      const state = ctx.state;
      if (!sim.hasLivingEnemies() || sim.playerDead) {
        state.timer = 0;
        return;
      }
      state.timer += 1;
      if (state.timer < LEBERKAS_SPAWN_TICKS) {
        return;
      }
      if (sim.countPickupsOfKind('leberkas-semmel') < LEBERKAS_MAX_IN_ROOM) {
        sim.spawnPickupAtRandomSpot('leberkas-semmel');
      }
      state.timer = 0;
    },
  },
};
