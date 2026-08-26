import type { ItemDefinition } from '../../sim/item/definition.js';

/** Freeze duration a hit applies, in ticks (60/s). */
const FREEZE_TICKS = 45;

/**
 * Waldschrat-Knüppel — a log off the `Waldschrat`'s own throw
 * (`docs/CONTENT_BIBLE.md` §2). Every hit lands with enough weight to slow
 * whatever it struck.
 *
 * The roster's first item to call `applyStatusEffect` directly from a hook
 * rather than granting a projectile tag (`sauwetter.ts`, `alpengluehen.ts`)
 * — a per-hit guarantee rather than something riding a shot that might miss,
 * the same distinction `docs/GAME_DESIGN.md` draws between the two paths.
 */
export const waldschratKnueppel: ItemDefinition = {
  id: 'waldschrat-knueppel',
  name: 'Waldschrat-Knüppel',
  description: 'Hits briefly freeze their target',
  flavourText: 'He only ever throws the one log. He has never once needed a second.',
  sprite: 'waldschrat-knueppel',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onHit: (ctx) => {
      ctx.sim.applyStatusEffect(ctx.target, 'freeze', FREEZE_TICKS);
    },
  },
};
