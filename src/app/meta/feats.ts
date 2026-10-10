import { FLOOR_CONFIGS } from '../../content/floors/definition.js';
import type { BossFightRecord, RunBests } from '../../sim/game/feats.js';
import { TICKS_PER_SECOND } from '../../sim/time.js';
import type { SaveData } from '../save/schema.js';
import {
  type BossFeat,
  STAT_DEEPEST_TIER,
  STAT_MOST_BEERS,
  STAT_MOST_PASSIVES,
  floorHeldTierStatKey,
  itemSetStatKey,
  mostTaggedStatKey,
} from './definition.js';

/**
 * Run feats as save statistics (#502) — how a `BossFightRecord` and a run's
 * `RunBests` are folded into `SaveData.statistics`, and how a `bossFeat`
 * condition is judged against what was folded.
 *
 * ## Why the save keeps bests and tallies rather than the fights themselves
 *
 * Unlocks are re-evaluated against the save on every commit
 * (`docs/DECISIONS.md` #51), so a condition added or re-tuned later is
 * judged against what a player already did. Keeping every fight would make
 * that exact and grow the save without bound; keeping one number per
 * *question* would make it cheap and throw away everything a later condition
 * might ask. This keeps one number per *dimension* of a fight instead — the
 * fewest hits any won fight on a floor took, the fastest, the lowest health
 * left, the highest tier, the lowest top item quality — so a threshold added
 * tomorrow ("at most 2 hits", "under 90 seconds") is answered retroactively
 * from the best on record. The price is that thresholds cannot be combined
 * with each other or counted ("no damage *and* under a minute", "no damage
 * three times"): those would need the fights themselves. The three feats
 * that are naturally yes/no per fight (sober, as a character, without item
 * tags) are tallied instead, so they can take a `times`.
 */

/** The statistics one floor's boss fights are kept under. */
export function bossFeatStatKey(
  floor: number,
  dimension: 'fewestHits' | 'lowestHealth' | 'fastestTicks' | 'highestTier' | 'lowestTopQuality',
): string {
  return `feat.boss.floor${String(floor)}.${dimension}`;
}

/** Tally of won fights on `floor` at 0 Promille, in a run where the meter existed. */
export function bossSoberStatKey(floor: number): string {
  return `feat.boss.floor${String(floor)}.sober`;
}

/** Tally of won fights on `floor` as `character` — also what #504's per-character marks read. */
export function bossAsCharacterStatKey(floor: number, character: string): string {
  return `feat.boss.floor${String(floor)}.as.${character}`;
}

/** Tally of won fights on `floor` holding nothing tagged with any of `tags`. Order-insensitive. */
export function bossWithoutTagsStatKey(floor: number, tags: readonly string[]): string {
  return `feat.boss.floor${String(floor)}.without.${[...tags].sort().join('+')}`;
}

function present(save: SaveData, key: string): number | undefined {
  return save.statistics[key];
}

function lower(statistics: Record<string, number>, key: string, value: number): void {
  const current = statistics[key];
  statistics[key] = current === undefined ? value : Math.min(current, value);
}

function raise(statistics: Record<string, number>, key: string, value: number): void {
  statistics[key] = Math.max(statistics[key] ?? 0, value);
}

function tally(statistics: Record<string, number>, key: string): void {
  statistics[key] = (statistics[key] ?? 0) + 1;
}

/**
 * Every non-empty subset of `tags` — what a fight is tallied under for
 * `withoutTags`, so a condition asking for any combination of absent tags
 * finds its count. The roster's tag universe is small (two today); past
 * eight it would stop being a sensible shape, and the fold says so.
 */
