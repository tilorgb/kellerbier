import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import baseConfig from './vite.config.js';
import { singleFilePlugin } from './tools/release/single-file-plugin.mjs';

const resolvePath = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The build you hand to a person, as opposed to the one you hand to CI.
 *
 * `npm run build` stays exactly what it was: a normal folder, the room/sprite/
 * audio editors included, published by `.github/workflows/ci.yml`'s `preview`
 * job so a reviewer can play a pull request and edit content from the same
 * page. That is a *development* artefact that happens to be a production
 * bundle, and it is the reason `import.meta.env.DEV` alone cannot decide what
 * a player sees — see `src/app/build-mode.ts`.
 *
 * This config is the other one. `__KELLERBIER_RELEASE__` flips to `true`, which
 * folds the editor dock, the seed panel and the playtest keys out of the
 * bundle, and `tools/release/single-file-plugin.mjs` folds what is left into
 * one `Kellerbier.html` that runs from `file://` — see that plugin for why a
 * zipped `dist/` does not.
 *
 * It is spread from the base config rather than merged for the same reason the
 * three vitest configs spread it: `mergeConfig` concatenates arrays, and the
 * whole point of `input` here is to be *narrower* than the base's four pages,
 * not to be appended to them.
 */
export default defineConfig({
  ...baseConfig,
  base: './',
  define: {
    ...baseConfig.define,
    __KELLERBIER_RELEASE__: 'true',
  },
  plugins: [
    ...(baseConfig.plugins ?? []),
    singleFilePlugin({ readme: resolvePath('./tools/release/READ-ME.txt') }),
  ],
  build: {
    ...baseConfig.build,
    outDir: 'release',
    emptyOutDir: true,
    // Nobody is debugging a minified stack trace from a friend's laptop, and
    // the maps are five megabytes that would have to be base64'd into the page
    // to be reachable at all.
    sourcemap: false,
    // Everything, however big: a `data:` URI is what makes the page
    // same-origin with its own art, which is what lets `texImage2D` accept it
    // and `fetch()` resolve it off a local file.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      // Only the game. `editor.html`, `pixel-editor.html` and
      // `audio-editor.html` are tools for the people building it.
      input: { index: resolvePath('./index.html') },
      output: {
        // A classic script, because a module is fetched under CORS even from
        // `file://`; one chunk, because a second file is a second fetch.
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
