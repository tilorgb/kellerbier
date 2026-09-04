import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlaytestOutcome, PlaytestResult } from './harness.js';

/**
 * What the balance-simulator sweep writes down — same reasoning as
 * `tests/fuzz/lib/report.ts`: a JSON file rather than console output,
 * because `tools/playtest/report.mjs` (a CI step summary, or a person
 * running `npm run playtest` on demand for a balance/gameplay issue) reads
 * it after the fact, not the vitest process itself.
 */

export interface RunSummary {
  readonly seed: number;
  readonly skill: string;
  readonly loadoutItemIds: readonly string[];
  readonly result: PlaytestResult;
  readonly floorsReached: number;
  readonly ticksCompleted: number;
  readonly damageTaken: number;
}

export interface FailureSummary {
  readonly seed: number;
  readonly skill: string;
  readonly loadoutItemIds: readonly string[];
  readonly errorMessage: string | undefined;
  readonly floorsReached: number;
}

export interface FloorStats {
  readonly floor: number;
  /** Runs that recorded any time on this floor at all. */
  readonly attempts: number;
  /** Of those, how many ended the run (death, stuck, or a crash) while still on it. */
  readonly endedHere: number;
  readonly avgTicks: number;
  readonly avgDamageTaken: number;
  readonly avgRoomsCleared: number;
}

/** One item's showing across the sweep — #54's "item win-rate outliers" balance question. */
export interface ItemWinRate {
  readonly itemId: string;
  /** Runs whose starting loadout included this item. */
  readonly appearances: number;
  readonly wins: number;
  readonly winRate: number;
}

export interface PlaytestReportMeta {
  readonly commit: string;
  readonly node: string;
  readonly platform: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly highestPlayableFloor: number;
}

export interface PlaytestReport extends PlaytestReportMeta {
  /** Bumped when the shape changes, so an old report on disk stays readable. */
  readonly schema: 2;
  readonly totalRuns: number;
  readonly wins: number;
  readonly deaths: number;
  readonly stuck: number;
  readonly crashes: number;
  readonly ranOut: number;
  readonly winRate: number;
  readonly floors: readonly FloorStats[];
  /** By skill profile name. */
  readonly winRateBySkill: Readonly<Record<string, number>>;
  /**
   * Every starting-loadout item that appeared in the sweep, sorted by how
   * often it appeared — #54's item win-rate outliers. Built from
   * `loadoutItemIds` rather than mid-run pickups: `harness.ts`'s own doc
   * comment already explains why the two are the same set here (a fixed
   * starting loadout, no organic pickup).
   */
  readonly itemWinRates: readonly ItemWinRate[];
  /**
   * Ticks spent at each Promille tier id, summed across every run in the
   * sweep — #54's "if one tier dominates, the system needs work" question,
   * as a distribution over the scripted sweep rather than real play.
   */
  readonly promilleTierUsage: Readonly<Record<string, number>>;
  readonly failures: readonly FailureSummary[];
  readonly runs: readonly RunSummary[];
}

const MAX_FAILURES_LISTED = 25;

function toRunSummary(outcome: PlaytestOutcome): RunSummary {
  return {
    seed: outcome.seed,
    skill: outcome.skill,
    loadoutItemIds: outcome.loadoutItemIds,
    result: outcome.result,
    floorsReached: outcome.floorsReached,
    ticksCompleted: outcome.ticksCompleted,
    damageTaken: outcome.damageTaken,
  };
}

