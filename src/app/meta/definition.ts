import type { CharacterTraits } from '../../sim/character/definition.js';
import type { TierDefinition } from '../../sim/game/difficulty.js';

/**
 * The shapes meta-progression content is authored in.
 *
 * Two rosters: **unlocks** (things a save earns outside of a single run —
 * mostly by beating a boss or crossing a stat total) and **characters** (the
 * run-start roster, #47). Both are data — `src/content/progression/` holds
 * them the same way `src/content/enemies/` holds the bodies, and adding one
 * is a row rather than an engine change.
 *
 * Nothing here imports the simulation. A run is finished by the time any of
 * it is read, and what it reads is a `RunFacts` record the app assembles from
 * the save — so the meta layer stays testable without a `GameSim`, and the
 * sim stays a pure function of a seed and an input log, which it would not be
 * if it could see how many runs the player had already lost.
 */

/** The statistics keys the save's `statistics` map carries for progression. */
export const STAT_RUNS = 'runs';
export const STAT_KILLS = 'kills';
export const STAT_TICKS = 'ticks';
export const STAT_DEEPEST_FLOOR = 'deepestFloor';

/**
 * The statistic counting how often the boss of `floor` has been beaten.
 *
 * Keyed by floor, not by the boss's enemy id: which body a floor's boss is
 * made of is a content decision that has already changed once (#38 split Der
 * Stier into two phases with two ids), and "you beat what was at the bottom
 * of floor 2" is the fact progression actually cares about.
 */
export function bossStatKey(floor: number): string {
  return `boss.floor${String(floor)}`;
}

/**
 * Run feats (#502): the run-wide bests, each the best a single run has ever
 * reached — so `statAtLeast` over them reads "in one run". Merged as maxima
 * (`withRunBests`), never summed, which is what makes committing them again
 * and again over a run harmless.
 */
export const STAT_DEEPEST_TIER = 'feat.run.deepestTier';
export const STAT_MOST_BEERS = 'feat.run.mostBeers';
export const STAT_MOST_PASSIVES = 'feat.run.mostPassives';

/** The most items tagged `tag` (`ItemDefinition.tags`) one run has held at once (#503). */
export function mostTaggedStatKey(tag: string): string {
  return `feat.run.mostTagged.${tag}`;
}

/** Whether item set `id` has ever been completed — `1` once it has. */
export function itemSetStatKey(id: string): string {
  return `feat.set.${id}`;
}

/**
 * The best a run has ever done at holding the meter up across floor `floor`:
 * the highest "lowest tier between arriving on the floor and beating its
 * boss". `statAtLeast` at tier T reads "clear floor N without dropping below
 * tier T".
 */
export function floorHeldTierStatKey(floor: number): string {
  return `feat.floor${String(floor)}.heldTier`;
}

/**
 * How a boss fight has to go (#502). Measured from the boss room's lock to
 * the kill, and only on fights the player won.
 *
 * The threshold kinds (`maxHits`, `maxHealthLeft`, `maxSeconds`,
 * `minPromilleTier`, `maxItemQuality`) are judged against the best fight on
 * record, so they are met once and stay met; the counted kinds (`sober`,
 * `asCharacter`, `withoutTags`) are tallied per fight and take a `times`.
 */
export type BossFeat =
  /** Took at most `hits` hits in the fight — `0` is a no-damage kill. */
  | { readonly kind: 'maxHits'; readonly hits: number }
  /** Had at most `halfHearts` half-Maß (red plus Weißbier) left at the kill. */
  | { readonly kind: 'maxHealthLeft'; readonly halfHearts: number }
  /** Won within `seconds` of the doors locking. */
  | { readonly kind: 'maxSeconds'; readonly seconds: number }
  /** Won at a Promille tier of at least `tier` (`sim/game/promille.ts`'s `PromilleTier`). */
  | { readonly kind: 'minPromilleTier'; readonly tier: number }
  /** Won holding nothing above quality `quality`. */
  | { readonly kind: 'maxItemQuality'; readonly quality: number }
  /** Won at exactly 0 Promille in a run where the meter existed. */
  | { readonly kind: 'sober' }
  /** Won as character `character`. */
  | { readonly kind: 'asCharacter'; readonly character: string }
  /** Won holding no item carrying any of `tags`. */
  | { readonly kind: 'withoutTags'; readonly tags: readonly string[] };

