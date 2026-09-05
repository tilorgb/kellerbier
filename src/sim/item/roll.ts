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

/**
 * One trait a Losbrunnen roll could currently nudge on an item (#238) — a
 * live `modifyStats` entry, or (for an item with an `active` charge bar) its
 * cooldown. A hybrid item (Enzian, whose `modifyStats` is only live during
 * its own burst) can offer both at once; the roll picks uniformly among
 * whatever is on offer, the same "pick a random entry" `rollItemStatModifiers`
 * always did when the list held only stat entries.
 */
export type MachineRollTarget =
  { readonly kind: 'stat'; readonly modifier: ItemStatModifier } | { readonly kind: 'cooldown' };

/**
 * Every trait a Losbrunnen roll could nudge on `item` right now — its live
 * `modifyStats` output, one target per entry, plus one more `cooldown`
 * target when the item has an `active` charge bar at all (#238's "active
 * items should be able to reroll too"). An active item's cooldown is always
 * offered regardless of current charge — unlike a state-gated `modifyStats`
 * entry, there is nothing about "not currently ready" that should make its
 * one authored numeric trait unreachable.
 */
export function machineRollTargets(
  item: CompiledItem,
  state: ItemRuntimeState,
): readonly MachineRollTarget[] {
  const targets: MachineRollTarget[] = (item.hooks.modifyStats?.(state) ?? []).map((modifier) => ({
    kind: 'stat',
    modifier,
  }));
  if (item.active !== undefined) {
    targets.push({ kind: 'cooldown' });
  }
  return targets;
}

/** Whether `item` currently has anything a roll could touch — the machine's own eligibility gate. */
export function itemEligibleForMachine(item: CompiledItem, state: ItemRuntimeState): boolean {
  return machineRollTargets(item, state).length > 0;
}

export interface MachineRollResult {
  readonly tier: MachineRollTier;
  /** The delta to register under `itemRollSourceKey(item.id)` — composes with the item's own `modifyStats` source rather than replacing it, except on an authored legendary hit, which replaces it outright. Empty when the roll landed on `cooldown` instead. */
  readonly modifiers: readonly ItemStatModifier[];
  /** True when a `legendary` roll had no authored `ItemDefinition.legendaryRoll` and fell back to the `rare` tier's generic magnitude instead (`docs/DECISIONS.md` #19). */
  readonly usedLegendaryFallback: boolean;
  /** What actually got nudged and which way, for the machine's toast — `undefined` only when `item` had nothing eligible (`itemEligibleForMachine` should have refused the feed before this is ever called). */
  readonly rolled:
    | { readonly kind: 'stat'; readonly stat: StatId; readonly favourable: boolean }
    | { readonly kind: 'cooldown'; readonly favourable: boolean }
    | undefined;
  /**
   * Multiplier for `ActiveItemDefinition.maxCharge`, present only when
   * `rolled?.kind === 'cooldown'`. `GameSim.applyMachineRoll` stores this
   * outright as the item's *current* cooldown factor rather than composing
   * it with whatever the last cooldown roll was — "reroll means reroll, not
   * accumulate," the same promise `modifiers` already keeps for a stat.
   */
  readonly cooldownFactor: number | undefined;
}

/**
 * Rolls `item`'s reroll for outcome `tier`.
 *
 * A `legendary` hit on an item with an authored `legendaryRoll` replaces the
 * roll source outright with that hand-tuned data — the "distinct,
 * strictly-better named variant" #218 asks for. Every other outcome (the
 * `legendary` tier included, absent that authoring) picks one target at
 * random from `machineRollTargets` and nudges it by a tuned percent in the
 * tier's direction: a `multiply` stat modifier nudges its factor by
 * `1 ± percent`, an `add` one nudges by `± percent` of its own magnitude, and
 * a `cooldown` target nudges `active.maxCharge` by the same percent —
 * *shrinking* it on a favourable roll, since a shorter cooldown is the
 * active-item equivalent of a bigger number being good.
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
      rolled:
        first === undefined ? undefined : { kind: 'stat', stat: first.stat, favourable: true },
      cooldownFactor: undefined,
    };
  }
  const targets = machineRollTargets(item, state);
  if (targets.length === 0) {
    return {
      tier,
      modifiers: [],
      usedLegendaryFallback: tier === 'legendary',
      rolled: undefined,
      cooldownFactor: undefined,
    };
  }
  const chosen = targets[rng.nextInt(0, targets.length)];
  if (chosen === undefined) {
    throw new RangeError('rollItemStatModifiers needs a non-empty target list');
  }
  const effectiveTier = tier === 'legendary' ? 'rare' : tier;
  const percent = tuning[NUDGE_PERCENT_KEYS[effectiveTier]];
  const favourable = effectiveTier !== 'unlucky';
  if (chosen.kind === 'cooldown') {
    const sign = favourable ? -1 : 1;
    return {
      tier,
      modifiers: [],
      usedLegendaryFallback: tier === 'legendary',
      rolled: { kind: 'cooldown', favourable },
      cooldownFactor: 1 + sign * percent,
    };
  }
  const sign = favourable ? 1 : -1;
  const delta: ItemStatModifier =
    chosen.modifier.op === 'multiply'
      ? { stat: chosen.modifier.stat, op: 'multiply', value: 1 + sign * percent }
      : {
          stat: chosen.modifier.stat,
          op: 'add',
          value: sign * percent * Math.abs(chosen.modifier.value),
        };
  return {
    tier,
    modifiers: [delta],
    usedLegendaryFallback: tier === 'legendary',
    rolled: { kind: 'stat', stat: chosen.modifier.stat, favourable },
    cooldownFactor: undefined,
  };
}

/** The `StatPipeline` source key a Losbrunnen roll registers its delta under — parallel to `itemStatSourceKey`, never the same key, so a roll layers on top of the item's own contribution instead of replacing it. */
export function itemRollSourceKey(id: string): string {
  return `item-roll:${id}`;
}

