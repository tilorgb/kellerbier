import type { ItemDefinition } from '../../sim/item/definition.js';

/** Half-Maß a use heals: one full heart container, what a whole Bratwurst pickup is worth. */
export const BRATWURST_HEAL = 2;

/**
 * Bratwurst — "Bratwurst is life." A pocket Bratwurst: press the button to
 * fill one heart container.
 *
 * It does not recharge with time or with rooms. It is re-armed by picking up
 * a Bratwurst off the floor while every container is already full — the one
 * moment a Wurst pickup is otherwise refused and left lying
 * (`sim/systems/pickup.ts`, `GameSim.rearmBratwurst`). Hurt, the pickup heals
 * you as it always did; healthy, it reloads this.
 *
 * Pressing it at full health does nothing and costs nothing.
 */
export const bratwurst: ItemDefinition = {
  id: 'bratwurst',
  name: 'Bratwurst',
  description: 'items.bratwurst.description',
  flavourText: 'items.bratwurst.flavourText',
  sprite: 'bratwurst',
  pools: ['treasure', 'shop'],
  quality: 2,
  promilleRequirement: 'any',
  active: { maxCharge: 1 },
  hooks: {
    onPickup: (ctx) => {
      if (ctx.state.count === 1) {
        ctx.state.charge = 1;
      }
    },
    onActivate: (ctx) => {
      const sim = ctx.sim;
      if (sim.healthPoolFull('red')) {
        ctx.state.charge = 1;
        return;
      }
      sim.addPlayerHealth(BRATWURST_HEAL);
    },
  },
};
