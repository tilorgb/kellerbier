import type { ItemDefinition } from '../../sim/item/definition.js';

/** The rotation, in order. Index order is arbitrary; only its length (the wrap) matters mechanically. */
const WEATHER = ['burning', 'freezing', 'poison'] as const;

/**
 * Sauwetter — foul, changeable weather. Every shot carries a different
 * status than the last one did.
 *
 * The seed text's own instinct here is "randomly", but no `sim/rng/streams.ts`
 * stream is meant for a gameplay-affecting item roll (`wolpertinger-im-rucksack.ts`
 * and `lebkuchenherz.ts` hit the identical wall for #59's first batch and both
 * ship a fixed cycle instead) — this is the same fix applied to a per-shot
 * roll rather than a per-room or per-floor one. `state.charge` advances once
 * per shot in `onShoot`, and `onProjectileSpawn` reads whatever it currently
 * points at — deliberately *not* incremented inside `onProjectileSpawn`
 * itself, since that hook can in principle fire more than once for a single
 * `onShoot` (a multi-pellet weapon later on, say), and every pellet from one
 * trigger pull should carry the same weather rather than drifting mid-volley.
 */
export const sauwetter: ItemDefinition = {
  id: 'sauwetter',
  name: 'Sauwetter',
  description: 'Shots carry a different status effect every shot: burning, freezing, poison',
  flavourText: 'Four seasons in one afternoon. Occasionally in one minute.',
  sprite: 'sauwetter',
  pools: ['shop', 'boss', 'secret', 'curse'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onShoot: (ctx) => {
      ctx.state.charge += 1;
    },
    onProjectileSpawn: (ctx) => {
      const status = WEATHER[ctx.state.charge % WEATHER.length];
      if (status !== undefined) {
        ctx.sim.addProjectileTag(ctx.projectile, status);
      }
    },
  },
};
