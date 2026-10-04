/**
 * Sounds a held item can ask for by name (#396).
 *
 * Names live here, in `sim/`, for the same reason `PROJECTILE_TINT_NAMES`
 * does: content may only import types, so an item names its cue as a string
 * literal (`ctx.sim.playItemCue('sneeze')`) and the simulation carries the
 * index in an `EventKind.ItemCue` event. What the cue actually sounds like is
 * `content/audio/sfx.ts`'s business (`item-<name>`); the simulation never
 * learns, and nothing in `step` reads the event back.
 */
export const ITEM_CUE_NAMES = [
  /** Schnupftabak: the held breath before the sneeze. */
  'sneeze-inhale',
  /** Schnupftabak: the sneeze itself. */
  'sneeze',
] as const;

export type ItemCueName = (typeof ITEM_CUE_NAMES)[number];

/** Index of a cue by name — what an `ItemCue` event's `value` carries. */
export const ITEM_CUE_INDEX: Readonly<Record<ItemCueName, number>> = Object.fromEntries(
  ITEM_CUE_NAMES.map((name, index) => [name, index]),
) as Readonly<Record<ItemCueName, number>>;
