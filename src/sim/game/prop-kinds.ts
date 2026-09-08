/**
 * The `decorativeProps` types that become destructible targets, in the order
 * `GameSim.propKind` indexes them.
 *
 * Index 0 is `barrel` so a target spawned by anything that does not name a
 * kind — the training target in the tuning playground, a test calling
 * `spawnTarget` directly — reads as the thing every target used to be.
 *
 * Its own leaf module rather than a const on `game/sim.ts` so `sim/enemy/`
 * and `sim/systems/` can name a kind (`approachProp`/`grabProp`/`whenPropWithin`,
 * #199) without importing the running simulation — the same cycle-avoidance
 * `sim/enemy/size.ts` is split out for. `game/sim.ts` re-exports it, so every
 * existing `from '.../game/sim.js'` import still resolves.
 *
 * `bale` (#277) is Der Ladewagen's dropped hay bale — a prop no room authors,
 * put in the world at runtime by the `dropProp` behaviour. Deliberately *not*
 * the `"hay-bale"` name floor 2's rooms already use in their
 * `decorativeProps`: that one is scenery, and promoting it to a destructible
 * kind here would retroactively turn four authored floor-2 rooms' decoration
 * into shootable cover — a content change riding along in a mini-boss fight,
 * which `CONTRIBUTING.md` asks changes not to do. Same hay, same sprite
 * (`render/floor-art.ts` names `rural-hay-bale` for both), two different
 * things: one is drawn, one is in the way.
 */
export const DESTRUCTIBLE_PROP_KINDS = ['barrel', 'maypole', 'bale'] as const;

export type DestructiblePropKind = (typeof DESTRUCTIBLE_PROP_KINDS)[number];

/** The index a kind is stored as in `GameSim.propKind`, or -1 for an unknown name. */
export function propKindIndex(name: string): number {
  return (DESTRUCTIBLE_PROP_KINDS as readonly string[]).indexOf(name);
}
