import type { ItemDefinition } from '../../sim/item/definition.js';

/** The two corruption tags this pact strips and locks out, together. */
const STRIPPED_TAGS = ['rosinen', 'impure'] as const;

/**
 * Sudordnung 1493 — the real Landshut ordinance, twenty-three years earlier
 * than 1516 and stricter, which nobody remembers. `reinheitsgebot-1516.ts`'s
 * strip-and-ban hook, widened to two tags instead of one (#166): every item
 * tagged `rosinen` *or* `impure` is banned from the pool and, if already
 * held, stripped outright. The deep-cut purist's pact — 1516 was already the
 * compromise — so the Damage bonus is bigger to match.
 *
 * Retuned from +65% to +50% alongside 1516's own +50% → +35% (#237), and for
 * the same reason: both numbers were chosen against an *imagined* pool, and
 * the real one now costs something. The gap between the two pacts stays 15
 * points, which is what the extra four `impure` items are worth — a small
 * set, and still the smaller half of what this locks away.
 */
export const sudordnung1493: ItemDefinition = {
  id: 'sudordnung-1493',
  name: 'Sudordnung 1493',
  description: 'Locks out every rosinen and impure item. Damage +50%',
  flavourText: 'Twenty-three years earlier and stricter. Nobody remembers why it lost.',
  sprite: 'sudordnung-1493',
  pools: ['shop', 'boss', 'devil'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'multiply', value: 1.5 }],
    // Same gold as Reinheitsgebot's — the two pacts are one colour on purpose,
    // the older law being the stricter reading of the same rule.
    onProjectileSpawn: (ctx) => {
      ctx.sim.tintProjectile(ctx.projectile, 'gold');
    },
    onPickup: (ctx) => {
      const sim = ctx.sim;
      for (const item of sim.items.all) {
        if (!STRIPPED_TAGS.some((tag) => item.tags.includes(tag))) {
          continue;
        }
        sim.banItemFromPool(item.id);
        const index = sim.items.indexOf(item.id);
        while (sim.inventory.has(index)) {
          sim.removeItem(item.id);
        }
      }
    },
  },
};
