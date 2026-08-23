import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { GameSim } from '../../src/sim/game/sim.js';
import { bytesPerPass } from '../helpers/allocation.js';
import {
  ENEMY_COUNT,
  PARTICLE_COUNT,
  PROJECTILE_COUNT,
  type StressScene,
  buildHeadlessView,
  buildStressScene,
} from './scene.js';
import {
  FRAME_BUDGET_MS,
  SIM_HEAP_BUDGET_BYTES,
  SIM_TICK_BUDGET_MS,
  type BenchReport,
  summarise,
  writeBenchReport,
} from './report.js';

/**
 * The frame-time benchmark: the performance budget as a build gate.
 *
 * `docs/TECH_STACK.md` §3 states the numbers the game commits to. Three of them
 * can be measured on a machine with no display server, and are, here:
 * simulation tick, full frame, and heap growth. The fourth — draw calls — needs
 * a real graphics context, and is counted in the browser by the F1 overlay; the
 * report carries an explicit null for it rather than quietly leaving the row
 * out and reading as though it had been met.
 *
 * This is #16. A budget nobody measures is a wish, and the moment to install
 * the measurement is while the scene is cheap to build rather than in M8, when
 * a regression is buried under six months of commits.
 *
 * ## Why the tests in here run in this order
 *
 * The heap measurements come first and the timings last, because the timing run
 * builds a renderer scene graph — six thousand sprites — and a heap window
 * measured after that reads several hundred kilobytes of noise for a loop that
 * allocates nothing. Measured before it, the same loop reads flat, repeatably,
 * to a tenth of a kilobyte. The gate is a real one either way; this is only
 * about which order gives a number worth quoting.
 */

/** Ticks measured. Two seconds of gameplay, which is plenty for a median. */
const MEASURED_TICKS = 120;

/** Ticks run before measuring, so V8 has tiered up into optimised code. */
const WARM_UP_TICKS = 60;

/** Interpolation fraction the render sync is measured at. Mid-tick, the normal case. */
const RENDER_ALPHA = 0.5;

/**
 * The measurement windows the heap gates use.
 *
 * Short windows, and the refill in `prepare` rather than in the pass. Both
 * follow from what is being measured: the refill is the harness putting the
 * scene back, not the game running, and a window long enough to drain the field
 * measures a room emptying. Ten ticks costs the population about a tenth of its
 * shots, and nine windows of it read within a kilobyte of one another.
 */
const HEAP_OPTIONS = { warmUpPasses: 120, passes: 10, rounds: 9 } as const;

/** Filled in by the heap test and reported by the timing one. */
let measuredHeapBytesPerTick = Number.NaN;

interface FrameSamples {
  readonly simMs: number[];
  readonly renderMs: number[];
  readonly frameMs: number[];
}

/**
 * One measured window.
 *
 * The refill happens outside the timer, and the three channels are read off one
 * pass rather than three — so `frame` is a simulation tick plus the render sync
 * that followed *that* tick, rather than the sum of two medians taken from
 * different windows.
 */
function measureFrames(scene: StressScene, sync: (alpha: number) => void): FrameSamples {
  const simMs: number[] = [];
  const renderMs: number[] = [];
  const frameMs: number[] = [];

  for (let warm = 0; warm < WARM_UP_TICKS; warm++) {
    scene.refill();
    scene.sim.step();
    sync(RENDER_ALPHA);
  }

  for (let tick = 0; tick < MEASURED_TICKS; tick++) {
    scene.refill();

    const started = performance.now();
    scene.sim.step();
    const stepped = performance.now();
    sync(RENDER_ALPHA);
    const drawn = performance.now();

    simMs.push(stepped - started);
    renderMs.push(drawn - stepped);
    frameMs.push(drawn - started);
  }

  return { simMs, renderMs, frameMs };
}

/**
 * Heap bytes the simulation hands out in one tick of the scene.
 *
 * The refill is in `prepare`, so it runs between windows rather than inside
 * one: what the gate is about is what `GameSim.step` allocates on a full
 * field, and the harness putting five thousand shots back is not that. An
 * earlier version had it inside the window and had to budget for the pair,
 * which is a gate with the harness's own cost baked into it.
 *
 * The number is not zero, and the reason is worth writing down. Every remaining
 * kilobyte is V8 boxing a double that crosses a call boundary it did not
 * inline: `sweptCircleHit` returning a hit time to the collision system is most
 * of it. There is no object in the simulation being allocated per entity — see
 * `SIM_HEAP_BUDGET_BYTES` for where the line is drawn and why.
 */
function measureHeapBytesPerTick(scene: StressScene, extra?: (sim: GameSim) => void): number {
  return bytesPerPass(
    () => {
      scene.sim.step();
      extra?.(scene.sim);
    },
    {
      prepare: () => {
        scene.refill();
      },
      ...HEAP_OPTIONS,
    },
  );
}

/** A scene stepped far enough that nothing in it is still settling. */
function warmedScene(): StressScene {
  const scene = buildStressScene();
  for (let tick = 0; tick < WARM_UP_TICKS; tick++) {
    scene.refill();
    scene.sim.step();
  }
  return scene;
}

/** The commit the numbers belong to. Without it the history is a list of numbers. */
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