/** Every tier but `unlucky` — the pool a favourable-only draw picks from. */
const FAVOURABLE_MACHINE_ROLL_TIERS = MACHINE_ROLL_TIERS.filter(
  (tier): tier is Exclude<MachineRollTier, 'unlucky'> => tier !== 'unlucky',
);

/**
 * Draws one outcome tier from `common`/`uncommon`/`rare`/`legendary` only —
 * the same weights `selectMachineRollTier` uses for those four, `unlucky`
 * excluded entirely rather than drawn-and-discarded. Used to fill out a
 * 3-option roll board (`rollMachineOutcome`) once the pull has already been
 * decided *not* to be the bad-luck one.
 */
function selectFavourableMachineRollTier(
  rng: Rng,
  dusel: number,
  tuning: Readonly<MachineTuning>,
): Exclude<MachineRollTier, 'unlucky'> {
  const weights = FAVOURABLE_MACHINE_ROLL_TIERS.map((tier) =>
    machineRollTierWeight(tier, dusel, tuning),
  );
  const index = rng.weightedIndex(weights);
  return FAVOURABLE_MACHINE_ROLL_TIERS[index] ?? 'common';
}

/** One outcome tier already rolled and resolved into a concrete `MachineRollResult`, for the redesigned picker's results board (#238's own parked follow-up). */
export interface MachineRollCandidate {
  readonly tier: MachineRollTier;
  readonly result: MachineRollResult;
}

/**
 * A Losbrunnen pull's real-menu outcome (the UX redesign parked in
 * `docs/DECISIONS.md` #69): either the pull is the bad-luck one, in which
 * case it is *only* ever the bad-luck one — a single `unlucky` candidate,
 * nothing to compare it against — or it isn't, in which case the player sees
 * three favourable-or-neutral options drawn from `common`/`uncommon`/`rare`/
 * `legendary` and picks which one to keep. Whether the pull is unlucky at
 * all is decided by one draw against the *full* tier weights (so
 * `unluckyWeight`, and Dusel's pull away from it, still mean exactly what
 * they always have); only once that draw comes up favourable does drawing
 * the other two board slots exclude `unlucky` entirely, rather than drawing
 * three independent picks and hoping none of them land on it.
 */
export function rollMachineOutcome(
  item: CompiledItem,
  state: ItemRuntimeState,
  dusel: number,
  tuning: Readonly<MachineTuning>,
  rng: Rng,
): { readonly kind: 'unlucky' | 'choice'; readonly candidates: readonly MachineRollCandidate[] } {
  const firstTier = selectMachineRollTier(rng, dusel, tuning);
  const firstCandidate: MachineRollCandidate = {
    tier: firstTier,
    result: rollItemStatModifiers(item, state, firstTier, rng, tuning),
  };
  if (firstTier === 'unlucky') {
    return { kind: 'unlucky', candidates: [firstCandidate] };
  }
  const candidates = [firstCandidate];
  for (let index = 0; index < 2; index += 1) {
    const tier = selectFavourableMachineRollTier(rng, dusel, tuning);
    candidates.push({ tier, result: rollItemStatModifiers(item, state, tier, rng, tuning) });
  }
  return { kind: 'choice', candidates };
}
