/**
 * Dev-server half of the pixel-art authoring tool (#108): a Vite plugin,
 * wired into `vite.config.ts`, exposing the one endpoint
 * `pixel-editor.html`'s browser app talks to under
 * `/__pixel-editor-api/sprites` —
 *
 * - `POST /sprites/:bucket/:category/:name` — validates and writes a drawn sprite
 *
 * Listing and loading *existing* sprites used to live here too, as `GET`
 * routes — moved to `src/pixel-editor/static-sprite-index.ts`'s
 * `import.meta.glob` scan (`docs/DECISIONS.md`'s pixel-editor entries)
 * because a `configureServer` route, by construction, only ever runs under
 * `vite dev`: a CI-published preview build has no server behind it at all,
 * so browsing/loading came back empty/failed there even though the tool
 * itself was reachable. Saving keeps a real server on the other end of it
 * because writing a new file to disk is the one thing a static build can
 * never do for itself; browsing and loading have no such requirement, so
 * they moved to the one code path that actually works everywhere this page
 * is served.
 *
 * `configureServer` middleware only ever runs under `vite`/`vite dev`, never
 * `vite build`/`vite preview` — see `roomEditorServerPlugin` in
 * `tools/room-editor/server.mjs`, the sibling this follows.
 *
 * Every check here reuses the same pure functions `tools/art/build.mjs` runs
 * at build time (`docs/DECISIONS.md` #25) — this endpoint is a second,
 * earlier place those functions run, not a second implementation of them.
 * `png.mjs` (the one place this pipeline touches the `pngjs` dependency) and
 * the actual file write are the reason saving still lives server-side rather
 * than only in the browser bundle.
 */

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { legalPixelColorsFor } from '../art/palette.mjs';
import { encodePng } from '../art/png.mjs';
import { ALL_BUCKET_IDS, CATEGORY_FOLDERS } from '../art/spec.mjs';
import { findOffPalettePixel, validateAnimation, validateSpriteSize } from '../art/validate.mjs';
import { buildStrip } from './strip.mjs';

const ROOT_DIR = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const API_PREFIX = '/__pixel-editor-api/sprites';
const SAFE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const DEFAULT_FRAME_DURATION_MS = 120;

