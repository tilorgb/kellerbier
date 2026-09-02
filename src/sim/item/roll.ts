import type { Rng } from '../rng/rng.js';
import type { StatId } from '../stats/definition.js';
import type { MachineTuning } from '../tuning.js';
import type { ItemRuntimeState, ItemStatModifier } from './definition.js';
import type { CompiledItem } from './registry.js';

/**
 * Der Losbrunnen's roll math (#218): feeding a held item a reroll, weighted
 * by outcome tier and biased by the player's Dusel — the same shape
 * `sim/item/pool.ts`'s `itemOfferWeight` already established for skewing a
 * weighted draw by a resolved stat, applied here to "how good is this roll"
 * instead of "how rare is the item offered."
 *
 * Kept pure and separate from `GameSim` for the same reason `pool.ts` is:
 * testable without a running simulation, and the one place "a roll" means
 * one specific thing rather than being reimplemented per call site.
 */

/** The five outcomes a roll can land on, worst to best. */
export const MACHINE_ROLL_TIERS = ['unlucky', 'common', 'uncommon', 'rare', 'legendary'] as const;
export type MachineRollTier = (typeof MACHINE_ROLL_TIERS)[number];

const TIER_WEIGHT_KEYS: Readonly<Record<MachineRollTier, keyof MachineTuning>> = {
  unlucky: 'unluckyWeight',
  common: 'commonWeight',
  uncommon: 'uncommonWeight',
  rare: 'rareWeight',
  legendary: 'legendaryWeight',
};

/**
 * Which way Dusel pushes each tier's weight: away from `unlucky`, toward
 * `rare`/`legendary`, and untouched for the two middle tiers — the same
 * "bias the rare end, leave the common end alone" shape `itemOfferWeight`
 * uses for quality tier 0.
 */
const TIER_DUSEL_DIRECTION: Readonly<Record<MachineRollTier, number>> = {
  unlucky: -1,
  common: 0,
  uncommon: 0,
  rare: 1,
  legendary: 1,
};

/** How heavily `tier` is weighted in the draw, biased by the player's resolved Dusel. */
export function machineRollTierWeight(
  tier: MachineRollTier,
  dusel: number,
  tuning: Readonly<MachineTuning>,
): number {
  const base = tuning[TIER_WEIGHT_KEYS[tier]];
  const bias = 1 + TIER_DUSEL_DIRECTION[tier] * Math.max(0, dusel) * tuning.duselRollBias;
  return Math.max(0, base * bias);
}

/** Draws one outcome tier, weighted by `machineRollTierWeight`. Draws from `rng` — pass `sim.random.items`. */
export function selectMachineRollTier(
  rng: Rng,
  dusel: number,
  tuning: Readonly<MachineTuning>,
): MachineRollTier {
  const weights = MACHINE_ROLL_TIERS.map((tier) => machineRollTierWeight(tier, dusel, tuning));
  const index = rng.weightedIndex(weights);
  return MACHINE_ROLL_TIERS[index] ?? 'common';
}

const NUDGE_PERCENT_KEYS: Readonly<
  Record<'unlucky' | 'common' | 'uncommon' | 'rare', keyof MachineTuning>
> = {
  unlucky: 'unluckyRollPercent',
  common: 'commonRollPercent',
  uncommon: 'uncommonRollPercent',
  rare: 'rareRollPercent',
};

/** Whether `item` currently has anything a roll could touch — the machine's own eligibility gate. */
export function itemEligibleForMachine(item: CompiledItem, state: ItemRuntimeState): boolean {
  const base = item.hooks.modifyStats?.(state) ?? [];
  return base.length > 0;
}

export interface MachineRollResult {
  readonly tier: MachineRollTier;
  /** The delta to register under `itemRollSourceKey(item.id)` — composes with the item's own `modifyStats` source rather than replacing it, except on an authored legendary hit, which replaces it outright. */
  readonly modifiers: readonly ItemStatModifier[];
  /** True when a `legendary` roll had no authored `ItemDefinition.legendaryRoll` and fell back to the `rare` tier's generic magnitude instead (`docs/DECISIONS.md` #19). */
  readonly usedLegendaryFallback: boolean;
  /** The stat actually nudged and which way, for the machine's toast — `undefined` only when `item` had nothing eligible (`itemEligibleForMachine` should have refused the feed before this is ever called). */
  readonly rolled: { readonly stat: StatId; readonly favourable: boolean } | undefined;
}

/**
 * Rolls `item`'s reroll for outcome `tier`.
 *
 * A `legendary` hit on an item with an authored `legendaryRoll` replaces the
 * roll source outright with that hand-tuned data — the "distinct,
 * strictly-better named variant" #218 asks for. Every other outcome (the
 * `legendary` tier included, absent that authoring) picks one modifier at
 * random from what the item's own `modifyStats` currently returns and
 * registers a proportional delta on the *same* stat: a `multiply` modifier
 * nudges by `1 ± percent`, an `add` modifier nudges by `± percent` of its own
 * magnitude. The delta is additive on top of the item's existing
 * contribution (its own `item:<id>` stat source is untouched), never a
 * mutation of the authored definition, which is what lets a second roll — or
 * losing and re-picking-up the item — start from the same honest baseline
 * every time.
 */
export function rollItemStatModifiers(
  item: CompiledItem,
  state: ItemRuntimeState,
  tier: MachineRollTier,
  rng: Rng,
  tuning: Readonly<MachineTuning>,
): MachineRollResult {
  if (tier === 'legendary' && item.legendaryRoll !== undefined) {
    const first = item.legendaryRoll[0];
    return {
      tier,
      modifiers: item.legendaryRoll,
      usedLegendaryFallback: false,
      rolled: first === undefined ? undefined : { stat: first.stat, favourable: true },
    };
  }
  const base = item.hooks.modifyStats?.(state) ?? [];
  if (base.length === 0) {
    return { tier, modifiers: [], usedLegendaryFallback: tier === 'legendary', rolled: undefined };
  }
  const chosen = base[rng.nextInt(0, base.length)];
  if (chosen === undefined) {
    throw new RangeError('rollItemStatModifiers needs a non-empty base modifier list');
  }
  const effectiveTier = tier === 'legendary' ? 'rare' : tier;
  const percent = tuning[NUDGE_PERCENT_KEYS[effectiveTier]];
  const favourable = effectiveTier !== 'unlucky';
  const sign = favourable ? 1 : -1;
  const delta: ItemStatModifier =
    chosen.op === 'multiply'
      ? { stat: chosen.stat, op: 'multiply', value: 1 + sign * percent }
      : { stat: chosen.stat, op: 'add', value: sign * percent * Math.abs(chosen.value) };
  return {
    tier,
    modifiers: [delta],
    usedLegendaryFallback: tier === 'legendary',
    rolled: { stat: chosen.stat, favourable },
  };
}

/** The `StatPipeline` source key a Losbrunnen roll registers its delta under — parallel to `itemStatSourceKey`, never the same key, so a roll layers on top of the item's own contribution instead of replacing it. */
export function itemRollSourceKey(id: string): string {
  return `item-roll:${id}`;
}
