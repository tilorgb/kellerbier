import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks between heals (60/s), so a kill streak cannot stack the heal every tick. */
const HEAL_COOLDOWN_TICKS = 120;
const HEAL_AMOUNT = 1;

/**
 * Schutzengerl — a guardian-angel charm, the small kind pinned to a
 * cradle or a rear-view mirror. Folk superstition, not liturgy — the same
 * distinction `docs/CONTENT_BIBLE.md` §0 already draws for Krampus and
 * the Wild Hunt on the other side of the ledger. Quietly patches you up
 * when it can.
 *
 * The roster's first use of the `angel` pool (`ItemPoolId`,
 * `sim/item/definition.ts`) — every other item to date sits in `treasure`,
 * `shop`, `boss`, `secret`, `devil` or `curse`. The cooldown is the same
 * shape `watschn.ts` uses for its own retaliation: gate a per-kill effect
 * on `state.timer` rather than on a hard stack cap, since there is no
 * "stack" here to cap.
 */
export const schutzengerl: ItemDefinition = {
  id: 'schutzengerl',
  name: 'Schutzengerl',
  description: 'Kills occasionally heal a small amount',
  flavourText: 'Somebody has been keeping score. Nobody has ever seen who.',
  sprite: 'schutzengerl',
  pools: ['shop', 'boss', 'secret', 'angel'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onKill: (ctx) => {
      const state = ctx.state;
      if (state.timer > 0) {
        return;
      }
      state.timer = HEAL_COOLDOWN_TICKS;
      ctx.sim.addPlayerHealth(HEAL_AMOUNT);
    },
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.timer > 0) {
        state.timer -= 1;
      }
    },
  },
};
