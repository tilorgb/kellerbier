import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks between swings (60/s), the invulnerable burst's own length, and the speed it grants while it lasts. */
const SWING_INTERVAL_TICKS = 420;
const BURST_TICKS = 40;
const SPEED_MULTIPLIER = 1.6;

/**
 * Kirtahutschn — the swing ride at the Kirchweih fair, the one that goes
 * higher than it should. Every so often it swings you clear off the
 * ground: faster, and briefly untouchable.
 *
 * Reuses `enzian.ts`'s sign-trick exactly — `state.charge` counts up as an
 * ordinary cooldown while non-negative, drops to `-BURST_TICKS` on
 * trigger, and counts back up toward zero while negative — but the burst
 * fires on its own timer instead of a button press, so nothing here is an
 * `active` item. `makePlayerInvulnerable` (`sim/game/sim.ts`) is otherwise
 * only reached from the Promille knockdown path; this is the first item to
 * grant it directly.
 */
export const kirtahutschn: ItemDefinition = {
  id: 'kirtahutschn',
  name: 'Kirtahutschn',
  description: 'Every so often, a brief burst of speed and invulnerability',
  flavourText: 'The operator has seen things. The operator will not discuss them.',
  sprite: 'kirtahutschn',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: (state) =>
      state.charge < 0 ? [{ stat: 'gschwindigkeit', op: 'multiply', value: SPEED_MULTIPLIER }] : [],
    onPickup: (ctx) => {
      ctx.state.charge = SWING_INTERVAL_TICKS;
    },
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.charge < 0) {
        state.charge += 1;
        if (state.charge === 0) {
          ctx.sim.refreshItemStats(ctx.itemId);
        }
        return;
      }
      state.charge -= 1;
      if (state.charge > 0) {
        return;
      }
      state.charge = -BURST_TICKS;
      ctx.sim.makePlayerInvulnerable(BURST_TICKS);
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
