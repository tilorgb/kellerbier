import { FLOOR_CONFIGS } from '../../content/floors/definition.js';
import { type CharacterTraits, NEUTRAL_TRAITS } from '../../sim/character/definition.js';
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
} from './definition.js';

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
  return earned.length === save.unlocks.length ? save : { ...save, unlocks: earned };
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
  ];
  for (const condition of conditions) {
    if (condition.kind === 'bossDefeated') {
      const key = bossStatKey(condition.floor);
      statistics[key] = Math.max(statistics[key] ?? 0, 1);
    } else {
      statistics[condition.stat] = Math.max(statistics[condition.stat] ?? 0, condition.value);
    }
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
}

export function buildRunResultsView(save: SaveData, content: ProgressionContent): RunResultsView {
  const lastRun = save.lastRun === null ? null : runFactsFrom(save.lastRun);
  const unlocked = new Set(save.unlocks);
  return {
    lastRun,
    lastRunLine: lastRunLine(lastRun),
    unlocks: content.unlocks.map((unlock) => unlockView(save, unlock, unlocked)),
    board: unlocked.has(UNLOCK_BOARD) ? save.bestRuns.map(boardRow) : null,
    runsPlayed: statistic(save, STAT_RUNS),
    totalKills: statistic(save, STAT_KILLS),
  };
}

/** One line of the run board: place, how long it lasted, how much it took with it. */
export function boardRow(record: BestRunRecord, index = 0): string {
  const run = runFactsFrom(record);
  return `${String(index + 1)}.  ${seconds(run.seconds)}   ${String(run.kills)} killed   ${run.floorName}`;
}

/** The last run as the one line the results screen leads with. Plain English (#221) — read every time the screen opens. */
export function lastRunLine(run: RunFacts | null): string {
  if (run === null) {
    return 'No run played yet — the cellar is waiting.';
  }
  const word = run.deathWord === null ? '' : `  "${run.deathWord}"`;
  return `Last run — ${seconds(run.seconds)}  ·  ${String(run.kills)} killed  ·  ${run.floorName}${word}`;
}
