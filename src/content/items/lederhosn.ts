import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Lederhosn — never washed, never fails. Absorbs the next hit taken each
 * room outright.
 *
 * `state.charge` is repurposed as a plain 0/1 shield flag (nothing about
 * this item is an active item, so nothing else contends for it): 1 means the
 * shield is up. `onDamageTaken` refunds the health just lost — the closest a
 * hook this late in the damage pipeline can get to "the hit never happened,"
 * since by the time it fires the health has already been spent. Refreshed on
 * pickup and again every time a room is cleared, so a fresh shield is always
 * waiting for the next fight.
 */
export const lederhosn: ItemDefinition = {
  id: 'lederhosn',
  name: 'Lederhosn',
  description: 'items.lederhosn.description',
  flavourText: 'items.lederhosn.flavourText',
  sprite: 'lederhosn',
  pools: ['treasure', 'shop'],
  quality: 2,
  promilleRequirement: 'any',
  // Whether the next hit is free — the one thing a player holding this
  // decides their next dodge on, and the one thing nothing on screen showed.
  status: (ctx) => (ctx.state.charge > 0 ? 'will take the next hit' : 'spent until room clear'),
  hooks: {
    onPickup: (ctx) => {
      ctx.state.charge = 1;
    },
    onRoomClear: (ctx) => {
      ctx.state.charge = 1;
    },
    onDamageTaken: (ctx) => {
      if (ctx.state.charge <= 0 || ctx.amount <= 0) {
        return;
      }
      ctx.state.charge = 0;
      ctx.sim.addPlayerHealth(ctx.amount);
    },
  },
};
