import type { ItemDefinition } from '../../sim/item/definition.js';

/** Health regained and Promille cost, once per floor. */
const HEAL_AMOUNT = 3;
const PROMILLE_COST = 0.4;

/**
 * Feierabendbier — clocking out, and the first one of the evening. Every
 * new floor, a small heal — paid for the same way every other beer in the
 * game is.
 *
 * Fires once per floor rather than per room (`onFloorStart`, not
 * `onRoomClear`) — a shift's worth of relief, not a room-by-room habit the
 * way `nikolausgabe.ts`'s alternation is.
 */
export const feierabendbier: ItemDefinition = {
  id: 'feierabendbier',
  name: 'Feierabendbier',
  description: 'Heals a little at the start of every floor. Costs a little Promille',
  flavourText: 'Earned the second the shift ends. Not one second before.',
  sprite: 'feierabendbier',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  // No tier gate — but it is Promille machinery all the same (its per-floor heal is paid for in Promille),
  // so a sober run never offers it (#85).
  needsPromille: true,
  hooks: {
    onFloorStart: (ctx) => {
      ctx.sim.addPlayerHealth(HEAL_AMOUNT);
      ctx.sim.addPromille(PROMILLE_COST);
    },
  },
};
