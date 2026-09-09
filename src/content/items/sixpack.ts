import type { ItemDefinition, ItemRuntimeState } from '../../sim/item/definition.js';

/** Bottles the carrier holds. Six, because that is what a Tragerl is. */
export const SIXPACK_SLOTS = 6;

/**
 * How much Promille one slot holds — a whole Maß, read live from tuning
 * rather than baked in, the same way `sim/systems/pickup.ts` reads it. A
 * balance pass that changes what a Maß is worth changes what the carrier
 * holds, instead of leaving the two to drift apart.
 */
function slotSize(sim: { tuning: { promille: { massFullAmount: number } } }): number {
  return Math.max(0.01, sim.tuning.promille.massFullAmount);
}

/** Total Promille the carrier can hold. */
export function sixpackCapacity(sim: { tuning: { promille: { massFullAmount: number } } }): number {
  return SIXPACK_SLOTS * slotSize(sim);
}

/**
 * How full the carrier is, in slots — `4.2` means four full bottles and one
 * a fifth of the way up. Read by `render/sixpack-hud.ts` to draw the row and
 * by the status line; the simulation itself only ever deals in Promille.
 */
export function sixpackFilledSlots(
  sim: { tuning: { promille: { massFullAmount: number } } },
  state: Pick<ItemRuntimeState, 'timer'>,
): number {
  return Math.max(0, state.timer) / slotSize(sim);
}

/**
 * Sixpack — the six-bottle carrier you bring back from the shop.
 *
 * **The problem it solves.** Promille is a meter you cannot bank. A Maß on
 * the floor is worth whatever it is worth *the moment you walk over it*, so a
 * player at 4.2 has to leave beer lying there or fall over, and a player who
 * has just been knocked back down to sober has nothing to climb with until
 * the floor drops another one. The meter's own risk/reward (`docs/
 * GAME_DESIGN.md` §5) is a decision about *how drunk to be*, and until this
 * item the player could only make that decision at the instant a pickup
 * happened to be under their feet.
 *
 * **What it does.** Carry it, and a Maß you walk over goes into the carrier
 * instead of down your neck — the HUD row fills a bottle at a time. Press the
 * active-item button to drink one. The Promille arrives exactly when you
 * choose, which is the whole item: bank six Maß through a floor you want to
 * fight sober and cash them in on the boss, or hold one bottle back as
 * insurance against the hit that sobers you at the wrong moment.
 *
 * **Two rules that keep it honest**, both of them the simple version on
 * purpose:
 *
 * - **A Maß that does not fit is drunk, not split.** No partial deposits, no
 *   "store 0.3 and swallow 0.7" — the pack is full, so you drink it, exactly
 *   as you would without the item. That is also the answer to "what happens
 *   when it is full" from the design: nothing new happens, which is the least
 *   surprising thing that could.
 * - **The carrier stores Promille, not bottles.** A half Maß fills half a
 *   slot and a full one fills a whole slot, so nothing is upgraded on the way
 *   in — the alternative, counting bottles, would turn every half Maß into a
 *   full one for free the moment you picked this up.
 *
 * **How it sits on the active-item machinery.** `state.timer` is the Promille
 * in the carrier; `state.charge` is the plain readiness flag `useActiveItem`
 * already understands, kept at `maxCharge` (1) whenever there is anything to
 * pour. Deliberately *not* a cooldown: the limit on this item is how much
 * beer you have found, which is a resource the room hands out, not a timer.
 * A charge bar that filled on its own would be a second, invisible economy
 * competing with the one on screen.
 */
export const sixpack: ItemDefinition = {
  id: 'sixpack',
  name: 'Sixpack',
  description: 'items.sixpack.description',
  flavourText: 'items.sixpack.flavourText',
  sprite: 'sixpack',
  pools: ['treasure', 'shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  // Pure Promille machinery: with no meter in the run there is no Maß to
  // carry and nothing to pour, so it has to say so (#85) even though it needs
  // no particular tier to work.
  needsPromille: true,
  active: { maxCharge: 1 },
  hooks: {
    onBeerOffered: (ctx) => {
      const state = ctx.state;
      const capacity = sixpackCapacity(ctx.sim);
      // The whole Maß or none of it — see the class comment.
      if (state.timer + ctx.amount > capacity + 1e-6) {
        return;
      }
      state.timer += ctx.amount;
      state.charge = 1;
      ctx.sim.claimOfferedBeer();
    },
    onActivate: (ctx) => {
      const state = ctx.state;
      const poured = Math.min(slotSize(ctx.sim), state.timer);
      if (poured <= 0) {
        return;
      }
      state.timer -= poured;
      ctx.sim.addPromille(poured);
      // `useActiveItem` zeroed the charge on the way in; put it back the same
      // tick if there is another bottle, so the button is live again
      // immediately rather than on the next `onTick`.
      state.charge = state.timer > 0 ? 1 : 0;
    },
    onTick: (ctx) => {
      // The authority on readiness, so a carrier filled or emptied by
      // anything other than the two hooks above still reads correctly.
      ctx.state.charge = ctx.state.timer > 0 ? 1 : 0;
    },
  },
  // No `status` reader on purpose, unlike most items whose whole effect is a
  // counter: this one has a HUD row of its own (`render/sixpack-hud.ts`), and
  // two rows on screen counting the same bottles is worse than one. The
  // roster's "every item is visible while held" rule is met by the better of
  // the two readouts, not by both.
};
