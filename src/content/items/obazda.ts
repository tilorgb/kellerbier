import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks between puddles (2.5 s), a puddle's radius, and how long it lasts (10 s) — about four down at once. */
export const DROP_INTERVAL_TICKS = 150;
export const PUDDLE_RADIUS = 16;
export const PUDDLE_LIFETIME_TICKS = 600;

/**
 * Obazda — a cheese spread, thick and clinging. Every couple of seconds Alois
 * lets a dollop of it fall where he stands, and it stays there: enemies that
 * wade through the puddles are slowed (`sim/hazard/cheese.ts`). Walk a route
 * and you leave a trail they have to cross.
 *
 * `state.timer` is the ticks until the next drop.
 */
export const obazda: ItemDefinition = {
  id: 'obazda',
  name: 'Obazda',
  description: 'items.obazda.description',
  flavourText: 'items.obazda.flavourText',
  sprite: 'obazda',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.timer = DROP_INTERVAL_TICKS;
    },
    onTick: (ctx) => {
      const state = ctx.state;
      state.timer -= 1;
      if (state.timer > 0) {
        return;
      }
      state.timer = DROP_INTERVAL_TICKS;
      const sim = ctx.sim;
      const player = sim.playerIndex;
      sim.dropCheesePuddle(
        sim.positionX(player),
        sim.positionY(player),
        PUDDLE_RADIUS,
        PUDDLE_LIFETIME_TICKS,
      );
    },
  },
};
