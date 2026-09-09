import type { ItemDefinition } from '../../sim/item/definition.js';

/** Radians each outer pour sits off the aimed one — a visible fan, not a spread pattern that reads as inaccuracy. */
const FAN_SPREAD_RADIANS = 0.28;
const DAMAGE_MULTIPLIER = 0.7;

/**
 * Braumeister-Schürze — the brewmaster pours three at once and never
 * spills. Every shot is a fan of three: the aimed one and one either side.
 *
 * The two extra pours are spawned in `onShoot` (before the aimed shot
 * exists — `spezi.ts`'s reasoning), tinted `schaum` so the player can see
 * which two the apron added, and `modifyStats` takes 30% off every shot so
 * a fan is a real gain up close (2.1x on one body) that thins out at range.
 * Was "Damage +0.2" — the exact "+1 damage" filler `docs/GAME_DESIGN.md` §8
 * bans, on an item whose name promised a brewmaster.
 */
export const braumeisterSchuerze: ItemDefinition = {
  id: 'braumeister-schuerze',
  name: 'Braumeister-Schürze',
  description: 'items.braumeister-schuerze.description',
  flavourText: 'items.braumeister-schuerze.flavourText',
  sprite: 'braumeister-schuerze',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'damage', op: 'multiply', value: DAMAGE_MULTIPLIER }],
    onShoot: (ctx) => {
      const sim = ctx.sim;
      const tuning = sim.tuning.shooting;
      const playerIndex = sim.playerIndex;
      const baseAngle = Math.atan2(ctx.directionY, ctx.directionX);
      for (const side of [-1, 1]) {
        const angle = baseAngle + side * FAN_SPREAD_RADIANS;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const slot = sim.spawnItemProjectile(
          sim.positionX(playerIndex) + dirX * tuning.muzzleOffset,
          sim.positionY(playerIndex) + dirY * tuning.muzzleOffset,
          dirX,
          dirY,
        );
        if (slot >= 0) {
          sim.tintProjectile(slot, 'schaum');
        }
      }
    },
  },
};
