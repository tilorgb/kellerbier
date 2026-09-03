import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { HIGHEST_PLAYABLE_FLOOR } from '../../src/content/floors/definition.js';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { generateCombinations } from '../fuzz/lib/combinations.js';
import { SKILL_PROFILES } from './lib/bot.js';
import { type PlaytestOutcome, runPlaytest } from './lib/harness.js';
import { buildPlaytestReport, writePlaytestReport } from './lib/report.js';

/**
 * #54's balance simulator, run for real: the scripted bot from
 * `tests/playtest/lib/`, driven across a handful of run seeds, two starting
 * loadouts sizes, and both skill profiles, through real floors 1-2.
 *
 * Kept out of the default `npm run test` suite (`vite.config.ts`'s
 * `test.exclude`, `vitest.playtest.config.ts`) for the same reason
 * `tests/fuzz/heavy/**` is: a full two-floor run is comparatively slow, and
 * this is meant to run nightly and on demand
 * (`.github/workflows/playtest.yml`), not on every commit.
 *
 * What this gates on is deliberately narrow, mirroring
 * `tests/fuzz/heavy/synergy.test.ts`'s own reasoning: only a crash fails the
 * build. A low win rate, a floor that eats an outsized share of deaths, or a
 * run that got stuck is exactly the signal this harness exists to surface
 * for a person to read (`playtest/results.json`, `tools/playtest/
 * report.mjs`) — a nightly job that goes red over "floor 2 felt hard this
 * seed" is a nightly job people stop reading.
 */

const RUN_SEEDS = [101, 102, 103, 104];

/** `0` items (baseline) plus two drawn sizes, two draws each — `tests/fuzz/lib/combinations.ts`'s own generator, reused rather than reinvented. */
const LOADOUTS: readonly { readonly loadoutSeed: number; readonly itemIds: readonly string[] }[] = [
  { loadoutSeed: 0, itemIds: [] },
  ...generateCombinations(ITEM_DEFINITIONS, { sizes: [3, 8], seedsPerSize: 2, baseSeed: 7 }).map(
    (combo) => ({ loadoutSeed: combo.seed, itemIds: combo.itemIds }),
  ),
];

function currentCommit(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi !== undefined && fromCi !== '') {
    return fromCi;
  }
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function describeRun(outcome: PlaytestOutcome): string {
  return `seed ${String(outcome.seed)}, ${outcome.skill}, [${outcome.loadoutItemIds.join(', ')}]`;
}

describe('balance simulator (#54)', () => {
  it(
    'plays every seed/loadout/skill combination through floors 1-2 with no crash',
    () => {
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const outcomes: PlaytestOutcome[] = [];

      for (const seed of RUN_SEEDS) {
        for (const loadout of LOADOUTS) {
          for (const skill of Object.values(SKILL_PROFILES)) {
            outcomes.push(
              runPlaytest({
                seed,
                items: ITEM_DEFINITIONS,
                loadoutItemIds: loadout.itemIds,
                skill,
              }),
            );
          }
        }
      }
      const durationMs = performance.now() - started;

      const report = buildPlaytestReport(outcomes, {
        commit: currentCommit(),
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        startedAt,
        durationMs,
        highestPlayableFloor: HIGHEST_PLAYABLE_FLOOR,
      });
      const path = writePlaytestReport(report);

      process.stdout.write(
        [
          '',
          `balance simulator — ${String(report.totalRuns)} runs in ${(durationMs / 1000).toFixed(1)}s`,
          `  win rate    ${(report.winRate * 100).toFixed(1)}%`,
          `  deaths      ${String(report.deaths)}`,
          `  stuck       ${String(report.stuck)}`,
          `  crashes     ${String(report.crashes)}`,
          `  ran out     ${String(report.ranOut)}`,
          `  written to ${path}`,
          '',
        ].join('\n'),
      );

      const crashes = outcomes.filter((outcome) => outcome.result === 'crashed');
      expect(
        crashes.map(
          (outcome) => `${describeRun(outcome)}: ${outcome.errorMessage ?? 'unknown error'}`,
        ),
      ).toEqual([]);
    },
    // Generous against a full sweep of two-floor runs — see `harness.ts`'s
    // `DEFAULT_MAX_TICKS` doc comment for the per-run worst case.
    15 * 60 * 1000,
  );
});
