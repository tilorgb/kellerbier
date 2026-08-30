import type { ItemDefinition } from '../../sim/item/definition.js';

/** Trinkfest levels one copy costs, and the fire-rate perk it trades for. */
const TRINKFEST_LOSS = 1;
const SCHLUCKFREQUENZ_MULTIPLIER = 1 / 1.1;

/**
 * Halbe Portion — a lightweight, in the old Bavarian sense of someone who
 * cannot hold much. Lowers Trinkfest (#92) while held: Umgfalln arrives
 * sooner, which is a real cost, offset by a small permanent fire-rate perk —
 * #92's "may be useful when the player wants to avoid severe distortion or
 * is pursuing a sober/precision build" made concrete rather than left as a
 * pure downgrade nobody would ever pick up.
 *
 * The `onPickup`/`onRemove` pairing mirrors `bierbauch.ts` exactly, just
 * signed the other way — see that file's comment for why this undoes a
 * fixed `TRINKFEST_LOSS` rather than a banked delta.
 */
export const halbePortion: ItemDefinition = {
  id: 'halbe-portion',
  name: 'Halbe Portion',
  description: 'Trinkfest -1 while held. Schluckfrequenz +10%',
  flavourText: 'Two Radler in and already asking where the toilet is.',
  sprite: 'halbe-portion',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  // No tier gate — but it is Promille machinery all the same (sells Trinkfest for Schluckfrequenz),
  // so a sober run never offers it (#85).
  needsPromille: true,
  hooks: {
    modifyStats: () => [
      { stat: 'schluckfrequenz', op: 'multiply', value: SCHLUCKFREQUENZ_MULTIPLIER },
    ],
    onPickup: (ctx) => {
      if (ctx.state.count === 1) {
        ctx.sim.lowerTrinkfest(TRINKFEST_LOSS);
      }
    },
    onRemove: (ctx) => {
      ctx.sim.raiseTrinkfest(TRINKFEST_LOSS);
    },
  },
};
