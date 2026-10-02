import type { PlaytestOutcome } from './harness.js';

/**
 * The arithmetic behind `tests/playtest/items.test.ts`: one item's runs
 * against the empty-handed baseline's, on the same seeds and skills.
 *
 * **Why rooms cleared, not win rate.** A bot holding one item almost never
 * wins a two-floor run, and neither does a bot holding none, so win rate is
 * a row of zeros that cannot tell a strong item from a weak one. How far the
 * run got can: rooms cleared moves for an item that helps a little, and for
 * one that hurts. Win rate and the share reaching floor 2 are reported
 * beside it for the items strong enough to show there.
 */

export interface ItemIsolationRow {
  readonly itemId: string;
  readonly runs: number;
  readonly winRate: number;
  readonly reachedFloorTwo: number;
  readonly avgRoomsCleared: number;
  /** `avgRoomsCleared` minus the baseline's — the item's effect, in rooms. */
  readonly roomsDelta: number;
  /** `roomsDelta` in units of the spread across all items; see `OUTLIER_SIGMA`. */
  readonly sigma: number;
  readonly avgDamageTaken: number;
  readonly stuck: number;
}

export interface ItemIsolationReport {
  readonly runsPerItem: number;
  readonly baseline: Omit<ItemIsolationRow, 'itemId' | 'roomsDelta' | 'sigma'>;
  /** Mean and standard deviation of `roomsDelta` across every item. */
  readonly meanDelta: number;
  readonly spread: number;
  /** Strongest first. */
  readonly items: readonly ItemIsolationRow[];
}

/**
 * How far from the pack counts as worth a look. Two standard deviations of
 * the items' own spread — "outside the expected band" measured against what
 * the rest of the pool does, since nothing else says what an item is
 * supposed to be worth.
 */
export const OUTLIER_SIGMA = 2;

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roomsCleared(outcome: PlaytestOutcome): number {
  return outcome.floors.reduce((sum, floor) => sum + floor.roomsCleared, 0);
}

function summarise(outcomes: readonly PlaytestOutcome[]): ItemIsolationReport['baseline'] {
  return {
    runs: outcomes.length,
    winRate: mean(outcomes.map((outcome) => (outcome.result === 'won' ? 1 : 0))),
    reachedFloorTwo: mean(outcomes.map((outcome) => (outcome.floorsReached >= 2 ? 1 : 0))),
    avgRoomsCleared: mean(outcomes.map(roomsCleared)),
    avgDamageTaken: mean(outcomes.map((outcome) => outcome.damageTaken)),
    stuck: outcomes.filter((outcome) => outcome.result === 'stuck').length,
  };
}

export function buildItemIsolation(
  baselineOutcomes: readonly PlaytestOutcome[],
  perItem: ReadonlyMap<string, readonly PlaytestOutcome[]>,
): ItemIsolationReport {
  const baseline = summarise(baselineOutcomes);
  const rows = Array.from(perItem.entries(), ([itemId, outcomes]) => {
    const summary = summarise(outcomes);
    return { itemId, ...summary, roomsDelta: summary.avgRoomsCleared - baseline.avgRoomsCleared };
  });
  const meanDelta = mean(rows.map((row) => row.roomsDelta));
  const spread = Math.sqrt(mean(rows.map((row) => (row.roomsDelta - meanDelta) ** 2)));
  return {
    runsPerItem: baseline.runs,
    baseline,
    meanDelta,
    spread,
    items: rows
      .map((row) => ({ ...row, sigma: spread === 0 ? 0 : (row.roomsDelta - meanDelta) / spread }))
      .sort((a, b) => b.roomsDelta - a.roomsDelta || a.itemId.localeCompare(b.itemId)),
  };
}

const percent = (value: number): string => `${(value * 100).toFixed(0)}%`;
const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;

export function formatItemIsolation(report: ItemIsolationReport): string {
  const lines: string[] = [];
  lines.push('### Item isolation');
  lines.push('');
  lines.push(
    `Each item alone against no items, ${String(report.runsPerItem)} runs each on the same seeds. ` +
      `Empty-handed: ${report.baseline.avgRoomsCleared.toFixed(1)} rooms cleared, ` +
      `${percent(report.baseline.reachedFloorTwo)} reach floor 2, ${percent(report.baseline.winRate)} win.`,
  );
  lines.push('');
  const outliers = report.items.filter((row) => Math.abs(row.sigma) >= OUTLIER_SIGMA);
  if (outliers.length === 0) {
    lines.push(`No item is ${String(OUTLIER_SIGMA)}σ or more from the pack.`);
  } else {
    lines.push(
      `**${String(outliers.length)} item(s) ${String(OUTLIER_SIGMA)}σ or more from the pack** (marked ◀):`,
    );
  }
  lines.push('');
  lines.push('| Item | Rooms vs none | σ | Reach floor 2 | Win | Avg damage | Stuck |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const row of report.items) {
    const mark = Math.abs(row.sigma) >= OUTLIER_SIGMA ? ' ◀' : '';
    lines.push(
      `| ${row.itemId}${mark} | ${signed(row.roomsDelta)} | ${signed(row.sigma)} | ` +
        `${percent(row.reachedFloorTwo)} | ${percent(row.winRate)} | ${row.avgDamageTaken.toFixed(1)} | ${String(row.stuck)} |`,
    );
  }
  return lines.join('\n');
}
