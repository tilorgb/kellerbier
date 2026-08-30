import { FLOOR_CONFIGS } from '../../content/floors/definition.js';
import { TICKS_PER_SECOND } from '../../sim/time.js';
import { type BestRunRecord, type SaveData, MAX_BEST_RUNS } from '../save/schema.js';
import {
  type LineCondition,
  type RegularDefinition,
  type StammtischContent,
  type UnlockCondition,
  type UnlockDefinition,
  STAT_DEEPEST_FLOOR,
  STAT_KILLS,
  STAT_RUNS,
  STAT_TICKS,
  bossStatKey,
} from './definition.js';

/**
 * The Stammtisch's rules (#46), as pure functions over a `SaveData`.
 *
 * Everything here takes a save and returns a new one, or takes a save and
 * returns something to draw. Nothing reaches for `localStorage`, a `GameSim`
 * or a `Container` — `meta/index.ts` is the thin layer that persists the
 * results, `render/stammtisch.ts` is the thin layer that draws them, and this
 * is where the decisions live, so all of it is testable without a browser.
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

/** The one run the regulars talk about, in the units a line quotes it in. */
export interface RunFacts {
  readonly seed: number;
  readonly floor: number;
  readonly floorName: string;
  readonly seconds: number;
  readonly kills: number;
  readonly deathWord: string | null;
}

/** How far along a goal the player is — shown under a locked seat so a goal is legible, not mysterious. */
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
 * order they were earned in — `unlocks` doubles as the arrival order at the
 * table, so a regular who turns up later sits down later.
 */
export function grantEarnedUnlocks(save: SaveData, content: StammtischContent): SaveData {
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
  content: StammtischContent,
): SaveData {
  const statistics = { ...save.statistics };
  statistics[bossStatKey(floor)] = statistic(save, bossStatKey(floor)) + 1;
  statistics[STAT_DEEPEST_FLOOR] = Math.max(statistic(save, STAT_DEEPEST_FLOOR), floor);
  return grantEarnedUnlocks({ ...save, statistics }, content);
}

/**
 * Records a finished run: the summary the regulars comment on, the running
 * totals the later seats are earned with, and the best-runs list.
 *
 * The best-runs insert lives here rather than beside the active-run recorder
 * it started next to (#45), so that "a run ended" is one commit against the
 * save instead of two writes that could disagree about whether it happened.
 */
