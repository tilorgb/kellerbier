import {
  type AccessibilitySettings,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  sanitizeAccessibilitySettings,
} from '../settings.js';

/**
 * The persisted save (#45): a single versioned JSON blob, per
 * `docs/GAME_DESIGN.md` §11 and `docs/DECISIONS.md` #50.
 *
 * `unlocks`, `achievements`, `dailyRunHistory` and the Stammtisch hub itself
 * do not exist yet — #46, #48 and #50 are the milestones that populate them.
 * They are typed and persisted from day one anyway, per this issue's own
 * note: shipping the versioning before the first real save exists is what
 * lets an early tester's progress survive the schema growing later, instead
 * of everyone's `unlocks` starting from an empty array the day #46 ships.
 */
export const SAVE_SCHEMA_VERSION = 1;

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
}

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

/** The only schema version today. A union once a migration adds a second one. */
export type SaveData = SaveDataV1;

/** How many `bestRuns` entries `recordBestRun` keeps — see `active-run.ts`. */
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

function sanitizeBestRuns(value: unknown): BestRunRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: BestRunRecord[] = [];
  for (const entry of value) {
    if (
      isPlainObject(entry) &&
      isFiniteNumber(entry.seed) &&
      isFiniteNumber(entry.floor) &&
      isFiniteNumber(entry.ticksSurvived) &&
      isFiniteNumber(entry.kills) &&
      isFiniteNumber(entry.recordedAt)
    ) {
      records.push({
        seed: entry.seed,
        floor: entry.floor,
        ticksSurvived: entry.ticksSurvived,
        kills: entry.kills,
        deathWord: typeof entry.deathWord === 'string' ? entry.deathWord : null,
        recordedAt: entry.recordedAt,
      });
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
  return { seed: value.seed, frames };
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
  };
}
