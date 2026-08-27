import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Haferlschuh — a nailed leather shoe, built for grip. Flat move speed, plus
 * the traction the seed text always meant: immune to Floor 1's slick-puddle
 * hazard (#35).
 *
 * `onTick` refreshes the immunity every tick it is held rather than granting
 * it once on pickup — the same "held near, not owned once" shape
 * `slowEnemiesNear`'s aura already uses, and it means losing the item mid-run
 * (an item removed rather than a rule this game has today, but the contract
 * `ItemHooks` documents) lets the puddle bite again within a tick or two
 * instead of forever.
 */
const GRIP_TICKS = 2;

export const haferlschuh: ItemDefinition = {
  id: 'haferlschuh',
  name: 'Haferlschuh',
  description: 'Move speed +15%, immune to slick puddles',
  flavourText: 'Every nail hand-driven by someone who takes this far too seriously.',
  sprite: 'haferlschuh',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'gschwindigkeit', op: 'multiply', value: 1.15 }],
    onTick: (ctx) => {
      ctx.sim.puddleImmuneTicks = Math.max(ctx.sim.puddleImmuneTicks, GRIP_TICKS);
    },
  },
};
