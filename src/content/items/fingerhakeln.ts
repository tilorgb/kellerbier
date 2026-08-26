import type { ItemDefinition } from '../../sim/item/definition.js';

/** Ticks between bites (60/s), the contact radius, the bite's damage scale off Stammwürze, and the pull strength applied every tick. */
const CONTACT_INTERVAL_TICKS = 20;
const CONTACT_RADIUS = 16;
const DAMAGE_SCALE = 0.4;
const PULL_STRENGTH = 0.2;

/**
 * Fingerhakeln — Bavarian finger-wrestling, dragging your opponent across
 * the table by one crooked finger. Contact damage, and it drags enemies in
 * rather than letting them keep their distance.
 *
 * The drag is `GameSim.pullEnemiesNear` (#59), the exact mirror of Der
 * Ordner's `pushEnemiesNear` added for this item — the seed text asks for
 * enemies "dragged toward you," and nothing in the existing push/pull
 * surface pulls. Contact damage reuses Wadlbeißer's own pattern
 * (`applySplashDamage` centred on the player, on a short timer) rather than
 * the `contactDamage` component enemies carry against the player, since
 * that component has no equivalent read path the other way yet.
 */
export const fingerhakeln: ItemDefinition = {
  id: 'fingerhakeln',
  name: 'Fingerhakeln',
  description: 'Contact damage, and drags nearby enemies toward you',
  flavourText: 'The loser buys the next round. There is always a next round.',
  sprite: 'fingerhakeln',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'rausch',
  hooks: {
    onPickup: (ctx) => {
      ctx.state.timer = CONTACT_INTERVAL_TICKS;
    },
    onTick: (ctx) => {
      const sim = ctx.sim;
      const playerIndex = sim.playerIndex;
      const playerX = sim.positionX(playerIndex);
      const playerY = sim.positionY(playerIndex);
      sim.pullEnemiesNear(playerX, playerY, CONTACT_RADIUS * 3, PULL_STRENGTH);

      const state = ctx.state;
      state.timer -= 1;
      if (state.timer > 0) {
        return;
      }
      state.timer = CONTACT_INTERVAL_TICKS;
      const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
      sim.applySplashDamage(playerX, playerY, CONTACT_RADIUS, damage, playerIndex);
    },
  },
};
