import { defineConfig } from 'vitest/config';
import baseConfig from './vite.config.js';

/**
 * #54's balance simulator, run on its own.
 *
 * A separate command and config for the same reason `vitest.fuzz.config.ts`
 * is one: a full sweep of scripted two-floor runs is deliberately slow, and
 * running it alongside the rest of the suite on every `npm run test` would
 * make every contributor pay for a sweep meant to run nightly and on demand
 * (`.github/workflows/playtest.yml`), not on every commit to an unrelated
 * file.
 *
 * The base config is spread rather than merged for the same reason
 * `vitest.fuzz.config.ts` spreads it: `mergeConfig` concatenates arrays, so
 * merging would append this include list to the main suite's and run
 * `tests/playtest/**` twice.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/playtest/**/*.test.ts'],
    exclude: [],
  },
});
