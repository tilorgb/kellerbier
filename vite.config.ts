import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { artPipelineDevPlugin } from './tools/art/dev-plugin.mjs';
import { audioEditorServerPlugin } from './tools/audio-editor/server.mjs';
import { pixelEditorServerPlugin } from './tools/pixel-editor/server.mjs';
import { roomEditorServerPlugin } from './tools/room-editor/server.mjs';

const resolvePath = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  // Relative asset URLs, so a production build also runs from `file://`
  // and from any static host served out of a subdirectory.
  base: './',
  // Dev-only: `configureServer` middleware never runs under `vite build`, so
  // the room editor's (#24) and pixel editor's (#108) save endpoints never
  // reach a production bundle.
  plugins: [
    artPipelineDevPlugin(),
    roomEditorServerPlugin(),
    pixelEditorServerPlugin(),
    audioEditorServerPlugin(),
  ],
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
    rollupOptions: {
      // Vite's default build only bundles `index.html` — the room editor
      // (#24) and pixel editor (#108) were reachable only by typing their
      // URL under `vite dev`, and dropped from the CI-published playable
      // preview (`.github/workflows/ci.yml`'s `preview` job, a static
      // `vite build` output) entirely. Listing all three here is what makes
      // `app/editor-dock.ts`'s docked iframe panel have something to load in
      // that preview, not just in local dev.
      input: {
        index: resolvePath('./index.html'),
        editor: resolvePath('./editor.html'),
        'pixel-editor': resolvePath('./pixel-editor.html'),
        'audio-editor': resolvePath('./audio-editor.html'),
      },
    },
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
