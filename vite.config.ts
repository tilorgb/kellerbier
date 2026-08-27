import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { artPipelineDevPlugin } from './tools/art/dev-plugin.mjs';
import { roomEditorServerPlugin } from './tools/room-editor/server.mjs';

const resolvePath = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  // Relative asset URLs, so a production build also runs from `file://`
  // and from any static host served out of a subdirectory.
  base: './',
  // Dev-only: `configureServer` middleware never runs under `vite build`, so
  // the room editor's save endpoint (#24) never reaches a production bundle.
  plugins: [artPipelineDevPlugin(), roomEditorServerPlugin()],
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
    // The benchmark is its own pipeline stage and its own command: it is
    // timing-sensitive, and running it alongside the rest of the suite means
    // measuring a machine that is busy doing something else.
    exclude: ['tests/lint/fixtures/**', 'tests/bench/**', 'tests/fuzz/heavy/**'],
    // The tree-shaking test runs a real production build.
    testTimeout: 180_000,
    environment: 'node',
    // The allocation-delta test needs to force a collection before and after
    // the hot loop, otherwise it is measuring GC timing rather than garbage.
    pool: 'forks',
    execArgv: ['--expose-gc'],
  },
});
