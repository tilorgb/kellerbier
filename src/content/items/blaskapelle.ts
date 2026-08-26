import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks between rings (60/s), the ring's radius, and its damage relative to Stammwürze. */
const RING_INTERVAL_TICKS = 100;
const RING_RADIUS = 72;
const DAMAGE_SCALE = 0.35;

/**
 * Blaskapelle — a brass band, playing along wherever you go. A sound ring
 * goes out on the beat, the same trick the Floor 2 `Blaskapellist` enemy
 * (`docs/CONTENT_BIBLE.md` §2) plays on the player, aimed the other way.
 *
 * Unlike `schuhplattler.ts`'s shockwave, this one is not gated on standing
 * still — a band keeps playing whether or not you do — so it is tuned to a
 * lower damage share and a longer interval to land in the same power
 * bracket without needing a behavioural cost to balance against.
 */
export const blaskapelle: ItemDefinition = {
  id: 'blaskapelle',
  name: 'Blaskapelle',
  description: 'A sound ring damages everything around you every few seconds',
  flavourText: 'The tuba player has never once needed to breathe.',
  sprite: 'blaskapelle',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.timer = RING_INTERVAL_TICKS;
    },
    onTick: (ctx) => {
      const state = ctx.state;
      state.timer -= 1;
      if (state.timer > 0) {
        return;
      }
      state.timer = RING_INTERVAL_TICKS;
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.applySplashDamage(
        sim.positionX(playerIndex),
        sim.positionY(playerIndex),
        RING_RADIUS,
        damage,
        playerIndex,
      );
    },
  },
};
