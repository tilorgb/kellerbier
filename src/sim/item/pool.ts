import type { Rng } from '../rng/rng.js';
import type { ItemPoolTuning } from '../tuning.js';
import type { ItemPoolId } from './definition.js';
import type { CompiledItem, ItemRegistry } from './registry.js';

/**
 * Item pools (#28): drawing one item to offer a run from a `ItemPoolId`.
 *
 * The registry itself already carries everything an item needs to be
 * offered (`pools`, `quality`, `promilleRequirement` — #26) and the run
 * already reserves a stream for exactly this (`RngStream.Items`, see
 * `sim/rng/streams.ts`'s doc comment). This module is the one place that
 * turns those into an actual weighted draw, so "no duplicates," "graceful
 * exhaustion" and "deterministic per seed and route" are each true by
 * construction in one function rather than by convention at every call site.
 */

/** Everything a draw needs to know about the run it is offering an item to. */
export interface ItemOfferContext {
  /** Mirrors `GameSim.promilleUnlocked` — a `sober`/`rausch` item never appears before the mechanic exists. */
  readonly promilleUnlocked: boolean;
  /** The current floor (`GameSim.currentFloor`) — deeper floors skew the draw toward rarer quality tiers. */
  readonly floor: number;
  /** The player's resolved Dusel stat (`sim.stats.value(StatId.Dusel)`) — same skew, driven by a build choice instead of progress. */
  readonly dusel: number;
  /**
   * Item ids already taken this run. Populated only when an offer is
   * actually accepted (`GameSim.takePedestalItem`), never when one is
   * merely offered — refusing a pedestal item leaves it eligible to be
   * offered again elsewhere, which is what "refusing... without losing it"
   * (#28) means at the pool level: nothing about a refusal is recorded.
   */
  readonly taken: ReadonlySet<string>;
}

/** Whether `item` could be offered from `pool` under `ctx`, ignoring weight. */
export function itemEligibleForOffer(
  item: CompiledItem,
  pool: ItemPoolId,
  ctx: ItemOfferContext,
): boolean {
  if (!item.pools.includes(pool)) {
    return false;
  }
  if (ctx.taken.has(item.id)) {
    return false;
  }
  // An item whose Promille requirement can never be evaluated is a stat
  // stick, not a build decision (`docs/DECISIONS.md` #9) — filtered out of
  // every pool exactly like a sober run's drop tables already filter Beer.
  if (!ctx.promilleUnlocked && item.promilleRequirement !== 'any') {
    return false;
  }
  return true;
}

const QUALITY_BASE_WEIGHT_KEYS = [
  'qualityWeight0',
  'qualityWeight1',
  'qualityWeight2',
  'qualityWeight3',
] as const;

/**
 * How heavily `item` is weighted in the draw: a per-tier base weight, biased
 * upward for higher tiers by both floor depth and the player's Dusel. Tier 0
 * carries no bias (`quality * bias` is 0 there) by construction — depth and
 * luck are meant to make the *rare* tiers more likely, not to make the
 * common tier vanish.
 */
export function itemOfferWeight(
  item: CompiledItem,
  ctx: ItemOfferContext,
  tuning: ItemPoolTuning,
): number {
  const base = tuning[QUALITY_BASE_WEIGHT_KEYS[item.quality]];
  const bias =
    1 +
    item.quality *
      (Math.max(0, ctx.floor) * tuning.floorQualityBias +
        Math.max(0, ctx.dusel) * tuning.duselQualityBias);
  return Math.max(0, base * bias);
}

/**
 * Draws one item from `pool`, weighted by quality/floor/Dusel among whatever
 * is currently eligible.
 *
 * Returns `undefined` — never throws — the moment nothing in the pool is
 * eligible (every member already taken, or filtered out by Promille state).
 * That is the whole of #28's "pool exhaustion falls back gracefully rather
 * than erroring": the caller (`GameSim.spawnPedestal`) just leaves the
 * pedestal empty rather than the run erroring out.
 *
 * Deterministic for a given seed and route: `registry.all` is sorted by id
 * at construction (`docs/DECISIONS.md` #15) so the eligible set is built in
 * a fixed order regardless of `taken`'s insertion order, and the one random
 * draw comes from `rng` — which every caller is expected to pass as
 * `sim.random.items`, the stream `sim/rng/streams.ts` reserves for exactly
 * this. Two runs on the same seed that reach the same pedestal after taking
 * the same items draw the same offer.
 */
export function selectItemOffer(
  registry: ItemRegistry,
  pool: ItemPoolId,
  ctx: ItemOfferContext,
  tuning: ItemPoolTuning,
  rng: Rng,
): CompiledItem | undefined {
  const eligible: CompiledItem[] = [];
  const weights: number[] = [];
  for (const item of registry.all) {
    if (!itemEligibleForOffer(item, pool, ctx)) {
      continue;
    }
    const weight = itemOfferWeight(item, ctx, tuning);
    if (weight <= 0) {
      continue;
    }
    eligible.push(item);
    weights.push(weight);
  }
  if (eligible.length === 0) {
    return undefined;
  }
  const index = rng.weightedIndex(weights);
  return eligible[index];
}