/** The summary a person reads in the CI log without opening an artifact. */
function printSummary(report: BenchReport, path: string): void {
  const row = (name: string, median: number, p95: number, budget: string): string =>
    `  ${name.padEnd(12)} ${median.toFixed(3).padStart(8)} ms median ` +
    `${p95.toFixed(3).padStart(8)} ms p95   ${budget}`;

  process.stdout.write(
    [
      '',
      `stress scene — ${String(report.scene.projectiles)} projectiles, ` +
        `${String(report.scene.enemies)} enemies, ${String(report.scene.particles)} particles, ` +
        `over ${String(report.scene.ticks)} ticks`,
      row(
        'simulation',
        report.simTick.medianMs,
        report.simTick.p95Ms,
        `budget ${String(SIM_TICK_BUDGET_MS)} ms`,
      ),
      row(
        'render sync',
        report.renderSync.medianMs,
        report.renderSync.p95Ms,
        'no budget of its own',
      ),
      row(
        'frame',
        report.frame.medianMs,
        report.frame.p95Ms,
        `budget ${String(FRAME_BUDGET_MS)} ms`,
      ),
      `  ${'sim heap'.padEnd(12)} ${(report.simHeapBytesPerTick / 1024).toFixed(1).padStart(8)} KB per tick` +
        `                    budget ${String(SIM_HEAP_BUDGET_BYTES / 1024)} KB`,
      `  ${'draw calls'.padEnd(12)} not measurable headless — counted in the browser by F1`,
      `  written to ${path}`,
      '',
    ].join('\n'),
  );
}

describe('frame-time benchmark', () => {
  it('holds a flat heap through a tick at the budget population', () => {
    measuredHeapBytesPerTick = measureHeapBytesPerTick(warmedScene());

    expect(
      measuredHeapBytesPerTick,
      `${(measuredHeapBytesPerTick / 1024).toFixed(1)} KB of heap per tick`,
    ).toBeLessThan(SIM_HEAP_BUDGET_BYTES);
  }, 300_000);

  /**
   * The acceptance criterion on #16, run rather than asserted.
   *
   * "Deliberately adding an allocation to the projectile update fails the
   * benchmark." Here one is added — a small object per live projectile per
   * tick, which is the shape this bug always takes — and the same measurement
   * and the same budget are applied. If this ever passes, the gate above has
   * stopped being a gate and the next real regression goes straight through it.
   *
   * The allocation is an extra pass over the live projectiles rather than an
   * edit to `stepProjectiles`, because what is being checked is the
   * measurement: any allocation proportional to the projectile population lands
   * in the same place, and a test that patched a module would be testing the
   * patch.
   *
   * The objects are kept in a ring that is read afterwards, and that detail is
   * the whole test. Written to a field nobody ever reads, V8 sees a dead store,
   * proves the object never escapes, and does not allocate it at all — the
   * window then reads flat and the "regression" is invisible, which is a
   * remarkable way to convince yourself a gate works when it does not.
   */
  it('fails when an allocation is added to the projectile update', () => {
    const kept: ({ x: number; y: number } | null)[] = new Array<{ x: number; y: number } | null>(
      256,
    ).fill(null);
    let cursor = 0;

    const sabotaged = measureHeapBytesPerTick(warmedScene(), (sim) => {
      sim.projectiles.forEachLive((index) => {
        kept[cursor] = { x: sim.projectiles.x[index] ?? 0, y: sim.projectiles.y[index] ?? 0 };
        cursor = (cursor + 1) & 255;
      });
    });

    // Read back, so the ring is not itself a dead store.
    expect(kept.filter((point) => point !== null)).toHaveLength(256);

    expect(
      sabotaged,
      `${(sabotaged / 1024).toFixed(1)} KB of heap per tick with one object per projectile — ` +
        `the gate is at ${String(SIM_HEAP_BUDGET_BYTES / 1024)} KB`,
    ).toBeGreaterThan(SIM_HEAP_BUDGET_BYTES);
  }, 300_000);

  it('runs the budget scene inside its frame budget, and writes the report', () => {
    const scene = buildStressScene();
    const view = buildHeadlessView(scene.sim);

    const samples = measureFrames(scene, (alpha) => {
      view.sync(alpha);
    });

    const report: BenchReport = {
      schema: 1,
      commit: currentCommit(),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      scene: {
        enemies: ENEMY_COUNT,
        projectiles: PROJECTILE_COUNT,
        particles: PARTICLE_COUNT,
        ticks: MEASURED_TICKS,
      },
      simTick: summarise(samples.simMs),
      renderSync: summarise(samples.renderMs),
      frame: summarise(samples.frameMs),
      simHeapBytesPerTick: measuredHeapBytesPerTick,
      drawCalls: null,
    };

    printSummary(report, writeBenchReport(report));

    // The gates are on the medians. A shared CI runner produces the occasional
    // tick that took four times as long as its neighbours because something
    // else on the machine wanted the core, and gating on a maximum or a high
    // percentile there is how a benchmark ends up muted. The percentiles are
    // reported, and a regression that is real moves the median too.
    expect(
      report.simTick.medianMs,
      `${report.simTick.medianMs.toFixed(3)} ms per simulation tick at the budget population`,
    ).toBeLessThan(SIM_TICK_BUDGET_MS);

    expect(
      report.frame.medianMs,
      `${report.frame.medianMs.toFixed(3)} ms per frame at the budget population`,
    ).toBeLessThan(FRAME_BUDGET_MS);
  }, 300_000);
});
