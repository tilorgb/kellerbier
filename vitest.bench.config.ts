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
 * The frame-time benchmark and its regression gate are #16. This is what that
 * will grow into.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/bench/**/*.test.ts'],
    exclude: [],
    // One file at a time. Parallel workers competing for cores is exactly the
    // interference this config exists to avoid.
    fileParallelism: false,
  },
});
