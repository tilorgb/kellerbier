import type { ItemDefinition } from '../../sim/item/definition.js';

/** Damage added per kill in the current room, and how many stacks it will hold. */
const DAMAGE_PER_KILL = 0.08;
const MAX_STACKS = 6;
/** What keeping your hand in the bag costs.  */
const MOVE_SPEED_MULTIPLIER = 0.9;

/**
 * Studentenfutter — nuts and raisins, and nobody has ever taken one handful.
 * Damage climbs with every kill in the room and resets when the room is
 * done; the hand in the bag costs a little speed for the whole run.
 *
 * The stack count lives in `state.timer`, never `state.charge`:
 * `der-rosinenklauber.ts` owns `charge` on every `rosinen` item as its
 * suppression flag, so a `rosinen` item with a counter of its own has
 * exactly one field to put it in. `refreshItemStats` is what makes a stack
 * visible the tick it is earned rather than at the next dirty sweep — the
 * same call `apfelkuchen-mit-rosinen.ts` makes for its own cached flag.
 *
 * The cost is the Move Speed, and it is the one the Klauber suppresses; the
 * per-room reset is not a drawback but the shape of the item, so it stays
 * whatever else is held.
 */
export const studentenfutter: ItemDefinition = {
  id: 'studentenfutter',
  name: 'Studentenfutter',
  description: 'Damage +8% per kill in a room, up to +48%. Resets on clear. Move Speed -10%',
  flavourText: 'One handful. Every time. One handful.',
  sprite: 'studentenfutter',
  pools: ['treasure', 'shop', 'boss'],
  quality: 2,
  promilleRequirement: 'any',
  tags: ['rosinen'],
  status: (ctx) => `+${String(Math.round(ctx.state.timer * DAMAGE_PER_KILL * 100))}% damage`,
  hooks: {
    modifyStats: (state) => {
      const stacked = {
        stat: 'damage' as const,
        op: 'multiply' as const,
        value: 1 + state.timer * DAMAGE_PER_KILL,
      };
      return state.charge > 0
        ? [stacked]
        : [stacked, { stat: 'moveSpeed', op: 'multiply', value: MOVE_SPEED_MULTIPLIER }];
    },
    onKill: (ctx) => {
      if (ctx.state.timer >= MAX_STACKS) {
        return;
      }
      ctx.state.timer += 1;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
    onRoomClear: (ctx) => {
      if (ctx.state.timer === 0) {
        return;
      }
      ctx.state.timer = 0;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
