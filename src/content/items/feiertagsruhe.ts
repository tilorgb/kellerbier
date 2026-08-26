import type { ItemDefinition } from '../../sim/item/definition.js';

/** Invulnerability ticks (60/s) granted at the start of every floor. */
const INVULNERABILITY_TICKS = 120;

/**
 * Feiertagsruhe — public-holiday quiet. Everything is closed; for one floor,
 * so is harm. `sober`-gated, like `almhuettn-feuer.ts` and `nachtwache.ts`:
 * a clean start is a sober-run reward here too.
 */
export const feiertagsruhe: ItemDefinition = {
  id: 'feiertagsruhe',
  name: 'Feiertagsruhe',
  description: 'Sober. Grants 2 seconds of invulnerability at the start of every floor',
  flavourText: 'Everything is closed today. For one floor, so is harm.',
  sprite: 'feiertagsruhe',
  pools: ['treasure', 'shop', 'secret'],
  quality: 1,
  promilleRequirement: 'sober',
  hooks: {
    onFloorStart: (ctx) => {
      ctx.sim.makePlayerInvulnerable(INVULNERABILITY_TICKS);
    },
  },
};
