/**
 * Dev-server (and build) half of the art pipeline (#34): a Vite plugin that
 * builds the sprite atlases before the app boots, and rebuilds them whenever
 * a file under `assets/sprites/` changes while `npm run dev` is running.
 *
 * `buildStart` runs under both `vite build` and `vite dev` (it is a Rollup
 * plugin hook Vite reuses), so a palette/spec/legibility problem fails a
 * production build the same way a broken room template already does — see
 * `roomEditorServerPlugin` in `tools/room-editor/server.mjs` for the sibling
 * pattern this follows.
 *
 * The dev-only half adds a file watcher and one endpoint,
 * `GET /__art-pipeline/manifest`, that the debug overlay's art panel polls
 * (`src/debug/panels/art-pipeline.ts`) — "hot reload of art in the dev
 * server" made visible rather than just true.
 */

import { fileURLToPath } from 'node:url';
import { AtlasBuildError, buildAtlases, formatBuildReport } from './build.mjs';

const ROOT_DIR = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../assets/atlases/', import.meta.url));

export function artPipelineDevPlugin() {
  let lastReport = null;
  let lastError = null;

  async function build() {
    try {
      lastReport = await buildAtlases({ rootDir: ROOT_DIR, outDir: OUT_DIR });
      lastError = null;
      console.log(formatBuildReport(lastReport));
    } catch (error) {
      lastReport = null;
      lastError = error instanceof AtlasBuildError ? error.message : String(error);
      console.error(lastError);
      throw error;
    }
  }

  return {
    name: 'art-pipeline',
    async buildStart() {
      await build();
    },
    configureServer(server) {
      server.watcher.add(ROOT_DIR);
      server.watcher.on('all', (event, file) => {
        if (!file.startsWith(ROOT_DIR) || event === 'addDir' || event === 'unlinkDir') {
          return;
        }
        build()
          .catch(() => {
            // Swallowed here on purpose: the manifest endpoint below is what
            // surfaces the failure, and throwing out of a watcher callback
            // would only crash the dev server rather than the build.
          })
          .finally(() => {
            server.ws.send({ type: 'full-reload' });
          });
      });

      server.middlewares.use('/__art-pipeline/manifest', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(lastReport ?? { error: lastError ?? 'not built yet' }));
      });
    },
  };
}
