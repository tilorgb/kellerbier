import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks between payouts (60/s), so a kill streak cannot pay out on every kill. */
const PAYOUT_COOLDOWN_TICKS = 240;
const BIERMARKEN_AMOUNT = 1;

/**
 * Alpensegen — an alpine blessing. Small mercies, mostly financial. The
 * roster's third `angel`-pool item, after `schutzengerl.ts` (a heal) and
 * `gluecksklee.ts` (flat Dusel) — this one pays out in Biermarken instead,
 * on the same cooldown-gated-by-`state.timer` shape `schutzengerl.ts`
 * already established for a per-kill trigger.
 */
export const alpensegen: ItemDefinition = {
  id: 'alpensegen',
  name: 'Alpensegen',
  description: 'Kills occasionally grant a Biermarken',
  flavourText: 'Small mercies. Mostly financial.',
  sprite: 'alpensegen',
  pools: ['shop', 'boss', 'angel'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onKill: (ctx) => {
      const state = ctx.state;
      if (state.timer > 0) {
        return;
      }
      state.timer = PAYOUT_COOLDOWN_TICKS;
      ctx.sim.addBiermarken(BIERMARKEN_AMOUNT);
    },
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.timer > 0) {
        state.timer -= 1;
      }
    },
  },
};