function nonEmptySubsets(tags: readonly string[]): string[][] {
  if (tags.length > 8) {
    throw new Error(`withoutTags tallies every subset of ${String(tags.length)} tags — too many`);
  }
  const subsets: string[][] = [];
  for (let mask = 1; mask < 1 << tags.length; mask++) {
    subsets.push(tags.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return subsets;
}

/**
 * Folds one won boss fight into the save's statistics. Counted once per
 * fight — the caller commits each fight exactly once (`app/main.ts`'s
 * `commitRunFeats`), the same as a boss defeat itself.
 */
export function foldBossFight(
  statistics: Record<string, number>,
  record: BossFightRecord,
): Record<string, number> {
  const next = { ...statistics };
  const floor = record.floor;
  lower(next, bossFeatStatKey(floor, 'fewestHits'), record.hitsTaken);
  lower(next, bossFeatStatKey(floor, 'fastestTicks'), record.ticks);
  if (record.healthLeft !== null) {
    lower(next, bossFeatStatKey(floor, 'lowestHealth'), record.healthLeft);
  }
  lower(next, bossFeatStatKey(floor, 'lowestTopQuality'), record.topQuality);
  raise(next, bossFeatStatKey(floor, 'highestTier'), record.promilleTier);
  raise(next, floorHeldTierStatKey(floor), record.floorLowestTier);
  if (record.promilleUnlocked && record.promille <= 0) {
    tally(next, bossSoberStatKey(floor));
  }
  tally(next, bossAsCharacterStatKey(floor, record.character));
  for (const subset of nonEmptySubsets(record.absentTags)) {
    tally(next, bossWithoutTagsStatKey(floor, subset));
  }
  return next;
}

/**
 * Folds a run's bests into the save as maxima. Idempotent — committing the
 * same run's bests twice changes nothing — which is what lets the app commit
 * them whenever they move, mid-run, instead of only once the run is over.
 */
export function foldRunBests(
  statistics: Record<string, number>,
  bests: RunBests,
): Record<string, number> {
  const next = { ...statistics };
  raise(next, STAT_DEEPEST_TIER, bests.deepestTier);
  raise(next, STAT_MOST_BEERS, bests.beersDrunk);
  raise(next, STAT_MOST_PASSIVES, bests.mostPassives);
  for (const [tag, count] of Object.entries(bests.mostTagged)) {
    raise(next, mostTaggedStatKey(tag), count);
  }
  for (const id of bests.completedSets) {
    raise(next, itemSetStatKey(id), 1);
  }
  return next;
}

/** The floors a `floor: null` feat looks across — every floor the game has a config for. */
function floorsFor(floor: number | null): number[] {
  return floor === null ? FLOOR_CONFIGS.map((config) => config.floor) : [floor];
}

function bestBelow(
  save: SaveData,
  floors: number[],
  key: (floor: number) => string,
): number | undefined {
  let best: number | undefined;
  for (const floor of floors) {
    const value = present(save, key(floor));
    if (value !== undefined && (best === undefined || value < best)) {
      best = value;
    }
  }
  return best;
}

function tallyAcross(save: SaveData, floors: number[], key: (floor: number) => string): number {
  return floors.reduce((sum, floor) => sum + (present(save, key(floor)) ?? 0), 0);
}

/** `{ current, goal }` for a `bossFeat` condition — the same shape every other condition reports. */
export function bossFeatProgress(
  save: SaveData,
  floor: number | null,
  feat: BossFeat,
  times = 1,
): { readonly current: number; readonly goal: number } {
  const floors = floorsFor(floor);
  const once = (met: boolean): { current: number; goal: number } => ({
    current: met ? 1 : 0,
    goal: 1,
  });
  const counted = (count: number): { current: number; goal: number } => {
    const goal = Math.max(1, times);
    return { current: Math.min(goal, count), goal };
  };
  switch (feat.kind) {
    case 'maxHits': {
      const best = bestBelow(save, floors, (f) => bossFeatStatKey(f, 'fewestHits'));
      return once(best !== undefined && best <= feat.hits);
    }
    case 'maxHealthLeft': {
      const best = bestBelow(save, floors, (f) => bossFeatStatKey(f, 'lowestHealth'));
      return once(best !== undefined && best <= feat.halfHearts);
    }
    case 'maxSeconds': {
      const best = bestBelow(save, floors, (f) => bossFeatStatKey(f, 'fastestTicks'));
      return once(best !== undefined && best <= feat.seconds * TICKS_PER_SECOND);
    }
    case 'maxItemQuality': {
      const best = bestBelow(save, floors, (f) => bossFeatStatKey(f, 'lowestTopQuality'));
      return once(best !== undefined && best <= feat.quality);
    }
    case 'minPromilleTier':
      return once(
        floors.some((f) => (present(save, bossFeatStatKey(f, 'highestTier')) ?? -1) >= feat.tier),
      );
    case 'sober':
      return counted(tallyAcross(save, floors, bossSoberStatKey));
    case 'asCharacter':
      return counted(tallyAcross(save, floors, (f) => bossAsCharacterStatKey(f, feat.character)));
    case 'withoutTags':
      return counted(tallyAcross(save, floors, (f) => bossWithoutTagsStatKey(f, feat.tags)));
  }
}

/**
 * Writes whatever statistics make a `bossFeat` condition met — the debug
 * handle's "unlock everything" (`withEverythingUnlocked`). Uses the named
 * floor, or floor 1 for "any boss".
 */
export function satisfyBossFeat(
  statistics: Record<string, number>,
  floor: number | null,
  feat: BossFeat,
  times = 1,
): void {
  const f = floor ?? 1;
  const goal = Math.max(1, times);
  switch (feat.kind) {
    case 'maxHits':
      lower(statistics, bossFeatStatKey(f, 'fewestHits'), feat.hits);
      return;
    case 'maxHealthLeft':
      lower(statistics, bossFeatStatKey(f, 'lowestHealth'), feat.halfHearts);
      return;
    case 'maxSeconds':
      lower(statistics, bossFeatStatKey(f, 'fastestTicks'), feat.seconds * TICKS_PER_SECOND);
      return;
    case 'maxItemQuality':
      lower(statistics, bossFeatStatKey(f, 'lowestTopQuality'), feat.quality);
      return;
    case 'minPromilleTier':
      raise(statistics, bossFeatStatKey(f, 'highestTier'), feat.tier);
      return;
    case 'sober':
      raise(statistics, bossSoberStatKey(f), goal);
      return;
    case 'asCharacter':
      raise(statistics, bossAsCharacterStatKey(f, feat.character), goal);
      return;
    case 'withoutTags':
      raise(statistics, bossWithoutTagsStatKey(f, feat.tags), goal);
      return;
  }
}
