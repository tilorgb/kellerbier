import type { ItemDefinition } from '../../sim/item/definition.js';

/** Cooldown between arias (60/s), the wind-up before the glass shatters, the nova's radius, and its damage relative to Stammwürze. */
const COOLDOWN_TICKS = 480;
const WINDUP_TICKS = 45;
const NOVA_RADIUS = 72;
const DAMAGE_SCALE = 2.4;

/**
 * Opernarie — the sustained note Floor 5's `Opernsängerin` holds
 * (`docs/CONTENT_BIBLE.md` §2), aimed the other way. The note swells for
 * a beat, then the glass shatters outward.
 *
 * Unlike `sonnwendfeuer.ts`'s instant nova, this one telegraphs: `onActivate`
 * only starts `state.timer` counting down rather than dealing damage
 * immediately, and `onTick` fires the actual blast once it reaches zero.
 * `state.timer` and `state.charge` stay independent here (`state.charge`
 * is the ordinary `chargeActiveItem` cooldown meter, untouched during the
 * wind-up) — no sign-trick needed, since nothing here needs a `modifyStats`
 * contribution while winding up.
 */
export const opernarie: ItemDefinition = {
  id: 'opernarie',
  name: 'Opernarie',
  description: 'Active: a held note builds, then shatters everything around you',
  flavourText: 'Every chandelier in the room agrees this is a bad idea.',
  sprite: 'opernarie',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  active: { maxCharge: COOLDOWN_TICKS },
  hooks: {
    onActivate: (ctx) => {
      ctx.state.timer = WINDUP_TICKS;
    },
    onTick: (ctx) => {
      const state = ctx.state;
      const sim = ctx.sim;
      if (state.timer > 0) {
        state.timer -= 1;
        if (state.timer === 0) {
          const playerIndex = sim.playerIndex;
          const damage = Math.max(1, Math.round(sim.stats.value('stammwuerze') * DAMAGE_SCALE));
          sim.applySplashDamage(
            sim.positionX(playerIndex),
            sim.positionY(playerIndex),
            NOVA_RADIUS,
            damage,
            playerIndex,
          );
        }
        return;
      }
      sim.chargeActiveItem(ctx.itemId, 1);
    },
  },
};
