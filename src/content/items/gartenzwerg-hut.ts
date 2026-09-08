import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks without taking a hit per extra shot earned — five seconds a stack. */
const TICKS_PER_STACK = 300;
const MAX_STACKS = 3;
/** Radians each extra shot fans off the aimed one, alternating sides — the third sits twice as far out as the first. */
const FAN_STEP_RADIANS = 0.18;
const EXTRA_SHOT_DAMAGE_SCALE = 0.75;

/**
 * Gartenzwerg-Hut — the gnome is lucky exactly as long as nobody knocks him
 * over. Every five seconds without taking a hit adds one more shot to every
 * squeeze, fanning out around the aimed one, up to three extra; one hit and
 * the whole streak is gone.
 *
 * `state.charge` is the streak (0..`MAX_STACKS`), `state.timer` the ticks
 * toward the next stack — the two-counter shape `ItemRuntimeState.timer`
 * exists for. `onShoot` spawns the extras through `spawnItemProjectile`
 * (`spezi.ts`'s pipeline) alternating left/right so a full streak reads as
 * a fan, tinted `zwerg` so the shots the streak is adding are the ones in
 * gnome-hat red. Was "Luck rises the longer you go without a hit": the same
 * risk/reward loop, but Luck is a number nothing on screen ever shows, and
 * a growing fan of shots is the same idea a player can *see* build and
 * feel collapse.
 */
export const gartenzwergHut: ItemDefinition = {
  id: 'gartenzwerg-hut',
  name: 'Gartenzwerg-Hut',
  description: 'Every 5s without a hit adds an extra shot (up to 3). One hit resets it',
  flavourText: 'Face down in the flower bed. Somehow this is still the lucky pose.',
  sprite: 'gartenzwerg-hut',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  status: (ctx) =>
    ctx.state.charge <= 0
      ? 'building luck…'
      : `+${String(ctx.state.charge)} shot${ctx.state.charge === 1 ? '' : 's'}`,
  hooks: {
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.charge >= MAX_STACKS) {
        return;
      }
      state.timer += 1;
      if (state.timer < TICKS_PER_STACK) {
        return;
      }
      state.timer = 0;
      state.charge += 1;
    },
    onDamageTaken: (ctx) => {
      const state = ctx.state;
      if (ctx.amount <= 0) {
        return;
      }
      state.charge = 0;
      state.timer = 0;
    },
    onShoot: (ctx) => {
      const stacks = ctx.state.charge;
      if (stacks <= 0) {
        return;
      }
      const sim = ctx.sim;
      const tuning = sim.tuning.shooting;
      const playerIndex = sim.playerIndex;
      const baseAngle = Math.atan2(ctx.directionY, ctx.directionX);
      const damage = Math.max(1, Math.round(sim.stats.value('damage') * EXTRA_SHOT_DAMAGE_SCALE));
      for (let extra = 1; extra <= stacks; extra++) {
        // 1 → right, 2 → left, 3 → further right: the fan grows outward.
        const side = extra % 2 === 1 ? 1 : -1;
        const angle = baseAngle + side * Math.ceil(extra / 2) * FAN_STEP_RADIANS;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const slot = sim.spawnItemProjectile(
          sim.positionX(playerIndex) + dirX * tuning.muzzleOffset,
          sim.positionY(playerIndex) + dirY * tuning.muzzleOffset,
          dirX,
          dirY,
          { damage },
        );
        if (slot >= 0) {
          sim.tintProjectile(slot, 'zwerg');
        }
      }
    },
  },
};
