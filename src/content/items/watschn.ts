import type { ItemDefinition } from '../../sim/item/definition.js';

/** The retaliation's radius, its damage scale off Stammwürze, its knockback strength, and its own short cooldown. */
const SLAP_RADIUS = 52;
const DAMAGE_SCALE = 0.8;
const PUSH_STRENGTH = 1.4;
const COOLDOWN_TICKS = 30;

/**
 * Watschn — a slap, the kind a Bavarian bar fight starts and ends with. Get
 * hit, and everyone standing near you gets hit back, harder.
 *
 * The first item in the roster to trigger off `onDamageTaken` for an
 * *offensive* effect rather than a defensive one (`lederhosn.ts` refunds the
 * health, `sankt-anzelm-klostersud.ts` only tracks whether any landed) — the
 * cooldown exists purely so a multi-hit stagger cannot fire the shockwave
 * more than once per swing's worth of overlapping hits, not to gate normal
 * use. `rausch`-gated: sober, nobody starts a bar fight.
 */
export const watschn: ItemDefinition = {
  id: 'watschn',
  name: 'Watschn',
  description: 'Getting hit sends a damaging shockwave out from you',
  flavourText: 'The Bavarian conflict-resolution method. Surprisingly effective.',
  sprite: 'watschn',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'rausch',
  hooks: {
    onDamageTaken: (ctx) => {
      const state = ctx.state;
      if (state.timer > 0 || ctx.amount <= 0) {
        return;
      }
      state.timer = COOLDOWN_TICKS;
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const x = sim.positionX(playerIndex);
      const y = sim.positionY(playerIndex);
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.applySplashDamage(x, y, SLAP_RADIUS, damage, playerIndex);
      sim.pushEnemiesNear(x, y, SLAP_RADIUS, PUSH_STRENGTH);
    },
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.timer > 0) {
        state.timer -= 1;
      }
    },
  },
};
