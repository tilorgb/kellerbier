import type { ItemDefinition } from '../../sim/item/definition.js';

/** How much Range the raisin costs while the drawback is live. */
const RANGE_MULTIPLIER = 0.8;

/**
 * Rosinenbrot — the loaf with the raisins in it. Every shot punches through
 * the first thing it hits and keeps going; the dough is heavier for it, so
 * nothing flies as far.
 *
 * The `rosinen` shape (`docs/GAME_DESIGN.md` §8) at its plainest: a clean
 * effect (piercing shots), one legible cost (Range), stated in the
 * description and never delayed. The Rosinenklauber convention is the same
 * one `apfelkuchen-mit-rosinen.ts` documents — `state.charge` is the
 * suppression flag, owned by `der-rosinenklauber.ts`, and never used by a
 * `rosinen` item for anything else.
 */
export const rosinenbrot: ItemDefinition = {
  id: 'rosinenbrot',
  name: 'Rosinenbrot',
  description: 'Shots pierce one extra enemy. Range -20%',
  flavourText: 'Somebody picks them out. Somebody always picks them out.',
  sprite: 'rosinenbrot',
  pools: ['treasure', 'shop'],
  quality: 1,
  promilleRequirement: 'any',
  tags: ['rosinen'],
  hooks: {
    modifyStats: (state) =>
      state.charge > 0 ? [] : [{ stat: 'range', op: 'multiply', value: RANGE_MULTIPLIER }],
    onProjectileSpawn: (ctx) => {
      ctx.sim.addProjectileTag(ctx.projectile, 'piercing');
      ctx.sim.tintProjectile(ctx.projectile, 'rosine');
    },
  },
};
