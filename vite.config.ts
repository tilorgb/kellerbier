import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolvePath = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  // Relative asset URLs, so a production build also runs from `file://`
  // and from any static host served out of a subdirectory.
  base: './',
  resolve: {
    alias: {
      '@sim': resolvePath('./src/sim'),
      '@render': resolvePath('./src/render'),
      '@app': resolvePath('./src/app'),
      '@content': resolvePath('./src/content'),
      '@debug': resolvePath('./src/debug'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Small sprites inline as data URIs, which keeps `file://` working;
    // real atlases are far above this and stay as cache-bustable files.
    assetsInlineLimit: 8192,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The allocation-delta test needs to force a collection before and after
    // the hot loop, otherwise it is measuring GC timing rather than garbage.
    pool: 'forks',
    execArgv: ['--expose-gc'],
  },
});
