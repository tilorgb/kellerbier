import type { ItemDefinition } from '../../sim/item/definition.js';

/** Hits between a proc, and how long the burn it applies lasts. */
const HITS_PER_PROC = 4;
const BURN_TICKS = 60;

/**
 * Kerzenwachs — dripping wax from Floor 5's `Kerzenleuchter`
 * (`docs/CONTENT_BIBLE.md` §2), which "drops wax pools that burn." Every
 * few hits, one lands hot: the wax catches regardless of what tag the
 * shot itself was carrying.
 *
 * `onHit` sets `burn` directly through `applyStatusEffect` rather than
 * granting the `burning` projectile tag (`alpengluehen.ts`'s own
 * approach) — a guaranteed proc every `HITS_PER_PROC`th landed hit, not a
 * chance carried by every shot.
 */
export const kerzenwachs: ItemDefinition = {
  id: 'kerzenwachs',
  name: 'Kerzenwachs',
  description: `Every ${String(HITS_PER_PROC)}th hit sets its target alight`,
  flavourText: 'The candelabra has not been re-lit by staff in three centuries. It manages anyway.',
  sprite: 'kerzenwachs',
  pools: ['treasure', 'shop', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onHit: (ctx) => {
      const state = ctx.state;
      state.charge += 1;
      if (state.charge < HITS_PER_PROC) {
        return;
      }
      state.charge = 0;
      ctx.sim.applyStatusEffect(ctx.target, 'burn', BURN_TICKS);
    },
  },
};
