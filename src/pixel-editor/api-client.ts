/**
 * `saveSprite` talks to `tools/pixel-editor/server.mjs`'s save endpoint,
 * available under `vite dev` only — a production build (the CI-published
 * preview, `docs/DECISIONS.md`'s pixel-editor entries) has no server behind
 * it, so it branches on `import.meta.env.DEV` and exports to disk via
 * `dev-ui/file-export.ts` instead. `listSprites`/`loadSprite` need no such
 * branch: `static-sprite-index.ts`'s `import.meta.glob` scan works
 * identically in dev and in a static build, so browsing and loading existing
 * art is the same code path everywhere, and never depends on a server being
 * there to ask.
 */

import { exportFile } from '../dev-ui/file-export.js';
import { listSpritesStatic, loadSpriteStatic } from './static-sprite-index.js';

const API_BASE = '/__pixel-editor-api/sprites';

export interface SpriteSummary {
  readonly bucketId: string;
  readonly category: string;
  readonly name: string;
  readonly hasAnimation: boolean;
}

export interface LoadedSprite {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frames: readonly Uint8ClampedArray[];
  readonly frameDurationMs: number;
  readonly loop: boolean;
}

export interface SaveResult {
  readonly ok: boolean;
  readonly error?: string;
  /** Which path actually wrote the file — lets the caller word the status message correctly. */
  readonly via?: 'dev-server' | 'file-export';
}

export interface SpriteToSave {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frames: readonly Uint8ClampedArray[];
  readonly frameDurationMs: number;
  readonly loop: boolean;
}

function spritePath(bucketId: string, category: string, name: string): string {
  return `${API_BASE}/${encodeURIComponent(bucketId)}/${encodeURIComponent(category)}/${encodeURIComponent(name)}`;
}

/**
 * `btoa`/`atob` only take/return "binary strings", one JS UTF-16 code unit
 * per byte — chunked so a large boss strip doesn't blow the call-stack
 * argument limit `String.fromCharCode(...bytes)` would hit in one shot.
 * Exported alongside `base64ToBytes` because `main.ts` reuses the same pair
 * to snapshot the in-progress canvas around the art pipeline's post-save
 * full reload — see its `SNAPSHOT_KEY` comment.
 */
export function bytesToBase64(bytes: Uint8ClampedArray): string {
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8ClampedArray {
  const binary = atob(base64);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function listSprites(): Promise<SpriteSummary[]> {
  return Promise.resolve(listSpritesStatic());
}

export async function loadSprite(
  bucketId: string,
  category: string,
  name: string,
): Promise<LoadedSprite | null> {
  return loadSpriteStatic(bucketId, category, name);
}

export async function saveSprite(
  bucketId: string,
  category: string,
  name: string,
  sprite: SpriteToSave,
): Promise<SaveResult> {
  if (!import.meta.env.DEV) {
    return saveSpriteToDisk(name, sprite);
  }
  const response = await fetch(spritePath(bucketId, category, name), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      frameWidth: sprite.frameWidth,
      frameHeight: sprite.frameHeight,
      frames: sprite.frames.map(bytesToBase64),
      frameDurationMs: sprite.frameDurationMs,
      loop: sprite.loop,
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return { ok: true, via: 'dev-server' };
  }
  const error =
    typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `save failed with status ${String(response.status)}`;
  return { ok: false, error, via: 'dev-server' };
}

/** One frame's pixels, PNG-encoded via the browser's own canvas codec — no server, no `pngjs`. */
async function frameToPngBlob(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('2D canvas context unavailable');
  }
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('canvas.toBlob produced no data'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

/** The in-browser equivalent of `tools/pixel-editor/strip.mjs`'s `buildStrip` — same layout, `Uint8ClampedArray` instead of a Node `Buffer`. */
function buildStripPixels(
  frames: readonly Uint8ClampedArray[],
  frameWidth: number,
  frameHeight: number,
): Uint8ClampedArray {
  const stripWidth = frameWidth * frames.length;
  const combined = new Uint8ClampedArray(stripWidth * frameHeight * 4);
  frames.forEach((frame, index) => {
    for (let row = 0; row < frameHeight; row++) {
      const sourceStart = row * frameWidth * 4;
      const destStart = (row * stripWidth + index * frameWidth) * 4;
      combined.set(frame.subarray(sourceStart, sourceStart + frameWidth * 4), destStart);
    }
  });
  return combined;
}

/**
 * The no-dev-server save path: exports the same files
 * `tools/pixel-editor/server.mjs` would have written — a plain PNG for a
 * single frame, or a `.strip.png` + `.anim.json` pair for an animation — via
 * `exportFile`'s save dialog, one call per file. Nothing here validates
 * palette/size the way the server does; the canvas is already fixed-size and
 * palette-locked (`docs/DECISIONS.md` #25), so there is nothing left for a
 * second check here to catch.
 */
async function saveSpriteToDisk(name: string, sprite: SpriteToSave): Promise<SaveResult> {
  const isAnimated = sprite.frames.length > 1;
  const firstFrame =
    sprite.frames[0] ?? new Uint8ClampedArray(sprite.frameWidth * sprite.frameHeight * 4);
  const pngPixels = isAnimated
    ? buildStripPixels(sprite.frames, sprite.frameWidth, sprite.frameHeight)
    : firstFrame;
  const pngWidth = isAnimated ? sprite.frameWidth * sprite.frames.length : sprite.frameWidth;
  const pngBlob = await frameToPngBlob(pngWidth, sprite.frameHeight, pngPixels);
  const pngName = isAnimated ? `${name}.strip.png` : `${name}.png`;

  const pngResult = await exportFile(pngName, pngBlob, 'PNG image');
  if (!pngResult.ok) {
    return {
      ok: false,
      via: 'file-export',
      error: pngResult.cancelled ? 'save cancelled' : (pngResult.error ?? 'save failed'),
    };
  }
  if (!isAnimated) {
    return { ok: true, via: 'file-export' };
  }

  const animation = {
    frames: sprite.frames.length,
    frameDurationMs: sprite.frameDurationMs,
    loop: sprite.loop,
  };
  const animBlob = new Blob([`${JSON.stringify(animation, null, 2)}\n`], {
    type: 'application/json',
  });
  const animResult = await exportFile(`${name}.anim.json`, animBlob, 'Animation timing');
  if (!animResult.ok) {
    return {
      ok: false,
      via: 'file-export',
      error: `saved ${pngName}, but not its animation timing file: ${animResult.cancelled ? 'cancelled' : (animResult.error ?? 'save failed')}`,
    };
  }
  return { ok: true, via: 'file-export' };
}
