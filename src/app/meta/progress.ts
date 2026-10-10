import { FLOOR_CONFIGS, HIGHEST_PLAYABLE_FLOOR } from '../../content/floors/definition.js';
import type { Locale } from '../../i18n/locale.js';
import { t } from '../../i18n/translate.js';
import { type CharacterTraits, NEUTRAL_TRAITS } from '../../sim/character/definition.js';
import type { BossFightRecord, RunBests } from '../../sim/game/feats.js';
import { dailySeed } from '../../sim/rng/daily.js';
import { TICKS_PER_SECOND } from '../../sim/time.js';
import {
  type BestRunRecord,
  type DailyRunRecord,
  type SaveData,
  MAX_BEST_RUNS,
} from '../save/schema.js';
import {
  type CharacterDefinition,
  type ProgressionContent,
  type UnlockCondition,
  type UnlockDefinition,
  STAT_DEEPEST_FLOOR,
  STAT_KILLS,
  STAT_RUNS,
  STAT_TICKS,
  bossStatKey,
  tierWonStatKey,
  type ChallengeDefinition,
  type MedalCondition,
  type MedalDefinition,
  challengeWonStatKey,
  STAT_WIN_FASTEST_TICKS,
  STAT_WIN_NO_BOSS_HITS,
  STAT_WIN_NO_ITEMS,
} from './definition.js';
import {
  bossAsCharacterStatKey,
  bossFeatProgress,
  foldBossFight,
  foldRunBests,
  satisfyBossFeat,
} from './feats.js';

/**
 * Meta-progression's rules, as pure functions over a `SaveData`.
 *
 * Everything here takes a save and returns a new one, or takes a save and
 * returns something to draw. Nothing reaches for `localStorage`, a `GameSim`
 * or a `Container` — `meta/index.ts` is the thin layer that persists the
 * results, `render/run-results.ts` is the thin layer that draws them, and
 * this is where the decisions live, so all of it is testable without a
 * browser.
 *
 * ## Why unlocks are re-evaluated rather than granted at the moment they are earned
 *
 * `grantEarnedUnlocks` walks every unlock definition against the save's own
 * statistics on every commit, instead of each caller knowing which unlock its
 * event happens to grant. That means an unlock added to the roster later is
 * granted retroactively to a player who already met its condition, a
 * condition whose threshold is re-tuned takes effect on the next commit
 * rather than being frozen into whoever happened to be playing that week,
 * and the boss-defeat path and the run-end path cannot drift apart. The cost
 * is a walk over a handful of definitions a few times per run, which is
 * nothing next to a save write.
 */

/** The one run the results screen leads with. */
export interface RunFacts {
  readonly seed: number;
  readonly floor: number;
  readonly floorName: string;
  readonly seconds: number;
  readonly kills: number;
  readonly deathWord: string | null;
}

/** How far along a goal the player is — shown under a locked unlock so a goal is legible, not mysterious. */
export interface ConditionProgress {
  readonly current: number;
  readonly goal: number;
}

/** A floor's authored name, or a plain fallback for a floor that has no config (there are seven). */
export function floorName(floor: number): string {
  return FLOOR_CONFIGS.find((config) => config.floor === floor)?.name ?? `Stock ${String(floor)}`;
}

export function runFactsFrom(record: BestRunRecord): RunFacts {
  return {
    seed: record.seed,
    floor: record.floor,
    floorName: floorName(record.floor),
    seconds: record.ticksSurvived / TICKS_PER_SECOND,
    kills: record.kills,
    deathWord: record.deathWord,
  };
}

function statistic(save: SaveData, key: string): number {
  return save.statistics[key] ?? 0;
}

/** How far along `condition` this save is. `current` is capped at `goal` so a bar can't overrun. */
export function conditionProgress(save: SaveData, condition: UnlockCondition): ConditionProgress {
  switch (condition.kind) {
    case 'bossDefeated':
      return { current: Math.min(1, statistic(save, bossStatKey(condition.floor))), goal: 1 };
    case 'statAtLeast':
      return {
        current: Math.min(condition.value, statistic(save, condition.stat)),
        goal: condition.value,
      };
    case 'bossFeat':
      return bossFeatProgress(save, condition.floor, condition.feat, condition.times);
  }
}

