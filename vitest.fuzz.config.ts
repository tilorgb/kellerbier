import { defineConfig } from 'vitest/config';
import baseConfig from './vite.config.js';

/**
 * #30's synergy fuzz harness, run on its own.
 *
 * A separate command and config for the same reason `vitest.bench.config.ts`
 * is one: 10,000 combinations is deliberately slow, and running that
 * alongside the rest of the suite on every `npm run test` would make every
 * contributor pay for a sweep meant to run nightly and on demand
 * (`.github/workflows/fuzz.yml`), not on every commit to an unrelated file.
 *
 * The base config is spread rather than merged for the same reason
 * `vitest.bench.config.ts` spreads it: `mergeConfig` concatenates arrays, so
 * merging would append this include list to the main suite's and run
 * `tests/fuzz/heavy/**` twice.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/fuzz/heavy/**/*.test.ts'],
    exclude: [],
  },
});
