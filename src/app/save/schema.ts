import {
  type AccessibilitySettings,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  sanitizeAccessibilitySettings,
} from '../settings.js';

/**
 * The persisted save (#45): a single versioned JSON blob, per
 * `docs/GAME_DESIGN.md` §11 and `docs/DECISIONS.md` #50.
 *
 * `achievements` and `dailyRunHistory` still have nothing writing them —
 * #48 and #50 are the milestones that populate them. They are typed and
 * persisted from day one anyway, per #45's own note: shipping the versioning
 * before the first real save exists is what lets an early tester's progress
 * survive the schema growing later.
 *
 * v2 is the first time that promise was cashed in. The Stammtisch (#46)
 * needed two stores v1 had no room for — the run the regulars comment on,
 * and which of them have already said hello — so v1 saves migrate rather
 * than reset (`migrations.ts`). `unlocks` and `statistics` were already
 * there and needed no change at all, which is the version-from-day-one
 * argument working exactly as advertised.
 *
 * v3 (#85) adds one field to the in-progress run: whether it is a sober run
 * or a promilled one. That is not redundant with `unlocks`, and the reason
 * is a real bug rather than tidiness — see `ActiveRunSave.promilleUnlocked`.
 */
export const SAVE_SCHEMA_VERSION = 3;

/** A completed run, kept for the "best runs" list. */
export interface BestRunRecord {
  readonly seed: number;
  readonly floor: number;
  readonly ticksSurvived: number;
  readonly kills: number;
  readonly deathWord: string | null;
  /** `Date.now()` when the run ended — not simulation state, just a sort key. */
  readonly recordedAt: number;
}

/**
 * One day's daily-run result. Nothing writes these yet — the daily run
 * itself is #48 — but the shape is fixed now so #48 lands data into an
 * existing, versioned array rather than inventing storage for it later.
 */
export interface DailyRunRecord {
  /** `YYYY-MM-DD`, in the player's local time. */
  readonly date: string;
  readonly seed: number;
  readonly ticksSurvived: number;
  readonly kills: number;
}

/**
 * The in-progress run, if the tab was closed (or reloaded) mid-run.
 *
 * Deliberately *not* a snapshot of `GameSim`'s internals. `GameSim`'s own
 * class doc comment already makes the guarantee this leans on: it "reads a
 * single `InputFrame` per tick and nothing else … which is what makes a run
 * reproducible from a seed and an input log." Recording the seed and the
 * exact input log and replaying both on resume reconstructs every last bit
 * of simulation state — including RNG stream position — for free, using the
 * determinism the sim already guarantees, rather than hand-serialising the
 * few thousand lines of ECS/room/inventory state `GameSim` carries and
 * hoping nothing was missed. It is also exactly the artifact #48's replay
 * recording needs, so this groundwork is not resume-only.
 *
 * `frames` is flat: every `FRAME_LOG_STRIDE` numbers is one `InputFrame`,
 * in `[moveX, moveY, aimX, aimY, buttons]` order (see `active-run.ts`).
 */
export interface ActiveRunSave {
  readonly seed: number;
  readonly frames: readonly number[];
  /**
   * Whether the run being resumed has the Promille mechanic (#85).
   *
   * Recorded with the log rather than re-derived from `unlocks` on resume,
   * because the two genuinely disagree in the case that matters: the
   * Promille unlock is granted the moment Der Stier goes down
   * (`withBossDefeat` commits immediately, on purpose), so a player who
   * beats him and then closes the tab has a save whose `unlocks` say
   * "promilled" describing a run that was sober for every tick it recorded.
   * Rebuilding that run promilled would replay the same inputs against
   * different drop tables and a different item pool, and the resumed run
   * would quietly not be the run that was saved.
   *
   * This is also what #85's "the state is part of the run's parameters"
   * means for a shared seed: a run is reproduced by its seed *and* this
   * flag, not by the seed plus whatever the person replaying it happens to
   * have unlocked.
   */
  readonly promilleUnlocked: boolean;
}

/** The v1 shape, kept for the migration that reads it. Nothing loads a save at this version any more. */
export interface SaveDataV1 {
  readonly schemaVersion: 1;
  readonly settings: AccessibilitySettings;
  readonly unlocks: readonly string[];
  readonly achievements: readonly string[];
  readonly statistics: Readonly<Record<string, number>>;
  readonly dailyRunHistory: readonly DailyRunRecord[];
  readonly bestRuns: readonly BestRunRecord[];
  readonly activeRun: ActiveRunSave | null;
}

/**
 * v2 (#46): the Stammtisch's two stores.
 *
 * `lastRun` is deliberately separate from `bestRuns` rather than derived from
 * it. `bestRuns` is sorted by `ticksSurvived` and capped at `MAX_BEST_RUNS`,
 * so the run a player *just* finished is frequently not in it at all — and a
 * table of regulars whose comments silently fall back to the player's best
 * run ever, on the run they just died thirty seconds into, is exactly the
 * generic-feeling text #46's acceptance criterion rules out.
 *
 * `greetedRegulars` is what makes an arrival happen once: a regular who has
 * been unlocked but never greeted opens the hub on their own line ("here is
 * what I brought"), and is a normal seat from the next visit on.
 */