export function conditionMet(save: SaveData, condition: UnlockCondition): boolean {
  const { current, goal } = conditionProgress(save, condition);
  return current >= goal;
}

/**
 * Grants every unlock whose condition the save now meets, preserving the
 * order they were earned in.
 */
export function grantEarnedUnlocks(save: SaveData, content: ProgressionContent): SaveData {
  const earned = save.unlocks.slice();
  const known = new Set(earned);
  for (const unlock of content.unlocks) {
    if (!known.has(unlock.id) && conditionMet(save, unlock.condition)) {
      earned.push(unlock.id);
      known.add(unlock.id);
    }
  }
  const withUnlocks = earned.length === save.unlocks.length ? save : { ...save, unlocks: earned };
  return grantEarnedMedals(withUnlocks, content);
}

/**
 * Grants every medal (#506) the save now meets into `achievements`, by the
 * same re-walk as unlocks — so a medal is retroactive, and an id the roster
 * no longer has is kept rather than pruned (a cut medal stays earned).
 */
function grantEarnedMedals(save: SaveData, content: ProgressionContent): SaveData {
  const earned = save.achievements.slice();
  const known = new Set(earned);
  for (const medal of content.medals ?? []) {
    if (!known.has(medal.id) && medalMet(save, content, medal.condition)) {
      earned.push(medal.id);
      known.add(medal.id);
    }
  }
  return earned.length === save.achievements.length ? save : { ...save, achievements: earned };
}

/** Whether `save` meets a medal's condition (#506). Deterministic — a function of the save alone. */
export function medalMet(
  save: SaveData,
  content: ProgressionContent,
  condition: MedalCondition,
): boolean {
  const characters = content.characters;
  const across = (every: boolean, test: (id: string) => boolean): boolean =>
    characters.length > 0 &&
    (every
      ? characters.every((character) => test(character.id))
      : characters.some((character) => test(character.id)));
  switch (condition.kind) {
    case 'tierWon':
      // `tier.won.<id>` is the best tier won plus one (`tierWonStatKey`).
      return across(
        condition.every,
        (id) => statistic(save, tierWonStatKey(id)) >= condition.tier + 1,
      );
    case 'allBossMarks':
      return across(condition.every, (id) => bossMarks(save, id).every((mark) => mark.beaten));
    case 'allItemsUnlocked':
      return (content.items ?? []).length > 0 && lockedItemIds(save, content).length === 0;
    case 'collectionComplete': {
      const found = new Set(save.discoveredItems);
      const ids = content.itemIds ?? [];
      return ids.length > 0 && ids.every((id) => found.has(id));
    }
    case 'allChallenges': {
      const challenges = content.challenges ?? [];
      return (
        challenges.length > 0 &&
        challenges.every((challenge) => statistic(save, challengeWonStatKey(challenge.id)) > 0)
      );
    }
    case 'winWithin': {
      const fastest = save.statistics[STAT_WIN_FASTEST_TICKS];
      return fastest !== undefined && fastest <= condition.seconds * TICKS_PER_SECOND;
    }
    default:
      return conditionMet(save, condition);
  }
}

/**
 * Whether this save has ever beaten any floor's boss.
 *
 * The gate on Floor 1's XL roll (#271): a 22-room tutorial as somebody's
 * *first* experience of the game is the one case where the extra size is
 * purely bad, since there is no run yet to compare it against. Every
 * floor's `bossStatKey` is checked, not just Floor 1's, so a save that
 * somehow only ever fought a later floor's boss (a future non-linear
 * unlock, say) still counts.
 */
export function hasBeatenABoss(save: SaveData): boolean {
  return FLOOR_CONFIGS.some((config) => statistic(save, bossStatKey(config.floor)) > 0);
}

