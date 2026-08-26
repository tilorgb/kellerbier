import type { ItemDefinition } from '../../sim/item/definition.js';

/** How far a hit shoves its target, and how hard. */
const PUSH_RADIUS = 44;
const PUSH_STRENGTH = 1.3;

/**
 * Rollfass-Reifen — the hoop off a rolling `Rollfass` barrel
 * (`docs/CONTENT_BIBLE.md` §2). Every hit shoves its target back, the same
 * way the barrel itself sends anything in its path staggering.
 *
 * `pushEnemiesNear` centred on the hit point rather than the player, so this
 * only ever moves what was actually struck — `watschn.ts` is the same
 * primitive centred on the player instead, for a defensive trigger.
 */
export const rollfassReifen: ItemDefinition = {
  id: 'rollfass-reifen',
  name: 'Rollfass-Reifen',
  description: 'Every hit shoves its target back',
  flavourText: 'Rolls downhill enthusiastically. Refuses, on principle, to roll back up.',
  sprite: 'rollfass-reifen',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onHit: (ctx) => {
      ctx.sim.pushEnemiesNear(ctx.hitX, ctx.hitY, PUSH_RADIUS, PUSH_STRENGTH);
    },
  },
};
