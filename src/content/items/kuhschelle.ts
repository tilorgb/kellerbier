import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks between rings (60/s), the ring's radius, and how long its slow lasts. */
const RING_INTERVAL_TICKS = 150;
const RING_RADIUS = 56;
const SLOW_TICKS = 45;

/**
 * Kuhschelle — a cowbell, carried along. Every couple of seconds it rings,
 * and the whole herd within earshot slows to a stop.
 *
 * `slowEnemiesNear` (added for #29's Obazda) is a continuous per-tick aura
 * there; this item fires it once, in a burst, on a timer — the same
 * "one-shot pulse from a `*Near` helper" shape `schuhplattler.ts`'s shockwave
 * already uses for damage instead of slow.
 */
export const kuhschelle: ItemDefinition = {
  id: 'kuhschelle',
  name: 'Kuhschelle',
  description: 'Rings every few seconds, slowing every enemy within earshot',
  flavourText: 'One bell. Every animal within a kilometre now knows where you are.',
  sprite: 'kuhschelle',
  pools: ['treasure', 'shop', 'secret'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.timer = RING_INTERVAL_TICKS;
    },
    onTick: (ctx) => {
      const state = ctx.state;
      state.timer -= 1;
      if (state.timer > 0) {
        return;
      }
      state.timer = RING_INTERVAL_TICKS;
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      sim.slowEnemiesNear(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        RING_RADIUS,
        SLOW_TICKS,
      );
    },
  },
};