/**
 * Records that the boss of `floor` went down.
 *
 * Committed the moment it happens rather than at the end of the run, because
 * the two are not the same event: a player who beats Der Stier and then dies
 * on floor 1 of the next loop has still beaten Der Stier, and a player who
 * beats him and closes the tab has too.
 */
export function withBossDefeat(
  save: SaveData,
  floor: number,
  content: ProgressionContent,
): SaveData {
  const statistics = { ...save.statistics };
  statistics[bossStatKey(floor)] = statistic(save, bossStatKey(floor)) + 1;
  statistics[STAT_DEEPEST_FLOOR] = Math.max(statistic(save, STAT_DEEPEST_FLOOR), floor);
  return grantEarnedUnlocks({ ...save, statistics }, content);
}

/**
 * Records one won boss fight's run feats (#502) — how it went, folded into
 * the save's statistics (`app/meta/feats.ts`). Committed once per fight, on
 * the same edge `withBossDefeat` is.
 */
export function withBossFight(
  save: SaveData,
  record: BossFightRecord,
  content: ProgressionContent,
): SaveData {
  return grantEarnedUnlocks(
    { ...save, statistics: foldBossFight(save.statistics, record) },
    content,
  );
}

/**
 * Records a run's bests so far (#502) — the deepest tier, the most Maß, the
 * most passives held, the sets completed. Merged as maxima, so committing
 * the same run again as its bests move is harmless; returns the very same
 * save when nothing improved, so a caller can skip the write.
 */
export function withRunBests(
  save: SaveData,
  bests: RunBests,
  content: ProgressionContent,
): SaveData {
  const statistics = foldRunBests(save.statistics, bests);
  const changed = Object.keys(statistics).some((key) => statistics[key] !== save.statistics[key]);
  return changed ? grantEarnedUnlocks({ ...save, statistics }, content) : save;
}

/**
 * Everything `save` has earned, by name — the unlocks granted and the
 * characters whose conditions are met. Compared before and after a mid-run
 * commit (`app/main.ts`) to announce what just arrived.
 */
export function earnedNames(save: SaveData, content: ProgressionContent): Map<string, string> {
  const earned = new Map<string, string>();
  const granted = new Set(save.unlocks);
  for (const unlock of content.unlocks) {
    if (granted.has(unlock.id)) {
      earned.set(`unlock:${unlock.id}`, unlock.name);
    }
  }
  for (const character of content.characters) {
    if (character.requires !== null && characterUnlocked(save, character)) {
      earned.set(`character:${character.id}`, character.name);
    }
  }
  // Each rung of each character's ladder (#505), named by its placeholder
  // label until the owner names the ladder.
  for (const character of content.characters) {
    const open = highestTierOpen(save, content, character.id);
    for (let tier = 1; tier <= open; tier++) {
      earned.set(`tier:${character.id}:${String(tier)}`, `${tierLabel(tier)} (${character.name})`);
    }
  }
  // Medals (#506), announced by their goal.
  const medals = new Set(save.achievements);
  for (const medal of content.medals ?? []) {
    if (medals.has(medal.id)) {
      earned.set(`medal:${medal.id}`, `Medal: ${medal.goal}`);
    }
  }
  // An item stays a surprise until it is offered (#503): announced, never named.
  for (const item of content.items ?? []) {
    if (conditionMet(save, item.condition)) {
      earned.set(`item:${item.itemId}`, EARNED_ITEM_NAME);
    }
  }
  return earned;
}

/** The top rung of `content`'s difficulty ladder (#505) — `0` with no ladder at all. */
export function highestTier(content: ProgressionContent): number {
  return Math.max(0, ...(content.tiers ?? []).map((rung) => rung.tier));
}

/**
 * The highest difficulty tier open to `character` (#505): one above the best
 * tier they have won on, capped at the top of the ladder — `0` until their
 * first win. Per character: Resi's ladder is not Alois's.
 */
export function highestTierOpen(
  save: SaveData,
  content: ProgressionContent,
  character: string,
): number {
  return Math.min(highestTier(content), statistic(save, tierWonStatKey(character)));
}