export function pixelEditorServerPlugin() {
  return {
    name: 'pixel-editor-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (url !== API_PREFIX && !url.startsWith(`${API_PREFIX}/`)) {
          next();
          return;
        }

        try {
          const rest = url === API_PREFIX ? '' : url.slice(API_PREFIX.length + 1);
          const parts = rest
            .split('/')
            .filter((part) => part.length > 0)
            .map(decodeURIComponent);

          if (parts.length !== 3) {
            respondJson(res, 404, { error: 'expected /sprites/:bucketId/:category/:name' });
            return;
          }
          const [bucketId, category, name] = parts;
          const targetError = validateTarget(bucketId, category, name);
          if (targetError !== null) {
            respondJson(res, 400, { error: targetError });
            return;
          }

          if (req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            await handleSave(res, bucketId, category, name, body);
            return;
          }
          respondJson(res, 405, { error: `unsupported method "${req.method ?? ''}"` });
        } catch (error) {
          respondJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}

function validateTarget(bucketId, category, name) {
  if (!ALL_BUCKET_IDS.includes(bucketId)) {
    return `unknown sprite bucket "${bucketId}"`;
  }
  if (!(category in CATEGORY_FOLDERS)) {
    return `unknown sprite category "${category}"`;
  }
  if (!SAFE_NAME.test(name)) {
    return 'sprite name must be lowercase letters, digits and hyphens';
  }
  return null;
}

async function handleSave(res, bucketId, category, name, body) {
  if (typeof body !== 'object' || body === null) {
    respondJson(res, 400, { error: 'request body must be a JSON object' });
    return;
  }
  const { frameWidth, frameHeight, frames: frameStrings, frameDurationMs, loop } = body;
  if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) {
    respondJson(res, 400, { error: '"frameWidth" and "frameHeight" must be integers' });
    return;
  }
  if (!Array.isArray(frameStrings) || frameStrings.length === 0) {
    respondJson(res, 400, { error: '"frames" must be a non-empty array' });
    return;
  }

  let frames;
  try {
    frames = frameStrings.map((encoded) => {
      if (typeof encoded !== 'string') {
        throw new Error('each frame must be a base64-encoded string');
      }
      const pixels = Buffer.from(encoded, 'base64');
      if (pixels.length !== frameWidth * frameHeight * 4) {
        throw new Error('frame pixel data does not match frameWidth x frameHeight');
      }
      return { width: frameWidth, height: frameHeight, pixels };
    });
  } catch (error) {
    respondJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    return;
  }

  const problems = [];
  const sizeError = validateSpriteSize(
    category,
    frameWidth * frames.length,
    frameHeight,
    frames.length,
  );
  if (sizeError !== null) {
    problems.push(sizeError);
  }

  const allowed = legalPixelColorsFor(bucketId);
  frames.forEach((frame, index) => {
    const offending = findOffPalettePixel(frame.pixels, frame.width, frame.height, allowed);
    if (offending !== null) {
      const hex = offending.color.toString(16).padStart(6, '0');
      problems.push(
        `frame ${String(index)}: pixel (${String(offending.x)}, ${String(offending.y)}) is ` +
          `#${hex}, which is off-palette for "${bucketId}"`,
      );
    }
  });

  const dir = path.join(ROOT_DIR, bucketId, CATEGORY_FOLDERS[category]);
  const plainPath = path.join(dir, `${name}.png`);
  const stripPath = path.join(dir, `${name}.strip.png`);
  const animPath = path.join(dir, `${name}.anim.json`);

  let animation = null;
  if (frames.length > 1) {
    animation = {
      frames: frames.length,
      frameDurationMs: frameDurationMs ?? DEFAULT_FRAME_DURATION_MS,
      loop: loop !== false,
      // The editor draws frames; it does not (yet) edit the `clips` map #150
      // added, so a re-save carries whatever was already authored there
      // through untouched rather than silently deleting it. Re-validated
      // below against the *new* frame count, which is the case that actually
      // needs catching: dropping a frame from a strip can leave a clip
      // pointing past the end of it, and a 422 telling the author that is
      // far better than a strip that loads and then throws in the game.
      ...(await existingClips(animPath)),
    };
    const animationError = validateAnimation(animation);
    if (animationError !== null) {
      problems.push(animationError);
    }
  }

  if (problems.length > 0) {
    respondJson(res, 422, { error: problems.join('; ') });
    return;
  }

  await mkdir(dir, { recursive: true });

  if (frames.length === 1) {
    await writeFile(plainPath, encodePng(frames[0]));
    await removeIfExists(stripPath);
    await removeIfExists(animPath);
  } else {
    const strip = buildStrip(frames);
    await writeFile(stripPath, encodePng(strip));
    await writeFile(animPath, `${JSON.stringify(animation, null, 2)}\n`);
    await removeIfExists(plainPath);
  }

  respondJson(res, 200, { ok: true });
}

/**
 * The `clips` map an existing sidecar already holds, as a spreadable object
 * (`{}` when there is none, or when the file is unreadable/not JSON).
 *
 * Deliberately forgiving about a broken file: this runs on the save path, and
 * refusing to save a drawing because a hand-edited sidecar next to it has a
 * stray comma would be the wrong trade. A broken sidecar is the art build's
 * problem to report (`tools/art/build.mjs` fails on it by name), and saving
 * over it with a valid one is a step towards fixing it, not away.
 */
async function existingClips(animPath) {
  try {
    const parsed = JSON.parse(await readFile(animPath, 'utf8'));
    return parsed?.clips === undefined ? {} : { clips: parsed.clips };
  } catch {
    return {};
  }
}

async function removeIfExists(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
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
