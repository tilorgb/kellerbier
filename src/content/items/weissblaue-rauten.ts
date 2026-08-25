import type { ItemDefinition } from '../../sim/item/definition.js';

/** Shots between a lozenge burst, and the four angles it fans out at (up/down/left/right of the aimed line — the Bavarian flag's diamond crossing). */
const SHOTS_PER_BURST = 8;
const BURST_OFFSETS_RADIANS = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, -(3 * Math.PI) / 4];

/**
 * Weiß-blaue Rauten — the white-and-blue lozenge pattern. Every eighth shot
 * is joined by four more, fanned out into the diamond crossing the pattern
 * is named for.
 *
 * `state.charge` counts shots fired since the last burst — safe to borrow
 * for a passive item, the same convention `lederhosn.ts` uses for its shield
 * flag. `onShoot` runs before the primary shot exists (see `spezi.ts`), so
 * the burst is spawned here rather than from `onProjectileSpawn`.
 */
export const weissblaueRauten: ItemDefinition = {
  id: 'weissblaue-rauten',
  name: 'Weiß-blaue Rauten',
  description: 'Every eighth shot fires four extra in a lozenge pattern',
  flavourText:
    'A folk motif, not a coat of arms — and every soul in the Wiesn knows the difference.',
  sprite: 'weissblaue-rauten',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onShoot: (ctx) => {
      const state = ctx.state;
      state.charge += 1;
      if (state.charge < SHOTS_PER_BURST) {
        return;
      }
      state.charge = 0;
      const sim = ctx.sim;
      const tuning = sim.tuning.shooting;
      const baseAngle = Math.atan2(ctx.directionY, ctx.directionX);
      const playerIndex = sim.playerIndex;
      const centreX = sim.positionX(playerIndex);
      const centreY = sim.positionY(playerIndex);
      for (const offset of BURST_OFFSETS_RADIANS) {
        const angle = baseAngle + offset;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        sim.spawnItemProjectile(
          centreX + dirX * tuning.muzzleOffset,
          centreY + dirY * tuning.muzzleOffset,
          dirX,
          dirY,
        );
      }
    },
  },
};