/**
 * Records a won run — the current last boss beaten (#505) — as `character`
 * on `tier`, which opens the next rung for them. Winning a lower tier again
 * never closes a higher one.
 */
export function withRunWon(
  save: SaveData,
  character: string,
  tier: number,
  content: ProgressionContent,
  win: WinFacts = { ticks: Number.POSITIVE_INFINITY, bossHits: 1, itemsPickedUp: 1 },
  challenge: string | null = null,
): SaveData {
  const key = tierWonStatKey(character);
  const statistics: Record<string, number> = {
    ...save.statistics,
    [key]: Math.max(statistic(save, key), tier + 1),
  };
  // How the win went (#506), for the medals that ask.
  if (Number.isFinite(win.ticks)) {
    const fastest = statistics[STAT_WIN_FASTEST_TICKS];
    statistics[STAT_WIN_FASTEST_TICKS] =
      fastest === undefined ? win.ticks : Math.min(fastest, win.ticks);
  }
  if (win.bossHits === 0) {
    statistics[STAT_WIN_NO_BOSS_HITS] = statistic(save, STAT_WIN_NO_BOSS_HITS) + 1;
  }
  if (win.itemsPickedUp === 0) {
    statistics[STAT_WIN_NO_ITEMS] = statistic(save, STAT_WIN_NO_ITEMS) + 1;
  }
  // A challenge run won (#507) — what its medal asks.
  if (challenge !== null) {
    const won = challengeWonStatKey(challenge);
    statistics[won] = statistic(save, won) + 1;
  }
  return grantEarnedUnlocks({ ...save, statistics }, content);
}

/**
 * How a won run went (#506) — read off the run's own `GameSim` at the end:
 * its length, every hit a boss landed across all of its boss fights, and the
 * items picked up during play.
 */
export interface WinFacts {
  readonly ticks: number;
  readonly bossHits: number;
  readonly itemsPickedUp: number;
}

/**
 * Whether the challenge runs (#507) are open: the game has been won at
 * least once, by anyone, on anything. Before that the title has no entry
 * for them at all. Read off the tier ladder's per-character win record
 * (#505) and the fastest-win record (#506), so a win from before either
 * still counts as long as one of them saw it.
 */
export function challengesOpen(save: SaveData, content: ProgressionContent): boolean {
  if (save.statistics[STAT_WIN_FASTEST_TICKS] !== undefined) {
    return true;
  }
  return content.characters.some((character) => statistic(save, tierWonStatKey(character.id)) > 0);
}

/** One challenge as the challenge list shows it (#507). */
export interface ChallengeView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Won at least once. */
  readonly completed: boolean;
}

export function buildChallengeList(save: SaveData, content: ProgressionContent): ChallengeView[] {
  return (content.challenges ?? []).map((challenge: ChallengeDefinition) => ({
    id: challenge.id,
    name: challenge.name,
    description: challenge.description,
    completed: statistic(save, challengeWonStatKey(challenge.id)) > 0,
  }));
}

/** One medal on the shelf (#506). */
export interface MedalView {
  readonly id: string;
  /** The goal, or "???" for a hidden medal not yet earned. */
  readonly text: string;
  readonly earned: boolean;
}

/** Everything the medal shelf draws (#506), earned ones first. */
export interface MedalShelfView {
  readonly earned: number;
  readonly total: number;
  readonly medals: readonly MedalView[];
}

export function buildMedalShelf(save: SaveData, content: ProgressionContent): MedalShelfView {
  const earned = new Set(save.achievements);
  const medals = (content.medals ?? []).map((medal: MedalDefinition) => {
    const has = earned.has(medal.id);
    return {
      id: medal.id,
      text: has || medal.hidden !== true ? medal.goal : HIDDEN_MEDAL,
      earned: has,
    };
  });
  return {
    earned: medals.filter((medal) => medal.earned).length,
    total: medals.length,
    medals: [...medals.filter((medal) => medal.earned), ...medals.filter((medal) => !medal.earned)],
  };
}

/** What a hidden, unearned medal says on the shelf. */
export const HIDDEN_MEDAL = '???';