/** What earns an unlock, or a character. */
export type UnlockCondition =
  | { readonly kind: 'bossDefeated'; readonly floor: number }
  | { readonly kind: 'statAtLeast'; readonly stat: string; readonly value: number }
  /**
   * A boss fight that went a particular way (#502). `floor: null` is any
   * boss; `times` (counted feats only, default 1) asks for it more than once.
   */
  | {
      readonly kind: 'bossFeat';
      readonly floor: number | null;
      readonly feat: BossFeat;
      readonly times?: number;
    };

/** What kind of thing an unlock hands over — used to group and to colour it. */
export type UnlockCategory = 'mechanic' | 'character' | 'items' | 'challenge' | 'hub';

export interface UnlockDefinition {
  readonly id: string;
  /** Bavarian, like every other name in this project. */
  readonly name: string;
  /** One line on what it changes, in the player's own words rather than the code's. */
  readonly effect: string;
  readonly category: UnlockCategory;
  /** What earns it — evaluated against the save, and shown as a goal until it is met. */
  readonly condition: UnlockCondition;
  /** The goal as a sentence: "Schlog Der Stier im 2. Stock". */
  readonly goal: string;
}

/**
 * A playable character offered on the run-start path (#47).
 *
 * A character carries its own `UnlockCondition` rather than an unlock id, so
 * `conditionMet`/`conditionProgress` and the "always something to work
 * toward" progress line come along unchanged, and the roster shows its own
 * goals under it without needing a matching entry in `PROGRESSION_UNLOCKS`.
 */
export interface CharacterDefinition {
  readonly id: string;
  readonly name: string;
  /** One line on who they are, in the player's language, not the code's. */
  readonly note: string;
  /** What earns them, or `null` for the one you start with. */
  readonly requires: UnlockCondition | null;
  /** That condition as a sentence: "Schlog Der Stier am Dorfplatz". Empty for Alois. */
  readonly goal: string;
  /** How they actually play — handed straight to `GameSim` as its `character`. */
  readonly traits: CharacterTraits;
}

/**
 * An item that starts out of the pool and is earned (#503).
 *
 * Like a character, it carries its own condition rather than an entry in
 * `unlocks`, and like a character it is *computed* — unlocked exactly while
 * its condition is met — rather than stored as a granted id. Statistics only
 * ever grow, so in practice nothing re-locks; a condition re-tuned upward is
 * the one way it can, and that is the honest reading of a re-tune.
 */
export interface ItemUnlockDefinition {
  /** An `ItemDefinition.id` — `tests/content/item-unlocks.test.ts` checks it exists. */
  readonly itemId: string;
  readonly condition: UnlockCondition;
  /** The condition as a sentence, shown under the item's silhouette in the Collection. */
  readonly goal: string;
}

/**
 * The best difficulty tier (#505) `character` has won on, plus one — `0`
 * while they have never won at all, so the plain `statistic` default of 0
 * means "nothing won" and the stored value is exactly the highest tier now
 * open to them (capped at the top of the ladder). A tier-0 win stores 1:
 * tier 1 unlocked.
 */
export function tierWonStatKey(character: string): string {
  return `tier.won.${character}`;
}

/**
 * Won runs (#506), as the medals read them. `fastestTicks` is a best (the
 * lowest on record, absent until the first win); the other two are tallies
 * of wins that went that way.
 */
