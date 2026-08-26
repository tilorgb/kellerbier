import type { ItemDefinition } from '../../sim/item/definition.js';

/** The burst's radius, and its damage relative to Stammwürze. */
const BURST_RADIUS = 36;
const DAMAGE_SCALE = 0.4;

/**
 * Schimmelsplitter — a shard of the Keller's mould, `Schimmelfleck`
 * (`docs/CONTENT_BIBLE.md` §2) splitting into smaller blobs when killed,
 * turned into an item: your own kills leave the same parting shot behind.
 *
 * Fires from `dispatchItemKill` (`sim/systems/impact.ts`), which runs before
 * `sim.kill` removes the target — `sim.positionX`/`positionY` on `ctx.target`
 * are still the entity's last real position at that point.
 */
export const schimmelsplitter: ItemDefinition = {
  id: 'schimmelsplitter',
  name: 'Schimmelsplitter',
  description: 'Kills release a small burst of damage where they died',
  flavourText: 'It kept spreading after it died. That part was already true before you found this.',
  sprite: 'schimmelsplitter',
  pools: ['treasure', 'shop', 'boss'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    onKill: (ctx) => {
      const sim = ctx.sim;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.applySplashDamage(
        sim.positionX(ctx.target),
        sim.positionY(ctx.target),
        BURST_RADIUS,
        damage,
      );
    },
  },
};
