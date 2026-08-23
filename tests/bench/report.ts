import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What the benchmark writes down.
 *
 * A JSON file rather than console output, because two things need to read it
 * that are not a person watching a terminal: `tools/bench/compare.mjs`, which
 * decides whether a pull request made the game slower, and
 * `tools/bench/record-history.mjs`, which appends the run to the committed
 * history so a trend is visible over months rather than over one afternoon.
 */

/** The budgets from `docs/TECH_STACK.md` §3, in the units they are measured in. */
export const SIM_TICK_BUDGET_MS = 4;
export const FRAME_BUDGET_MS = 12;

/**
 * Heap bytes the simulation is allowed to hand out per tick.
 *
 * The budget in the tech stack says zero, and zero is the design: pooled
 * stores, Structure-of-Arrays components, nothing allocated in a system. What
 * is measured on a full field is about fifty kilobytes a tick, and none of it
 * is the game producing objects. All of it is V8 boxing doubles.
 *
 * That is worth being precise about, because it decides where this line sits.
 * A double that crosses a call boundary V8 declines to inline comes back as a
 * sixteen-byte `HeapNumber`, and so does every store of a double into a
 * module-level `let` — a context slot holds tagged values and cannot hold a
 * raw double. Neither is visible in the source; both are invisible until
 * something measures them. Chasing the last of it means turning pure functions
 * into out-parameter ones, which is a real cost in a codebase people have to
 * read, and the two that were worth it have been done: the collision system's
 * per-projectile state (490 KB a tick) and the particle spray's random draws
 * (83 KB a tick). What is left is `sweptCircleHit` handing a hit time back,
 * about 35 KB a tick, and it is written down rather than fixed.
 *
 * So the gate is set where it catches the regression it exists to catch. One
 * small object per projectile per tick — the classic version of this bug, and
 * the one the acceptance criteria on #16 name — costs upward of three hundred
 * kilobytes a tick at the budget population. This sits between the two, far
 * enough above the baseline that it does not flicker and far enough below the
 * failure that the failure cannot hide under it.
 */
export const SIM_HEAP_BUDGET_BYTES = 128 * 1024;

export interface Measurement {
  readonly medianMs: number;
  readonly p95Ms: number;
}

export interface BenchReport {
  /** Bumped when the shape changes, so an old history line stays readable. */
  readonly schema: 1;
  readonly commit: string;
  readonly node: string;
  readonly platform: string;
  readonly scene: {
    readonly enemies: number;
    readonly projectiles: number;
    readonly particles: number;
    readonly ticks: number;
  };
  readonly simTick: Measurement;
  /** The CPU half of a rendered frame. See `buildHeadlessView`. */
  readonly renderSync: Measurement;
  readonly frame: Measurement;
  readonly simHeapBytesPerTick: number;
  /**
   * Draw calls, which a headless run cannot see.
   *
   * Always null here, and deliberately present rather than omitted: the budget
   * has a row for it, and a report that quietly leaves the row out reads as
   * though the row were met. It is counted in the browser by the F1 overlay,
   * against the same number.
   */
  readonly drawCalls: null;
}

const REPORT_PATH = fileURLToPath(new URL('../../bench/results.json', import.meta.url));

export function writeBenchReport(report: BenchReport): string {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return REPORT_PATH;
}

/** Median and 95th percentile of a sample set, in the order they are reported. */
export function summarise(samples: number[]): Measurement {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const slot = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[slot] ?? Number.POSITIVE_INFINITY;
}
