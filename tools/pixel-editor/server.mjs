/**
 * Dev-server half of the pixel-art authoring tool (#108): a Vite plugin,
 * wired into `vite.config.ts`, exposing the endpoints `pixel-editor.html`'s
 * browser app talks to under `/__pixel-editor-api/sprites` —
 *
 * - `GET  /sprites`                     — every sprite currently on disk, for the browse panel
 * - `GET  /sprites/:bucket/:category/:name` — decodes one sprite (plain or strip) for loading
 * - `POST /sprites/:bucket/:category/:name` — validates and writes a drawn sprite
 *
 * `configureServer` middleware only ever runs under `vite`/`vite dev`, never
 * `vite build`/`vite preview` — see `roomEditorServerPlugin` in
 * `tools/room-editor/server.mjs`, the sibling this follows.
 *
 * Every check here reuses the same pure functions `tools/art/build.mjs` runs
 * at build time (`docs/DECISIONS.md` #25) — this endpoint is a second,
 * earlier place those functions run, not a second implementation of them.
 * `png.mjs` (the one place this pipeline touches the `pngjs` dependency) and
 * the actual file writes are the reason this lives server-side rather than
 * only in the browser bundle.
 */

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { legalPixelColorsFor } from '../art/palette.mjs';
import { decodePng, encodePng } from '../art/png.mjs';
import { scanSprites } from '../art/scan.mjs';
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

          if (parts.length === 0) {
            if (req.method !== 'GET') {
              respondJson(res, 405, { error: 'only GET is supported on /sprites' });
              return;
            }
            await handleList(res);
            return;
          }

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

          if (req.method === 'GET') {
            await handleLoad(res, bucketId, category, name);
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

async function handleList(res) {
  const sprites = await scanSprites(ROOT_DIR);
  respondJson(res, 200, {
    sprites: sprites.map((sprite) => ({
      bucketId: sprite.bucketId,
      category: sprite.category,
      name: sprite.name,
      hasAnimation: sprite.animation !== null,
    })),
  });
}

async function handleLoad(res, bucketId, category, name) {
  const dir = path.join(ROOT_DIR, bucketId, CATEGORY_FOLDERS[category]);
  const plainPath = path.join(dir, `${name}.png`);
  const stripPath = path.join(dir, `${name}.strip.png`);
  const animPath = path.join(dir, `${name}.anim.json`);

  let buffer;
  let animation = null;
  try {
    buffer = await readFile(plainPath);
  } catch {
    try {
      buffer = await readFile(stripPath);
      animation = JSON.parse(await readFile(animPath, 'utf8'));
    } catch {
      respondJson(res, 404, { error: `no sprite named "${name}" in ${bucketId}/${category}` });
      return;
    }
  }

  const { width, height, pixels } = decodePng(buffer);
  const frameCount = animation?.frames ?? 1;
  const frameWidth = width / frameCount;
  const frames = [];
  for (let index = 0; index < frameCount; index++) {
    const frame = Buffer.alloc(frameWidth * height * 4);
    for (let row = 0; row < height; row++) {
      const sourceStart = (row * width + index * frameWidth) * 4;
      pixels.copy(frame, row * frameWidth * 4, sourceStart, sourceStart + frameWidth * 4);
    }
    frames.push(frame.toString('base64'));
  }

  respondJson(res, 200, {
    frameWidth,
    frameHeight: height,
    frames,
    frameDurationMs: animation?.frameDurationMs ?? DEFAULT_FRAME_DURATION_MS,
    loop: animation?.loop ?? true,
  });
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

  let animation = null;
  if (frames.length > 1) {
    animation = {
      frames: frames.length,
      frameDurationMs: frameDurationMs ?? DEFAULT_FRAME_DURATION_MS,
      loop: loop !== false,
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

  const dir = path.join(ROOT_DIR, bucketId, CATEGORY_FOLDERS[category]);
  await mkdir(dir, { recursive: true });
  const plainPath = path.join(dir, `${name}.png`);
  const stripPath = path.join(dir, `${name}.strip.png`);
  const animPath = path.join(dir, `${name}.anim.json`);

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