export const STAT_WIN_FASTEST_TICKS = 'feat.win.fastestTicks';
/** Wins in which no boss landed a single hit. */
export const STAT_WIN_NO_BOSS_HITS = 'feat.win.noBossHits';
/** Wins without picking up an item during play. */
export const STAT_WIN_NO_ITEMS = 'feat.win.noItems';
/** Daily runs won on the attempt that counts (#494) — a practice rerun is not one. */
export const STAT_WIN_DAILY = 'feat.win.daily';

/**
 * What earns a medal (#506): any unlock condition, or one of the medal-only
 * questions that look across the whole roster rather than at one statistic.
 * `every` means every offered character; otherwise any one of them.
 */
export type MedalCondition =
  | UnlockCondition
  /** Won on difficulty `tier` or higher (#505). */
  | { readonly kind: 'tierWon'; readonly tier: number; readonly every: boolean }
  /** Every boss mark lit (#504). */
  | { readonly kind: 'allBossMarks'; readonly every: boolean }
  /** No item left locked (#503). */
  | { readonly kind: 'allItemsUnlocked' }
  /** Every item on the roster held at least once — the Collection complete. */
  | { readonly kind: 'collectionComplete' }
  /** Won within `seconds` of the run starting. */
  | { readonly kind: 'winWithin'; readonly seconds: number }
  /** Every challenge run (#507) won at least once. */
  | { readonly kind: 'allChallenges' };

/**
 * A challenge run (#507): a hand-authored run with fixed rules, played from
 * its own title entry once the game has been won. Every challenge is Alois,
 * tier 0, the full item pool — the same fixed footing as the daily (#494) —
 * plus the rules below. Winning one is what it asks; the reward is a medal.
 */
export interface ChallengeDefinition {
  /** Permanent, like a medal id — the medal and the save's statistic are keyed by it. */
  readonly id: string;
  /** The owner's name for it (#50/#507). */
  readonly name: string;
  /** What the rule is, as one line for the challenge list. */
  readonly description: string;
  /** Whether the Promille mechanic exists in this run at all — `false` is a run that stays sober. */
  readonly promille: boolean;
  /** The meter never reads below this (`ChallengeRules.promilleFloor`); `0` for none. */
  readonly promilleFloor: number;
  /** The whole run ends after this long (`ChallengeRules.timeLimitTicks`); `0` for none. */
  readonly timeLimitSeconds: number;
}

/** How many times challenge `id` (#507) has been won. */
export function challengeWonStatKey(id: string): string {
  return `challenge.won.${id}`;
}

/**
 * A medal (#506): a goal worth bragging about, with no reward. Its id is
 * stable — Steam achievements (#70) map onto these 1:1 — and its goal line
 * is the whole of what it says on the shelf; there is no separate name to
 * coin.
 */
export interface MedalDefinition {
  readonly id: string;
  readonly goal: string;
  readonly condition: MedalCondition;
  /** Shown as "???" until earned — a surprise, not a to-do. */
  readonly hidden?: boolean;
}

/** Everything progression is built from, handed in as one bundle so a test can substitute its own. */
export interface ProgressionContent {
  readonly unlocks: readonly UnlockDefinition[];
  readonly characters: readonly CharacterDefinition[];
  /** Items a fresh save does not have in its pool yet (#503). Optional so a fixture can leave it out. */
  readonly items?: readonly ItemUnlockDefinition[];
  /** The difficulty ladder (#505). Optional so a fixture can leave it out — no ladder, tier 0 only. */
  readonly tiers?: readonly TierDefinition[];
  /** The medals (#506). Optional so a fixture can leave it out. */
  readonly medals?: readonly MedalDefinition[];
  /**
   * Every item id the Collection counts (#506's "discover every item") — the
   * item roster's ids, handed in rather than imported so the meta layer stays
   * a function of what it is given.
   */
  readonly itemIds?: readonly string[];
  /** The challenge runs (#507). Optional so a fixture can leave it out. */
  readonly challenges?: readonly ChallengeDefinition[];
}