export interface SaveDataV2 extends Omit<SaveDataV1, 'schemaVersion'> {
  readonly schemaVersion: 2;
  readonly lastRun: BestRunRecord | null;
  readonly greetedRegulars: readonly string[];
}

/**
 * v3 (#85): the in-progress run remembers whether it was sober. Only
 * `activeRun`'s own shape changed, so v3 extends v2 with nothing of its own
 * — `ActiveRunSave` is the type that grew, and `sanitizeActiveRun` is where
 * the new field is defended.
 */
export interface SaveDataV3 extends Omit<SaveDataV2, 'schemaVersion'> {
  readonly schemaVersion: 3;
}

/** The current schema version. A union the day a v4 lands and something still reads a v3. */
export type SaveData = SaveDataV3;

/** How many `bestRuns` entries a finished run keeps — see `app/meta/progress.ts`'s `withRunOutcome`. */
export const MAX_BEST_RUNS = 10;

export function createDefaultSave(): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    settings: { ...DEFAULT_ACCESSIBILITY_SETTINGS },
    unlocks: [],
    achievements: [],
    statistics: {},
    dailyRunHistory: [],
    bestRuns: [],
    activeRun: null,
    lastRun: null,
    greetedRegulars: [],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function sanitizeStatistics(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) {
    return {};
  }
  const statistics: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      statistics[key] = entry;
    }
  }
  return statistics;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeDailyRunHistory(value: unknown): DailyRunRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: DailyRunRecord[] = [];
  for (const entry of value) {
    if (
      isPlainObject(entry) &&
      typeof entry.date === 'string' &&
      isFiniteNumber(entry.seed) &&
      isFiniteNumber(entry.ticksSurvived) &&
      isFiniteNumber(entry.kills)
    ) {
      records.push({
        date: entry.date,
        seed: entry.seed,
        ticksSurvived: entry.ticksSurvived,
        kills: entry.kills,
      });
    }
  }
  return records;
}

function sanitizeBestRun(value: unknown): BestRunRecord | null {
  if (
    !isPlainObject(value) ||
    !isFiniteNumber(value.seed) ||
    !isFiniteNumber(value.floor) ||
    !isFiniteNumber(value.ticksSurvived) ||
    !isFiniteNumber(value.kills) ||
    !isFiniteNumber(value.recordedAt)
  ) {
    return null;
  }
  return {
    seed: value.seed,
    floor: value.floor,
    ticksSurvived: value.ticksSurvived,
    kills: value.kills,
    deathWord: typeof value.deathWord === 'string' ? value.deathWord : null,
    recordedAt: value.recordedAt,
  };
}

function sanitizeBestRuns(value: unknown): BestRunRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: BestRunRecord[] = [];
  for (const entry of value) {
    const record = sanitizeBestRun(entry);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

function sanitizeActiveRun(value: unknown): ActiveRunSave | null {
  if (!isPlainObject(value)) {
    return null;
  }
  if (!isFiniteNumber(value.seed) || !Array.isArray(value.frames)) {
    return null;
  }
  const frames = value.frames.filter((entry): entry is number => isFiniteNumber(entry));
  if (frames.length !== value.frames.length || frames.length === 0) {
    // A frame log that doesn't decode cleanly, or is empty, is worth no more
    // than no active run at all — `active-run.ts`'s `resumeActiveRun` has
    // nothing to replay either way, and treating it as "no run in progress"
    // is simpler than threading a partial-recovery path through it.
    return null;
  }
  return {
    seed: value.seed,
    frames,
    // Defaults to a promilled run rather than a sober one, matching the v2
    // migration's own back-fill: every run recorded before this field
    // existed was a promilled one, so a log that reaches here without it is
    // far likelier to be one of those (or a hand-edited save) than a sober
    // run whose flag went missing. Defaulting the other way would replay
    // those with beer removed from under them.
    promilleUnlocked: value.promilleUnlocked !== false,
  };
}

/**
 * Coerces an arbitrary parsed value into a full `SaveData`, field-by-field —
 * the same "never throw the whole blob away over one bad field" approach
 * `sanitizeAccessibilitySettings` already uses, extended to every store this
 * save carries. Called on every load, after migration (`migrations.ts`), so
 * a save that is structurally valid JSON but semantically off (a future
 * field this version doesn't know, a field truncated by hand-editing) still
 * comes back playable instead of rejected outright.
 */
export function sanitizeSave(value: unknown): SaveData {
  const source = isPlainObject(value) ? value : {};
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    settings: sanitizeAccessibilitySettings(source.settings),
    unlocks: sanitizeStringArray(source.unlocks),
    achievements: sanitizeStringArray(source.achievements),
    statistics: sanitizeStatistics(source.statistics),
    dailyRunHistory: sanitizeDailyRunHistory(source.dailyRunHistory),
    bestRuns: sanitizeBestRuns(source.bestRuns),
    activeRun: sanitizeActiveRun(source.activeRun),
    lastRun: sanitizeBestRun(source.lastRun),
    greetedRegulars: sanitizeStringArray(source.greetedRegulars),
  };
}
