/**
 * Dev-server half of the room editor (#24): a Vite plugin, wired into
 * `vite.config.ts`, that exposes one endpoint the editor's browser code posts
 * a draft to — `POST /__room-editor-api/rooms/:id` — validates it and writes
 * `src/content/rooms/<id>.json`.
 *
 * `configureServer` middleware only ever runs under `vite`/`vite dev`, never
 * `vite build`/`vite preview` — a production static build has no server to
 * attach this to, so this endpoint (and the whole editor) exists only in dev.
 *
 * Validation reuses the real schema gate (`src/sim/room/template.ts`'s
 * `validateRoomTemplate`) rather than a second copy of it, loaded through
 * `server.ssrLoadModule` — Vite's own module graph, so it gets the same
 * TypeScript/ESM transform the app itself runs under, without this plugin
 * needing to be anything but plain Node ESM.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Matches every id already in use under `src/content/rooms/` (lowercase, digits, hyphens). */
const SAFE_ROOM_ID = /^[a-z][a-z0-9-]{0,63}$/;

const API_PREFIX = '/__room-editor-api/rooms/';

export function roomEditorServerPlugin() {
  return {
    name: 'room-editor-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || !req.url || !req.url.startsWith(API_PREFIX)) {
          next();
          return;
        }

        const roomId = decodeURIComponent(req.url.slice(API_PREFIX.length));
        if (!SAFE_ROOM_ID.test(roomId)) {
          respondJson(res, 400, { error: 'room id must be lowercase letters, digits and hyphens' });
          return;
        }

        let payload;
        try {
          payload = JSON.parse(await readBody(req));
        } catch {
          respondJson(res, 400, { error: 'request body is not valid JSON' });
          return;
        }

        try {
          const { validateRoomTemplate } = await server.ssrLoadModule('/src/sim/room/template.ts');
          const { ENEMY_DEFINITIONS } = await server.ssrLoadModule('/src/content/enemies/index.ts');
          validateRoomTemplate(payload, `${roomId}.json`, ENEMY_DEFINITIONS);
        } catch (error) {
          respondJson(res, 422, { error: error instanceof Error ? error.message : String(error) });
          return;
        }

        const filePath = path.join(server.config.root, 'src/content/rooms', `${roomId}.json`);
        await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        respondJson(res, 200, { ok: true });
      });
    },
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function respondJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}
