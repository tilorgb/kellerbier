import releaseConfig from './vite.release.config.js';
import { singleFilePlugin } from './tools/release/single-file-plugin.mjs';

/**
 * The debug build: the release (`vite.release.config.ts`) with
 * `__KELLERBIER_DEBUG__` on, which mounts the spawn panel
 * (`src/debug/spawn-panel.ts`) — any enemy, item or pickup at a click, for
 * trying content out without hunting a seed. Still one file that runs from
 * `file://`, written to `release-debug/` and copied next to the release as
 * `release/Kellerbier-debug.html` by `npm run build:release`
 * (`tools/release/copy-debug.mjs`). Never hand it to a player.
 */
export default {
  ...releaseConfig,
  define: {
    ...releaseConfig.define,
    __KELLERBIER_DEBUG__: 'true',
  },
  plugins: [
    // The release's plugins, minus its single-file step, which writes the
    // release's name and READ-ME; this one writes its own name and none.
    ...(releaseConfig.plugins ?? []).filter(
      (plugin) =>
        !(
          plugin !== null &&
          typeof plugin === 'object' &&
          'name' in plugin &&
          /single-file/i.test(plugin.name)
        ),
    ),
    singleFilePlugin({ fileName: 'Kellerbier-debug.html' }),
  ],
  build: {
    ...releaseConfig.build,
    outDir: 'release-debug',
  },
};
