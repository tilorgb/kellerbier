import type { ItemDefinition } from '../../sim/item/definition.js';

/** Cooldown (60/s), the fuse length before it goes off, and the blast's radius/damage/push. */
const COOLDOWN_TICKS = 420;
const FUSE_TICKS = 60;
const BLAST_RADIUS = 90;
const DAMAGE_SCALE = 2.2;
const PUSH_STRENGTH = 1.8;

/**
 * Böllerschmeißer — `docs/CONTENT_BIBLE.md` §2's own note on the enemy this
 * borrows from: "the fuse is the whole enemy... the throw is readable, the
 * landing spot is marked." Played the other way round: you drop it at your
 * own feet and have one second to get clear before it goes off wherever you
 * are standing then, not wherever you were standing when you threw it.
 *
 * `state.timer` is the fuse; `state.charge` stays the plain cooldown meter
 * `useActiveItem` already understands, so the two never fight over meaning
 * the way `enzian.ts`'s dual-purpose `charge` does — `onTick` only calls
 * `chargeActiveItem` once the fuse itself is not running.
 */
export const boellerschmeisser: ItemDefinition = {
  id: 'boellerschmeisser',
  name: 'Böllerschmeißer',
  description: 'Active: drop a lit Böller — it goes off where you stand, one second later',
  flavourText: 'The landing spot is marked. Nobody ever moves in time regardless.',
  sprite: 'boellerschmeisser',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  active: { maxCharge: COOLDOWN_TICKS },
  hooks: {
    onActivate: (ctx) => {
      ctx.state.timer = FUSE_TICKS;
    },
    onTick: (ctx) => {
      const sim = ctx.sim;
      const state = ctx.state;
      if (state.timer > 0) {
        state.timer -= 1;
        if (state.timer === 0) {
          const playerIndex = sim.playerIndex;
          const x = sim.positionX(playerIndex);
          const y = sim.positionY(playerIndex);
          const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
          sim.applySplashDamage(x, y, BLAST_RADIUS, damage, playerIndex);
          sim.pushEnemiesNear(x, y, BLAST_RADIUS, PUSH_STRENGTH);
          // #243: the enemy's own mirrored fix — nothing else draws the boom.
          sim.splashBurst(x, y, BLAST_RADIUS);
        }
        return;
      }
      sim.chargeActiveItem(ctx.itemId, 1);
    },
  },
};
