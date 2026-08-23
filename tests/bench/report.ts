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
 * is measured on a full field is not zero, and none of it is the game producing
 * objects. All of it is V8 boxing doubles.
 *
 * That is worth being precise about, because it decides where this line sits.
 * A double that crosses a call boundary V8 declines to inline comes back as a
 * sixteen-byte `HeapNumber`, and so does every store of a double into a
 * module-level `let` — a context slot holds tagged values and cannot hold a
 * raw double. Neither is visible in the source. The two worth fixing have been
 * fixed: the collision system's per-projectile state (490 KB a tick) and the
 * particle spray's random draws (83 KB a tick).
 *
 * ## Why the number is this generous
 *
 * Because which doubles get boxed is a property of the V8 the benchmark runs
 * on, not of the game. The same commit and the same scene measure 54 KB a tick
 * on Node 24 and 351 KB on the Node 22 that CI pins — a sixfold spread with no
 * change to the simulation, from inlining decisions made somewhere inside
 * TurboFan. A gate set snugly around either figure is a gate that fires on a
 * runner image upgrade, and one that fires on a runner image upgrade is one
 * that gets muted.
 *
 * So this is a ceiling and not a target: it catches the simulation starting to
 * allocate in earnest, on any engine anyone runs it on. The sharp instrument
 * is elsewhere — `tools/bench/compare.mjs` compares a pull request against its
 * merge base on one runner, where the engine is held fixed and a 25% move is a
 * real move.
 */
export const SIM_HEAP_BUDGET_BYTES = 512 * 1024;

/**
 * The size of allocation regression the benchmark must be able to resolve.
 *
 * The acceptance criterion on #16 is that a deliberate allocation in the
 * projectile update fails the benchmark, and the honest form of that check is
 * a delta rather than an absolute: the baseline moves sixfold between engines,
 * so a fixed threshold that proves something on one of them proves nothing on
 * the other.
 *
 * 128 KB is a stricter demand than the pull-request gate's own band — that
 * fires on a quarter above the base, which at any baseline this simulation has
 * measured is well under 128 KB. A regression the benchmark resolves at this
 * size is therefore one the gate is certain to report.
 */
export const SIM_HEAP_REGRESSION_BYTES = 128 * 1024;

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
