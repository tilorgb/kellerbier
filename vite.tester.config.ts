import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import baseConfig from './vite.config.js';

const resolvePath = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The build the Pages root serves to playtesters (`docs/PLAYTEST_PROTOCOL.md`
 * §1): the release-mode game (`src/app/build-mode.ts`) — no editor dock, seed
 * panel or playtest keys — as an ordinary folder, which is what a static host
 * wants.
 *
 * `vite.release.config.ts` is the same game folded into one `file://` page for
 * handing to someone; that shape is wrong for a URL (one 20 MB document, no
 * caching), and `npm run build` is wrong for a tester (it is the reviewer
 * build, editors and all, on purpose). Spread from the base config for the
 * reason the release config spells out: `mergeConfig` would append `input`
 * rather than narrow it.
 */
export default defineConfig({
  ...baseConfig,
  define: {
    ...baseConfig.define,
    __KELLERBIER_RELEASE__: 'true',
    __KELLERBIER_PLAYTEST__: 'true',
  },
  build: {
    ...baseConfig.build,
    outDir: 'dist-tester',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      // Only the game — the editors are tools for the people building it.
      input: { index: resolvePath('./index.html') },
    },
  },
});
