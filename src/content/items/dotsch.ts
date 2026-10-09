import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks of cooldown between rolls: four seconds, charged by time rather than by clearing rooms. */
export const DOTSCH_COOLDOWN_TICKS = 240;
/** Ticks a roll lasts — about a third of a second. */
export const DOTSCH_ROLL_TICKS = 21;
/** Room units a tick: 21 of them is about five body-widths, and over twice running pace (1.62). */
export const DOTSCH_ROLL_SPEED = 3.6;

/**
 * Dotsch — the potato pancake from the Dult. "Dotsch? Dodge!" A dodge roll
 * along the way Alois last walked (the item shows no aim, because a dodge is
 * movement): invulnerable for the whole roll, and through enemies instead of
 * into them. Nothing is damaged by it either.
 *
 * An active item whose charge is a clock. `maxCharge` is the cooldown in
 * ticks, and `onTick` fills it a tick at a time — the roll is a button to
 * mash, not a reward for clearing a room, so it does not wait on one. A room
 * clear still adds its usual charge on top, which at this scale is a couple
 * of ticks and not worth a special case.
 */
export const dotsch: ItemDefinition = {
  id: 'dotsch',
  name: 'Dotsch',
  description: 'items.dotsch.description',
  flavourText: 'items.dotsch.flavourText',
  sprite: 'dotsch',
  pools: ['treasure', 'shop'],
  quality: 2,
  promilleRequirement: 'any',
  active: { maxCharge: DOTSCH_COOLDOWN_TICKS },
  hooks: {
    onPickup: (ctx) => {
      // Ready on pickup: a dodge you have to wait four seconds for, the moment
      // you take it, is a dodge you were not offered.
      if (ctx.state.count === 1) {
        ctx.state.charge = DOTSCH_COOLDOWN_TICKS;
      }
    },
    onTick: (ctx) => {
      ctx.sim.chargeActiveItem(ctx.itemId, 1);
    },
    onActivate: (ctx) => {
      const rolled = ctx.sim.startPlayerRoll(DOTSCH_ROLL_TICKS, DOTSCH_ROLL_SPEED);
      if (!rolled) {
        // Knocked down or already rolling: nothing was spent.
        ctx.state.charge = DOTSCH_COOLDOWN_TICKS;
      }
    },
  },
};