/** What `earnedNames` calls an earned item — the toast reads "Unlocked: ???". */
export const EARNED_ITEM_NAME = '???';

/**
 * The items this save has not earned yet (#503) — what the next run is told
 * to leave out of every pool (`GameSimOptions.lockedItems`). In roster
 * order, so the same save always produces the same list.
 */
export function lockedItemIds(save: SaveData, content: ProgressionContent): string[] {
  return (content.items ?? [])
    .filter((item) => !conditionMet(save, item.condition))
    .map((item) => item.itemId);
}

/**
 * What still earns `itemId`, for the Collection's locked silhouette — `null`
 * when the item is not on the unlock roster or has already been earned.
 */
export function lockedItemGoal(
  save: SaveData,
  content: ProgressionContent,
  itemId: string,
): string | null {
  const entry = (content.items ?? []).find((item) => item.itemId === itemId);
  return entry === undefined || conditionMet(save, entry.condition) ? null : entry.goal;
}

/**
 * Records a finished run: the summary the results screen leads with, the
 * running totals later unlocks are earned with, and the best-runs list.
 *
 * The best-runs insert lives here rather than beside the active-run recorder
 * it started next to (#45), so that "a run ended" is one commit against the
 * save instead of two writes that could disagree about whether it happened.
 */
export function withRunOutcome(
  save: SaveData,
  record: BestRunRecord,
  content: ProgressionContent,
): SaveData {
  const statistics = { ...save.statistics };
  statistics[STAT_RUNS] = statistic(save, STAT_RUNS) + 1;
  statistics[STAT_KILLS] = statistic(save, STAT_KILLS) + record.kills;
  statistics[STAT_TICKS] = statistic(save, STAT_TICKS) + record.ticksSurvived;
  statistics[STAT_DEEPEST_FLOOR] = Math.max(statistic(save, STAT_DEEPEST_FLOOR), record.floor);
  const bestRuns = [...save.bestRuns, record]
    .sort((a, b) => b.ticksSurvived - a.ticksSurvived)
    .slice(0, MAX_BEST_RUNS);
  return grantEarnedUnlocks({ ...save, statistics, bestRuns, lastRun: record }, content);
}

/**
 * Records who the next run starts as.
 *
 * Refuses an id that is not on the roster or is still locked, rather than
 * storing it and letting the fallback quietly correct it later: the caller
 * is a menu that should not be able to offer a locked row, and a rejected
 * write is how a bug in that menu shows up as "the cursor won't move"
 * instead of as a run that silently started as somebody else.
 */
export function withSelectedCharacter(
  save: SaveData,
  id: string,
  content: ProgressionContent,
): SaveData {
  const character = characterById(content, id);
  if (character === undefined || !characterUnlocked(save, character)) {
    return save;
  }
  return save.selectedCharacter === id ? save : { ...save, selectedCharacter: id };
}

/**
 * The next unlocked character `delta` steps along the roster from the
 * currently selected one, wrapping.
 *
 * Locked rows are skipped rather than landed on and refused — they are still
 * drawn wherever the roster is shown, so the player can see what they are
 * missing, but the cursor never rests somewhere it cannot start a run from.
 */
export function cycleCharacter(save: SaveData, content: ProgressionContent, delta: number): string {
  const roster = content.characters;
  const current = selectedCharacterId(save, content);
  const start = roster.findIndex((character) => character.id === current);
  const step = delta < 0 ? -1 : 1;
  for (let offset = 1; offset <= roster.length; offset++) {
    const index = (((start + offset * step) % roster.length) + roster.length) % roster.length;
    const candidate = roster[index];
    if (candidate !== undefined && characterUnlocked(save, candidate)) {
      return candidate.id;
    }
  }
  return current;
}

/**
 * How the selected character actually plays — the one value `app/main.ts`
 * hands `GameSim` when a run starts.
 *
 * Falls back to `NEUTRAL_TRAITS` rather than throwing on a roster that
 * somehow matches nothing: a run that starts as Alois is a run, and a
 * `startRun` that throws is a black screen. The roster is covered by
 * `tests/content/characters.test.ts`, which is where an empty one should
 * fail.
 */
