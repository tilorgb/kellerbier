import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Pfeitinger Ultrabräu — "Schied ei!" The Schlauch stops spraying and fires a
 * laser instead: hold the trigger to wind it up, let go to fire a beam that
 * goes through everything in its line for two and a half times your damage.
 * Let go too early and it fizzles. Fire Rate shortens the wind-up.
 *
 * The behaviour lives in `sim/systems/laser-shot.ts` — it replaces how the
 * trigger works rather than hooking a shot, so there is nothing for a hook to
 * do here. The charge meter at the nozzle and the beam itself are drawn by
 * `render/laser-beam-view.ts`.
 */
export const pfeitingerUltrabraeu: ItemDefinition = {
  id: 'pfeitinger-ultrabraeu',
  name: 'Pfeitinger Ultrabräu',
  description: 'items.pfeitinger-ultrabraeu.description',
  flavourText: 'items.pfeitinger-ultrabraeu.flavourText',
  sprite: 'pfeitinger-ultrabraeu',
  pools: ['treasure', 'shop', 'boss'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    // Losing it (the Losbrunnen can take a held item back) must not leave a half-charged beam
    // behind to fire from the next trigger pull.
    onRemove: (ctx) => {
      ctx.sim.laserCharge = 0;
    },
  },
};
