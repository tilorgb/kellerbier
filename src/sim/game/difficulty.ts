/**
 * Difficulty tiers (#505): a ladder of stacking modifiers for players who
 * have beaten the game, each built out of a system that already exists.
 *
 * A tier is *data* (`content/progression/tiers.ts`, one modifier per tier),
 * and a run never sees a tier number — the app resolves the ladder up to the
 * chosen rung into one `DifficultyModifiers` (`resolveDifficulty`) and hands
 * that to `GameSim`. `NO_DIFFICULTY` is tier 0: exactly today's game, every
 * field a no-op, so a run built without the option is the run it always was.
 */

/** One rung's addition to the run — each read by exactly one existing system. */
export type TierModifier =
  /** Everything enemies fire travels this much faster (`EnemyTuning.projectileSpeedScale`). */
  | { readonly kind: 'enemyShotSpeed'; readonly scale: number }
  /** The curse roll on this floor always lands (`GameSim.rollFloorCurse`); which curse is still drawn. */
  | { readonly kind: 'forcedCurse'; readonly floor: number }
  /** Every price in a shop — pedestal items and priced pickups — scaled and rounded up. */
  | { readonly kind: 'shopPrices'; readonly scale: number }
  /** The starting red pool changes by this many half-Maß (`-2` is one heart fewer). */
  | { readonly kind: 'maxHealth'; readonly halfHearts: number }
  /** Each floor's treasure room offers this many fewer pedestals. */
  | { readonly kind: 'treasurePedestals'; readonly fewer: number };

/** One rung of the ladder: its number, and what it adds on top of every rung below it. */
export interface TierDefinition {
  readonly tier: number;
  readonly modifier: TierModifier;
  /** What the rung adds, as a line for the run-setup screen. */
  readonly description: string;
}

/** Every modifier a run is built with, already combined — `GameSimOptions.difficulty`. */
export interface DifficultyModifiers {
  readonly enemyShotSpeedScale: number;
  /** Floors whose curse roll always lands. */
  readonly forcedCurseFloors: readonly number[];
  readonly shopPriceScale: number;
  readonly maxHealthDelta: number;
  readonly treasurePedestalsFewer: number;
}

export const NO_DIFFICULTY: DifficultyModifiers = {
  enemyShotSpeedScale: 1,
  forcedCurseFloors: [],
  shopPriceScale: 1,
  maxHealthDelta: 0,
  treasurePedestalsFewer: 0,
};

/**
 * The combined modifiers of every rung from 1 up to `tier`. Scales multiply
 * and deltas add, so two rungs of the same kind stack rather than the later
 * one replacing the earlier. A `tier` of 0 (or below) is `NO_DIFFICULTY`.
 */
export function resolveDifficulty(
  ladder: readonly TierDefinition[],
  tier: number,
): DifficultyModifiers {
  let enemyShotSpeedScale = 1;
  const forcedCurseFloors: number[] = [];
  let shopPriceScale = 1;
  let maxHealthDelta = 0;
  let treasurePedestalsFewer = 0;
  for (const rung of ladder) {
    if (rung.tier < 1 || rung.tier > tier) {
      continue;
    }
    const modifier = rung.modifier;
    switch (modifier.kind) {
      case 'enemyShotSpeed':
        enemyShotSpeedScale *= modifier.scale;
        break;
      case 'forcedCurse':
        if (!forcedCurseFloors.includes(modifier.floor)) {
          forcedCurseFloors.push(modifier.floor);
        }
        break;
      case 'shopPrices':
        shopPriceScale *= modifier.scale;
        break;
      case 'maxHealth':
        maxHealthDelta += modifier.halfHearts;
        break;
      case 'treasurePedestals':
        treasurePedestalsFewer += modifier.fewer;
        break;
    }
  }
  return {
    enemyShotSpeedScale,
    forcedCurseFloors,
    shopPriceScale,
    maxHealthDelta,
    treasurePedestalsFewer,
  };
}

/** A shop price under `difficulty` — rounded up, so a scale above 1 never makes anything cheaper. */
export function scaledPrice(price: number, difficulty: DifficultyModifiers): number {
  return difficulty.shopPriceScale === 1 ? price : Math.ceil(price * difficulty.shopPriceScale);
}