export function selectedCharacterTraits(
  save: SaveData,
  content: ProgressionContent,
): CharacterTraits {
  const id = selectedCharacterId(save, content);
  return characterById(content, id)?.traits ?? NEUTRAL_TRAITS;
}

/**
 * Every condition on the roster met at once — the debug handle's "show me
 * all of it".
 *
 * Walks the conditions rather than listing the statistics they happen to
 * read, so a character or an unlock added later is covered without anybody
 * remembering to extend this.
 */
export function withEverythingUnlocked(save: SaveData, content: ProgressionContent): SaveData {
  const statistics = { ...save.statistics };
  const conditions: UnlockCondition[] = [
    ...content.unlocks.map((unlock) => unlock.condition),
    ...content.characters
      .map((character) => character.requires)
      .filter((requires): requires is UnlockCondition => requires !== null),
    ...(content.items ?? []).map((item) => item.condition),
  ];
  for (const condition of conditions) {
    if (condition.kind === 'bossDefeated') {
      const key = bossStatKey(condition.floor);
      statistics[key] = Math.max(statistics[key] ?? 0, 1);
    } else if (condition.kind === 'bossFeat') {
      satisfyBossFeat(statistics, condition.floor, condition.feat, condition.times);
    } else {
      statistics[condition.stat] = Math.max(statistics[condition.stat] ?? 0, condition.value);
    }
  }
  // Every rung of every character's ladder (#505).
  for (const character of content.characters) {
    const key = tierWonStatKey(character.id);
    statistics[key] = Math.max(statistics[key] ?? 0, highestTier(content));
  }
  return grantEarnedUnlocks({ ...save, statistics }, content);
}

/**
 * Records a daily run's result (#48), but only the first time `date` is
 * seen — "one attempt" for a save with no server to enforce it means the
 * entry already in `dailyRunHistory` for that date is the one that counts,
 * and a later replay of the same daily seed (for fun, or to see how it goes
 * differently) leaves it untouched. `withRunOutcome` still runs on every
 * daily run regardless — the totals and best-runs board do not distinguish
 * a daily run from an ordinary one, only `dailyRunHistory` does.
 */
export function withDailyRunOutcome(save: SaveData, record: DailyRunRecord): SaveData {
  if (save.dailyRunHistory.some((entry) => entry.date === record.date)) {
    return save;
  }
  return { ...save, dailyRunHistory: [...save.dailyRunHistory, record] };
}

/** Today's daily-run seed and whether it has already been played, from the save alone. */
export interface DailyStatus {
  readonly seed: number;
  readonly playedToday: DailyRunRecord | null;
}

export function dailyStatus(save: SaveData, todayKey: string): DailyStatus {
  return {
    seed: dailySeed(todayKey),
    playedToday: save.dailyRunHistory.find((entry) => entry.date === todayKey) ?? null,
  };
}

