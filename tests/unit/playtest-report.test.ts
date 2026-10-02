import { describe, expect, it } from 'vitest';
import { buildPlaytestReport } from '../playtest/lib/report.js';
import type { PlaytestOutcome } from '../playtest/lib/harness.js';

/**
 * #54's balance simulator report: `itemWinRates` and `promilleTierUsage`,
 * the two aggregations added to answer the "item win-rate outliers" and
 * "Promille tier usage" scope bullets directly against the scripted sweep,
 * without needing a real playtest round to have happened first.
 */

const META = {
  commit: 'test',
  node: 'test',
  platform: 'test',
  startedAt: 'now',
  durationMs: 0,
  highestPlayableFloor: 2,
};

function outcome(overrides: Partial<PlaytestOutcome>): PlaytestOutcome {
  return {
    seed: 1,
    skill: 'reckless',
    loadoutItemIds: [],
    heldItemIds: [],
    result: 'died',
    errorMessage: undefined,
    floorsReached: 1,
    ticksCompleted: 100,
    damageTaken: 10,
    floors: [],
    roomRoles: [],
    endedIn: null,
    promilleTierTicks: {},
    peakPromille: 0,
    ...overrides,
  };
}

describe('buildPlaytestReport (#54)', () => {
  it('tallies each item’s appearances and wins across every run that started with it', () => {
    const report = buildPlaytestReport(
      [
        outcome({ loadoutItemIds: ['a', 'b'], result: 'won' }),
        outcome({ loadoutItemIds: ['a'], result: 'died' }),
        outcome({ loadoutItemIds: ['b'], result: 'won' }),
      ],
      META,
    );
    const byId = Object.fromEntries(report.itemWinRates.map((row) => [row.itemId, row]));
    expect(byId.a).toEqual({ itemId: 'a', appearances: 2, wins: 1, winRate: 0.5 });
    expect(byId.b).toEqual({ itemId: 'b', appearances: 2, wins: 2, winRate: 1 });
  });

  it('sorts by appearances, most first', () => {
    const report = buildPlaytestReport(
      [
        outcome({ loadoutItemIds: ['rare'] }),
        outcome({ loadoutItemIds: ['common'] }),
        outcome({ loadoutItemIds: ['common'] }),
      ],
      META,
    );
    expect(report.itemWinRates.map((row) => row.itemId)).toEqual(['common', 'rare']);
  });

  it('sums promilleTierTicks across every run into one distribution', () => {
    const report = buildPlaytestReport(
      [
        outcome({ promilleTierTicks: { '0': 100, '1': 20 } }),
        outcome({ promilleTierTicks: { '1': 5, '3': 50 } }),
      ],
      META,
    );
    expect(report.promilleTierUsage).toEqual({ '0': 100, '1': 25, '3': 50 });
  });

  it('reports an empty distribution and no item rows for a sweep with nothing to aggregate', () => {
    const report = buildPlaytestReport([outcome({})], META);
    expect(report.itemWinRates).toEqual([]);
    expect(report.promilleTierUsage).toEqual({});
  });

  it('says where on a floor the time, the damage and the run-enders are (#368)', () => {
    const report = buildPlaytestReport(
      [
        outcome({
          roomRoles: [
            { floor: 1, role: 'boss', ticks: 300, damageTaken: 4 },
            { floor: 1, role: 'normal', ticks: 100, damageTaken: 2 },
          ],
          endedIn: { floor: 1, role: 'boss' },
        }),
        outcome({
          result: 'won',
          roomRoles: [
            { floor: 1, role: 'normal', ticks: 300, damageTaken: 0 },
            { floor: 1, role: 'boss', ticks: 100, damageTaken: 2 },
            { floor: 2, role: 'boss', ticks: 50, damageTaken: 1 },
          ],
          endedIn: null,
        }),
      ],
      META,
    );
    // Floor by floor, and within a floor in the order a run meets the rooms.
    expect(report.roomRoles).toEqual([
      { floor: 1, role: 'normal', runs: 2, endedHere: 0, avgTicks: 200, avgDamageTaken: 1 },
      { floor: 1, role: 'boss', runs: 2, endedHere: 1, avgTicks: 200, avgDamageTaken: 3 },
      { floor: 2, role: 'boss', runs: 1, endedHere: 0, avgTicks: 50, avgDamageTaken: 1 },
    ]);
  });
});
