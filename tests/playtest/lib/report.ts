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
  readonly schema: 1;
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
    schema: 1,
    totalRuns: outcomes.length,
    wins,
    deaths: outcomes.filter((outcome) => outcome.result === 'died').length,
    stuck: outcomes.filter((outcome) => outcome.result === 'stuck').length,
    crashes: failing.length,
    ranOut: outcomes.filter((outcome) => outcome.result === 'ranOut').length,
    winRate: outcomes.length === 0 ? 0 : wins / outcomes.length,
    floors,
    winRateBySkill,
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