/** German decimals, because everything else on this screen is in German too. */
function seconds(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} s`;
}

/** One row of the run-start roster. */
export interface CharacterView {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly unlocked: boolean;
  /** What would earn them. Empty once they are earned — a met goal is not news. */
  readonly goal: string;
  /** "240 / 400" while locked and countable, `null` for a one-shot condition or an unlocked row. */
  readonly progress: string | null;
}

/** Whether `save` has met what `character` asks for. Alois (`requires: null`) is always true. */
export function characterUnlocked(save: SaveData, character: CharacterDefinition): boolean {
  return character.requires === null || conditionMet(save, character.requires);
}

export function characterView(save: SaveData, character: CharacterDefinition): CharacterView {
  const unlocked = characterUnlocked(save, character);
  const progress = character.requires === null ? null : conditionProgress(save, character.requires);
  return {
    id: character.id,
    name: character.name,
    note: character.note,
    unlocked,
    goal: unlocked ? '' : character.goal,
    progress:
      unlocked || progress === null || progress.goal <= 1
        ? null
        : `${String(progress.current)} / ${String(progress.goal)}`,
  };
}

/**
 * The character the next run starts as: the saved choice, if it still exists
 * and is still unlocked, and otherwise the first unlocked row.
 *
 * Falling back rather than trusting the save is not paranoia about
 * `localStorage` — it is what happens on an ordinary
 * `__kellerbier.progression.resetProgress()`, or the day a character's
 * unlock condition is re-tuned upward. A saved id nobody can play any more
 * must not be able to start a run.
 */
export function selectedCharacterId(save: SaveData, content: ProgressionContent): string {
  const chosen = content.characters.find((character) => character.id === save.selectedCharacter);
  if (chosen !== undefined && characterUnlocked(save, chosen)) {
    return chosen.id;
  }
  return content.characters.find((character) => characterUnlocked(save, character))?.id ?? '';
}

/**
 * The character `id` names, or the first unlocked one — the run-start path's
 * one lookup, so `app/main.ts` never has to know what happens when a save
 * names a character that has since been renamed.
 */
export function characterById(
  content: ProgressionContent,
  id: string,
): CharacterDefinition | undefined {
  return content.characters.find((character) => character.id === id);
}

/** One rung of the selected character's ladder, as the run-setup screen lists it (#505). */
export interface TierView {
  readonly tier: number;
  readonly label: string;
  /** What this rung adds on top of the ones below it. */
  readonly adds: string;
}

/** One boss mark on the run-setup screen (#504): has this character beaten this floor's boss? */
export interface BossMarkView {
  readonly floor: number;
  /** The floor's name — the marks are labelled by where the boss lives, not by its body. */
  readonly name: string;
  readonly beaten: boolean;
}

/**
 * The selected character's boss marks (#504) — one per floor a player can
 * reach (`HIGHEST_PLAYABLE_FLOOR`), so the floor that raises it adds a mark
 * for everyone without anybody remembering to.
 *
 * Read from the per-character tally run feats already keep
 * (`bossAsCharacterStatKey`, #502), counted only on fights the player won.
 * Kills from before #502 carry no character, so they mark nobody: a save
 * cannot prove who beat a boss before it recorded who was playing.
 */
export function bossMarks(save: SaveData, character: string): BossMarkView[] {
  const marks: BossMarkView[] = [];
  for (let floor = 1; floor <= HIGHEST_PLAYABLE_FLOOR; floor++) {
    marks.push({
      floor,
      name: floorName(floor),
      beaten: statistic(save, bossAsCharacterStatKey(floor, character)) > 0,
    });
  }
  return marks;
}

/**
 * Everything the run-setup screen (#493) draws: the roster, who is selected,
 * and the tiers open to them (#505). Built here so the screen holds no rules.
 */
export interface RunSetupView {
  readonly characters: readonly CharacterView[];
  readonly selected: string;
  /** The highest tier open to the selected character — `0` until their first win. */
  readonly highestOpen: number;
  /** Rungs 1..`highestOpen` of the selected character's ladder, in order. */
  readonly tiers: readonly TierView[];
  /** The selected character's boss marks (#504), floor 1 first. */
  readonly marks: readonly BossMarkView[];
}

export function buildRunSetupView(save: SaveData, content: ProgressionContent): RunSetupView {
  const selected = selectedCharacterId(save, content);
  const highestOpen = highestTierOpen(save, content, selected);
  return {
    characters: content.characters.map((character) => characterView(save, character)),
    selected,
    highestOpen,
    tiers: (content.tiers ?? [])
      .filter((rung) => rung.tier >= 1 && rung.tier <= highestOpen)
      .sort((a, b) => a.tier - b.tier)
      .map((rung) => ({ tier: rung.tier, label: tierLabel(rung.tier), adds: rung.description })),
    marks: bossMarks(save, selected),
  };
}

/** One unlock, as the results screen needs it. */
export interface UnlockView {
  readonly id: string;
  readonly name: string;
  readonly unlocked: boolean;
  /** What it does, once unlocked. Empty while locked. */
  readonly effect: string;
  /** What earns it. Empty once it is earned — a met goal is not news. */
  readonly goal: string;
  /** "40 / 200" while locked and countable, `null` for a one-shot condition or an unlocked row. */
  readonly progress: string | null;
}

function unlockView(save: SaveData, unlock: UnlockDefinition, unlocked: Set<string>): UnlockView {
  const isUnlocked = unlocked.has(unlock.id);
  const progress = conditionProgress(save, unlock.condition);
  return {
    id: unlock.id,
    name: unlock.name,
    unlocked: isUnlocked,
    effect: isUnlocked ? unlock.effect : '',
    goal: isUnlocked ? '' : unlock.goal,
    progress:
      isUnlocked || progress.goal <= 1
        ? null
        : `${String(progress.current)} / ${String(progress.goal)}`,
  };
}

/**
 * A difficulty tier's on-screen name (#505). "Tier N" is a placeholder the
 * owner will replace — one function, so the rename is one line.
 */
export function tierLabel(tier: number): string {
  return `Tier ${String(tier)}`;
}

/** The unlock id the Promille mechanic itself is gated behind (#85) — read at run start, see `app/promille-gate.ts`. */
export const UNLOCK_PROMILLE = 'promille';
/** The unlock id the run board is gated behind — see `content/progression/unlocks.ts`. */
export const UNLOCK_BOARD = 'run-board';

/** Everything `render/run-results.ts` draws. Assembled here so the screen holds no rules of its own. */
export interface RunResultsView {
  readonly lastRun: RunFacts | null;
  /** The last run as the screen's own subtitle — formatted here, so the wording is testable. */
  readonly lastRunLine: string;
  readonly unlocks: readonly UnlockView[];
  /** The board's rows, longest run first, or `null` while the board itself is still locked. */
  readonly board: readonly string[] | null;
  readonly runsPlayed: number;
  readonly totalKills: number;
  /** Names of the items the last run earned into the pool (#503), in roster order. */
  readonly newItems: readonly string[];
  /** Difficulty tiers the last run opened (#505), as "Tier 1 (Alois)". */
  readonly newTiers: readonly string[];
  /** Medals the last run earned (#506), by goal. */
  readonly newMedals: readonly string[];
}

export function buildRunResultsView(
  save: SaveData,
  content: ProgressionContent,
  locale: Locale,
  newItems: readonly string[] = [],
  newTiers: readonly string[] = [],
  newMedals: readonly string[] = [],
): RunResultsView {
  const lastRun = save.lastRun === null ? null : runFactsFrom(save.lastRun);
  const unlocked = new Set(save.unlocks);
  return {
    lastRun,
    lastRunLine: lastRunLine(lastRun, locale),
    unlocks: content.unlocks.map((unlock) => unlockView(save, unlock, unlocked)),
    board: unlocked.has(UNLOCK_BOARD)
      ? save.bestRuns.map((record, index) => boardRow(record, locale, index))
      : null,
    runsPlayed: statistic(save, STAT_RUNS),
    totalKills: statistic(save, STAT_KILLS),
    newItems,
    newTiers,
    newMedals,
  };
}

/** One line of the run board: place, how long it lasted, how much it took with it. */
export function boardRow(record: BestRunRecord, locale: Locale, index = 0): string {
  const run = runFactsFrom(record);
  return t(locale, 'ui.results.boardRow', {
    place: index + 1,
    seconds: seconds(run.seconds),
    kills: run.kills,
    floor: run.floorName,
  });
}

/** The last run as the one line the results screen leads with. Plain English (#221) — read every time the screen opens. */
export function lastRunLine(run: RunFacts | null, locale: Locale): string {
  if (run === null) {
    return t(locale, 'ui.results.noLastRun');
  }
  const word =
    run.deathWord === null ? '' : t(locale, 'ui.results.lastRunDeathWord', { word: run.deathWord });
  return t(locale, 'ui.results.lastRun', {
    seconds: seconds(run.seconds),
    kills: run.kills,
    floor: run.floorName,
    word,
  });
}