function toFailure(outcome: PlaytestOutcome): FailureSummary {
  return {
    seed: outcome.seed,
    skill: outcome.skill,
    loadoutItemIds: outcome.loadoutItemIds,
    errorMessage: outcome.errorMessage,
    floorsReached: outcome.floorsReached,
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function floorStats(outcomes: readonly PlaytestOutcome[], floor: number): FloorStats {
  const onThisFloor = outcomes
    .map((outcome) => ({ outcome, entry: outcome.floors.find((f) => f.floor === floor) }))
    .filter(
      (row): row is { outcome: PlaytestOutcome; entry: NonNullable<typeof row.entry> } =>
        row.entry !== undefined,
    );
  const endedHere = onThisFloor.filter(
    (row) => row.outcome.floorsReached === floor && row.outcome.result !== 'won',
  ).length;
  return {
    floor,
    attempts: onThisFloor.length,
    endedHere,
    avgTicks: mean(onThisFloor.map((row) => row.entry.ticks)),
    avgDamageTaken: mean(onThisFloor.map((row) => row.entry.damageTaken)),
    avgRoomsCleared: mean(onThisFloor.map((row) => row.entry.roomsCleared)),
  };
}

/**
 * One row per item that appeared in any run's starting loadout, sorted by
 * how many runs drew it.
 *
 * Read the outliers this produces with the same caveat `run.test.ts`'s
 * `LOADOUTS` earns: every item in one drawn combination shares that
 * combination's whole result, so a strong 8-item loadout reports all eight
 * of its items at the same inflated win rate. That is a real signal — sweep
 * enough distinct combinations and a genuinely overpowered item still stands
 * out from the crowd it appears in — but with #54's own small, CI-sized
 * sweep (a handful of combinations, not a real per-item isolation test),
 * an outlier row here is a lead to check by hand (does the *item* carry the
 * run, or did the run just happen to draw many items?), not a verdict.
 * `docs/BALANCE_METHODOLOGY.md` covers reading this table honestly.
 */
function itemWinRates(outcomes: readonly PlaytestOutcome[]): ItemWinRate[] {
  const stats = new Map<string, { appearances: number; wins: number }>();
  for (const outcome of outcomes) {
    for (const itemId of outcome.loadoutItemIds) {
      const entry = stats.get(itemId) ?? { appearances: 0, wins: 0 };
      entry.appearances += 1;
      if (outcome.result === 'won') {
        entry.wins += 1;
      }
      stats.set(itemId, entry);
    }
  }
  return Array.from(stats.entries())
    .map(([itemId, { appearances, wins }]) => ({
      itemId,
      appearances,
      wins,
      winRate: appearances === 0 ? 0 : wins / appearances,
    }))
    .sort((a, b) => b.appearances - a.appearances || a.itemId.localeCompare(b.itemId));
}

/** Sums every run's own `promilleTierTicks` into one distribution across the whole sweep. */
function promilleTierUsage(outcomes: readonly PlaytestOutcome[]): Record<string, number> {
  const usage: Record<string, number> = {};
  for (const outcome of outcomes) {
    for (const [tier, ticks] of Object.entries(outcome.promilleTierTicks)) {
      usage[tier] = (usage[tier] ?? 0) + ticks;
    }
  }
  return usage;
}

/** Assembles every run from one sweep into the report the harness writes down. */
export function buildPlaytestReport(
  outcomes: readonly PlaytestOutcome[],
  meta: PlaytestReportMeta,
): PlaytestReport {
  const failing = outcomes.filter((outcome) => outcome.result === 'crashed');
  const wins = outcomes.filter((outcome) => outcome.result === 'won').length;
  const skills = Array.from(new Set(outcomes.map((outcome) => outcome.skill)));
  const winRateBySkill: Record<string, number> = {};
  for (const skill of skills) {
    const runs = outcomes.filter((outcome) => outcome.skill === skill);
    winRateBySkill[skill] =
      runs.length === 0
        ? 0
        : runs.filter((outcome) => outcome.result === 'won').length / runs.length;
  }
  const floors: FloorStats[] = [];
  for (let floor = 1; floor <= meta.highestPlayableFloor; floor++) {
    floors.push(floorStats(outcomes, floor));
  }

  return {
    ...meta,
    schema: 2,
    totalRuns: outcomes.length,
    wins,
    deaths: outcomes.filter((outcome) => outcome.result === 'died').length,
    stuck: outcomes.filter((outcome) => outcome.result === 'stuck').length,
    crashes: failing.length,
    ranOut: outcomes.filter((outcome) => outcome.result === 'ranOut').length,
    winRate: outcomes.length === 0 ? 0 : wins / outcomes.length,
    floors,
    winRateBySkill,
    itemWinRates: itemWinRates(outcomes),
    promilleTierUsage: promilleTierUsage(outcomes),
    failures: failing.slice(0, MAX_FAILURES_LISTED).map(toFailure),
    runs: outcomes.map(toRunSummary),
  };
}

const REPORT_PATH = fileURLToPath(new URL('../../../playtest/results.json', import.meta.url));

export function writePlaytestReport(report: PlaytestReport): string {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return REPORT_PATH;
}