export function withRunOutcome(
  save: SaveData,
  record: BestRunRecord,
  content: StammtischContent,
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

/** Marks every seated regular as having said hello, so an arrival line only plays once. */
export function withGreetings(save: SaveData, ids: readonly string[]): SaveData {
  const greeted = new Set(save.greetedRegulars);
  const added = ids.filter((id) => !greeted.has(id));
  return added.length === 0
    ? save
    : { ...save, greetedRegulars: [...save.greetedRegulars, ...added] };
}

function lineMatches(condition: LineCondition, run: RunFacts | null): boolean {
  if (run === null) {
    return condition.kind === 'noRun' || condition.kind === 'always';
  }
  switch (condition.kind) {
    case 'always':
      return true;
    case 'noRun':
      return false;
    case 'diedOnFloor':
      return run.floor === condition.floor;
    case 'reachedFloor':
      return run.floor >= condition.floor;
    case 'shorterThan':
      return run.seconds < condition.seconds;
    case 'longerThan':
      return run.seconds > condition.seconds;
    case 'killsBelow':
      return run.kills < condition.kills;
    case 'killsAtLeast':
      return run.kills >= condition.kills;
  }
}

/** German decimals, because everything else on this screen is in German too. */
function seconds(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} s`;
}

/**
 * Fills a line's `{sek}`/`{kills}`/`{stock}`/`{wort}` tokens from the run.
 *
 * A line with no run to quote keeps its tokens out of the player's way by
 * falling back to a dash rather than printing "undefined" — but no authored
 * line should reach that case, since a line carrying a token is authored
 * under a condition that already requires a run.
 */
export function fillTokens(text: string, run: RunFacts | null): string {
  return text
    .replace('{sek}', run === null ? '—' : seconds(run.seconds))
    .replace('{kills}', run === null ? '—' : String(run.kills))
    .replace('{stock}', run === null ? '—' : run.floorName)
    .replace('{wort}', run?.deathWord ?? '—');
}

/**
 * Which line a regular says about `run`.
 *
 * Specific beats generic: a line conditioned on the run wins over the
 * catch-all, always. Among equally specific matches the run's own seed picks
 * one, so the table is not word-for-word identical between two runs that
 * happened to end the same way — and it is still deterministic, so a test can
 * pin it and a replay of the same run says the same thing.
 */
export function pickLine(regular: RegularDefinition, run: RunFacts | null): string {
  const matches = regular.lines.filter((line) => lineMatches(line.when, run));
  const specific = matches.filter((line) => line.when.kind !== 'always');
  const pool = specific.length > 0 ? specific : matches;
  if (pool.length === 0) {
    return regular.greeting;
  }
  const index = run === null ? 0 : Math.abs(Math.trunc(run.seed)) % pool.length;
  return fillTokens((pool[index] ?? pool[0])?.text ?? regular.greeting, run);
}

/** One chair at the table, as the screen needs it. */
export interface SeatView {
  readonly id: string;
  /** The regular's name once they are seated, or `null` while the chair is empty. */
  readonly name: string | null;
  readonly role: string;
  readonly seated: boolean;
  /** True on the first visit after they arrive — the screen opens on this seat and plays the greeting. */
  readonly arriving: boolean;
  /** What they say: their greeting on arrival, a comment on the last run afterwards, the goal while empty. */
  readonly line: string;
  readonly grantName: string;
  readonly grantEffect: string;
  readonly goal: string;
  /** `null` once the seat is filled — otherwise "3 / 5", so a goal is a number and not a mystery. */
  readonly progress: string | null;
}

/** Everything `render/stammtisch.ts` draws. Assembled here so the screen holds no rules of its own. */
export interface StammtischView {
  readonly lastRun: RunFacts | null;
  /** The last run as the screen's own subtitle — formatted here, so the wording is testable. */
  readonly lastRunLine: string;
  readonly seats: readonly SeatView[];
  /** Index into `seats` the screen should open on — an arriving regular, else the first empty chair. */
  readonly openOn: number;
  readonly characters: readonly {
    readonly name: string;
    readonly note: string;
    readonly unlocked: boolean;
  }[];
  /** The board's rows, longest run first, or `null` while the board itself is still locked. */
  readonly board: readonly string[] | null;
  /** Whether the run-start panel offers a seed to change. */
  readonly seedUnlocked: boolean;
  readonly runsPlayed: number;
  readonly totalKills: number;
}

/**
 * The unlock id the Promille mechanic itself is gated behind (#85) — Da
 * Xaver's, earned by beating Der Stier. Read at run start rather than by the
 * hub: see `app/promille-gate.ts`.
 */
export const UNLOCK_PROMILLE = 'promille';
/** The unlock id the run board is gated behind — see `content/stammtisch/unlocks.ts`. */
export const UNLOCK_BOARD = 'stammtisch-tafel';
/** The unlock id the seed row is gated behind. */
export const UNLOCK_SEED = 'stammtisch-zufoi';

function unlockById(content: StammtischContent, id: string): UnlockDefinition | undefined {
  return content.unlocks.find((unlock) => unlock.id === id);
}

export function buildStammtischView(save: SaveData, content: StammtischContent): StammtischView {
  const lastRun = save.lastRun === null ? null : runFactsFrom(save.lastRun);
  const unlocked = new Set(save.unlocks);
  const greeted = new Set(save.greetedRegulars);
  const seats = [...content.regulars]
    .sort((a, b) => a.seat - b.seat)
    .map((regular): SeatView => {
      const grant = unlockById(content, regular.grants);
      const seated = unlocked.has(regular.grants);
      const arriving = seated && !greeted.has(regular.id);
      const progress = grant === undefined ? null : conditionProgress(save, grant.condition);
      return {
        id: regular.id,
        name: seated ? regular.name : null,
        // An empty chair has no role line at all rather than a placeholder
        // one: "no name yet" is not information, and the sentence under the
        // padlock — what it would take to fill this chair — is.
        role: seated ? regular.role : '',
        seated,
        arriving,
        line: seated ? (arriving ? regular.greeting : pickLine(regular, lastRun)) : regular.waiting,
        grantName: grant?.name ?? regular.grants,
        grantEffect: grant?.effect ?? '',
        goal: grant?.goal ?? '',
        progress:
          seated || progress === null || progress.goal <= 1
            ? null
            : `${String(progress.current)} / ${String(progress.goal)}`,
      };
    });
  const arriving = seats.findIndex((seat) => seat.arriving);
  const empty = seats.findIndex((seat) => !seat.seated);
  return {
    lastRun,
    lastRunLine: lastRunLine(lastRun),
    seats,
    openOn: arriving >= 0 ? arriving : empty >= 0 ? empty : 0,
    characters: content.characters.map((character) => ({
      name: character.name,
      note: character.note,
      unlocked: character.requires === null || unlocked.has(character.requires),
    })),
    board: unlocked.has(UNLOCK_BOARD) ? save.bestRuns.map(boardRow) : null,
    seedUnlocked: unlocked.has(UNLOCK_SEED),
    runsPlayed: statistic(save, STAT_RUNS),
    totalKills: statistic(save, STAT_KILLS),
  };
}

/** One line of the run board: place, how long it lasted, how much it took with it. */
export function boardRow(record: BestRunRecord, index = 0): string {
  const run = runFactsFrom(record);
  return `${String(index + 1)}.  ${seconds(run.seconds)}   ${String(run.kills)} daschlogn   ${run.floorName}`;
}

/** The last run as the one line the hub leads with. */
export function lastRunLine(run: RunFacts | null): string {
  if (run === null) {
    return 'No koa Lauf gspielt — der Keller wart scho.';
  }
  const word = run.deathWord === null ? '' : `  „${run.deathWord}“`;
  return `Letzter Lauf — ${seconds(run.seconds)}  ·  ${String(run.kills)} daschlogn  ·  ${run.floorName}${word}`;
}
