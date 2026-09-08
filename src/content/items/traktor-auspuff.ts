import type { ItemDefinition } from '../../sim/item/definition.js';

/** How still counts as "not moving" (pixels/tick, `almabtrieb.ts`'s own epsilon). */
const STILL_EPSILON = 0.05;
/** Ticks between puffs while moving — ten a second, a continuous plume rather than a dotted line. */
const PUFF_INTERVAL_TICKS = 6;
/** How far behind the player a puff appears, so it never sits on top of them. */
const PUFF_TRAIL_OFFSET = 10;
const PUFF_SPEED_SCALE = 0.12;
const PUFF_LIFETIME_SCALE = 1.5;
const PUFF_RADIUS_SCALE = 1.7;
const PUFF_DAMAGE_SCALE = 0.5;
const MOVE_SPEED_MULTIPLIER = 1.15;

/**
 * Traktor-Auspuff — the tractor's exhaust. Moving leaves a plume of diesel
 * behind you: slow, fat clouds that drift back the way you came and pop on
 * the first thing to walk into one, poisoning it. Kite a room and the room
 * chokes on your route. Move Speed +15% on top, because it is a tractor.
 *
 * Each puff is an ordinary player projectile from `spawnItemProjectile`,
 * spawned a little behind the player and pointed *backwards* at a crawl,
 * tagged `poison` and tinted `abgas`, big enough to see. It hits once and
 * is gone — deliberately not `piercing`: a stationary shot that survives its
 * hit re-registers against a body still overlapping it every other tick
 * (`sim/systems/collision.ts`'s `lastHitTarget` lapse), which would turn a
 * cloud into a grinder. Was "Move Speed +25%, Luck -3": nothing to see and
 * a penalty nothing on screen explained.
 */
export const traktorAuspuff: ItemDefinition = {
  id: 'traktor-auspuff',
  name: 'Traktor-Auspuff',
  description: 'Moving leaves a trail of poison exhaust clouds behind you. Move Speed +15%',
  flavourText: 'You can hear it two fields over. So can everything with a choice in the matter.',
  sprite: 'traktor-auspuff',
  pools: ['shop', 'boss', 'secret', 'curse'],
  quality: 1,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'moveSpeed', op: 'multiply', value: MOVE_SPEED_MULTIPLIER }],
    onTick: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const dx = sim.positionX(playerIndex) - sim.previousX(playerIndex);
      const dy = sim.positionY(playerIndex) - sim.previousY(playerIndex);
      if (Math.abs(dx) <= STILL_EPSILON && Math.abs(dy) <= STILL_EPSILON) {
        return;
      }
      const state = ctx.state;
      state.timer += 1;
      if (state.timer < PUFF_INTERVAL_TICKS) {
        return;
      }
      state.timer = 0;
      const length = Math.hypot(dx, dy);
      const backX = -dx / length;
      const backY = -dy / length;
      const damage = Math.max(1, Math.round(sim.stats.value('damage') * PUFF_DAMAGE_SCALE));
      const slot = sim.spawnItemProjectile(
        sim.positionX(playerIndex) + backX * PUFF_TRAIL_OFFSET,
        sim.positionY(playerIndex) + backY * PUFF_TRAIL_OFFSET,
        backX,
        backY,
        {
          damage,
          speedScale: PUFF_SPEED_SCALE,
          lifetimeScale: PUFF_LIFETIME_SCALE,
          radiusScale: PUFF_RADIUS_SCALE,
        },
      );
      if (slot >= 0) {
        sim.addProjectileTag(slot, 'poison');
        sim.tintProjectile(slot, 'abgas');
      }
    },
  },
};
