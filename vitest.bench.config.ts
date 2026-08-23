import { defineConfig } from 'vitest/config';
import baseConfig from './vite.config.js';

/**
 * The benchmark, run on its own.
 *
 * A separate command and a separate config because it is timing-sensitive:
 * running it alongside three hundred other tests measures a machine that is
 * busy doing something else, and a benchmark that reports the load on the
 * runner rather than the cost of the code is worse than no benchmark at all.
 *
 * The base config is spread rather than merged, because `mergeConfig`
 * concatenates arrays — merging would append the benchmark's include list to
 * the suite's and run everything twice.
 *
 * What runs here is the frame-time benchmark and the collision benchmark. The
 * regression gate on top of them lives in CI, which runs this twice on one
 * runner — the pull request and its merge base — and compares the two; see
 * `tools/bench/compare.mjs`.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/bench/**/*.test.ts'],
    exclude: [],
    // `--expose-gc` is what the allocation helper needs; the young generation
    // is raised because of what the benchmark measures with it. A heap window
    // is only readable while nothing inside it is collected, and the deliberate
    // regression the benchmark proves it can catch — an object per projectile
    // per tick — produces several megabytes across a window. At the default
    // semi-space size V8 scavenges partway through, the delta comes back near
    // zero, and the gate reports that a regression it was staring at is fine.
    execArgv: ['--expose-gc', '--max-semi-space-size=64'],
    // One file at a time. Parallel workers competing for cores is exactly the
    // interference this config exists to avoid.
    fileParallelism: false,
  },
});
