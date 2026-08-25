import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Charge gained per shot, lost per tick of not firing, and its cap.
 *
 * The seed text ("hold fire to charge... accuracy falls as damage rises")
 * assumes a held-fire-button and an accuracy stat neither exists in the
 * engine today — there is no "is fire currently held" signal reaching an
 * item hook, and none of the six `StatId`s (`sim/stats/definition.js`) is
 * spread or accuracy. This ships the trade-off the engine can actually
 * express: keep firing and damage climbs, at the cost of fire rate itself
 * rather than accuracy — still "the longer you commit, the more it costs
 * elsewhere," just paid in a stat that exists.
 */
const CHARGE_PER_SHOT = 3;
const DECAY_PER_TICK = 1;
const CHARGE_CAP = 24;
const DAMAGE_PER_CHARGE = 0.08;
const RATE_PENALTY_PER_CHARGE = 0.4;

/**
 * Maßkrugstemmen — hold a full Maß out at arm's length. Damage climbs the
 * longer you keep firing; fire rate falls with it as your arm tires.
 */
export const masskrugstemmen: ItemDefinition = {
  id: 'masskrugstemmen',
  name: 'Maßkrugstemmen',
  description: 'Damage climbs the longer you keep firing. Fire rate falls with it',
  flavourText: 'The record is nineteen minutes. The record holder cannot lift a pen anymore.',
  sprite: 'masskrugstemmen',
  pools: ['shop', 'boss', 'secret'],
  quality: 2,
  promilleRequirement: 'rausch',
  hooks: {
    modifyStats: (state) =>
      state.charge <= 0
        ? []
        : [
            { stat: 'stammwuerze', op: 'add', value: state.charge * DAMAGE_PER_CHARGE },
            { stat: 'schluckfrequenz', op: 'add', value: state.charge * RATE_PENALTY_PER_CHARGE },
          ],
    onShoot: (ctx) => {
      const state = ctx.state;
      state.charge = Math.min(CHARGE_CAP, state.charge + CHARGE_PER_SHOT);
      ctx.sim.refreshItemStats(ctx.itemId);
    },
    onTick: (ctx) => {
      const state = ctx.state;
      if (state.charge <= 0) {
        return;
      }
      state.charge = Math.max(0, state.charge - DECAY_PER_TICK);
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
