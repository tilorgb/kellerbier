import { CATEGORY_FOLDERS, type SpriteCategory } from '../../tools/art/spec.mjs';
import type { LoadedSprite, SpriteSummary } from './api-client.js';

/**
 * A server-less mirror of `tools/art/scan.mjs`'s directory convention
 * (`assets/sprites/<bucket>/<category-folder>/<name>[.strip].png`, an
 * animated strip's frame count/timing in a matching `.anim.json` sidecar),
 * built from `import.meta.glob` instead of `readdir`.
 *
 * `tools/pixel-editor/server.mjs`'s `GET /sprites` endpoints only ever exist
 * under `vite dev` — a CI-published preview build (`docs/DECISIONS.md`'s
 * pixel-editor entries) has no server behind it at all, so browsing/loading
 * existing art came back empty/failed there even though the split-view dock
 * itself was reachable. `import.meta.glob` sidesteps the whole
 * server-vs-static split: it is a *build-time* scan (Vite resolves every
 * matching path and bundles it, in dev and in a production build alike), so
 * the same code lists and loads sprites whichever way this page is served,
 * and the dev-only save endpoint (`api-client.ts`'s `saveSprite`) is the only
 * thing that still needs an actual server, because writing a new file is the
 * one thing a static build can never do for itself.
 */
const PNG_URLS: Record<string, string> = import.meta.glob('../../assets/sprites/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

interface AnimationSidecar {
  readonly frames: number;
  readonly frameDurationMs: number;
  readonly loop: boolean;
}

const ANIMATIONS: Record<string, AnimationSidecar> = import.meta.glob(
  '../../assets/sprites/**/*.anim.json',
  { eager: true, import: 'default' },
);

const FOLDER_TO_CATEGORY: Readonly<Record<string, SpriteCategory>> = Object.fromEntries(
  Object.entries(CATEGORY_FOLDERS).map(([category, folder]) => [folder, category]),
) as Record<string, SpriteCategory>;

interface ParsedSpritePath {
  readonly bucketId: string;
  readonly category: SpriteCategory;
  readonly name: string;
  readonly isStrip: boolean;
}

const PATH_PATTERN = /\/assets\/sprites\/([^/]+)\/([^/]+)\/([^/]+?)(\.strip)?\.png$/;

function parseSpritePath(path: string): ParsedSpritePath | null {
  const match = PATH_PATTERN.exec(path);
  if (match === null) {
    return null;
  }
  const [, bucketId, folder, name, stripSuffix] = match;
  const category = folder === undefined ? undefined : FOLDER_TO_CATEGORY[folder];
  if (bucketId === undefined || category === undefined || name === undefined) {
    return null;
  }
  return { bucketId, category, name, isStrip: stripSuffix !== undefined };
}

/** Every sprite `import.meta.glob` found, one entry per name (a strip and its sidecar count as one). */
export function listSpritesStatic(): SpriteSummary[] {
  const sprites: SpriteSummary[] = [];
  for (const path of Object.keys(PNG_URLS)) {
    const parsed = parseSpritePath(path);
    if (parsed === null) {
      continue;
    }
    sprites.push({
      bucketId: parsed.bucketId,
      category: parsed.category,
      name: parsed.name,
      hasAnimation: parsed.isStrip,
    });
  }
  return sprites;
}

/** Decodes a PNG asset URL into raw RGBA pixels via the browser's own image decoder — no `pngjs`, no server. */
async function decodePngUrl(
  url: string,
): Promise<{ width: number; height: number; pixels: Uint8ClampedArray }> {
  const response = await fetch(url);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('2D canvas context unavailable');
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, pixels: imageData.data };
}

export async function loadSpriteStatic(
  bucketId: string,
  category: string,
  name: string,
): Promise<LoadedSprite | null> {
  const entries = Object.entries(PNG_URLS)
    .map(([path, url]) => ({ path, url, parsed: parseSpritePath(path) }))
    .filter(
      (entry) =>
        entry.parsed !== null &&
        entry.parsed.bucketId === bucketId &&
        entry.parsed.category === category &&
        entry.parsed.name === name,
    );
  // A strip and a plain file never coexist under the same name (the art
  // pipeline's own build would already refuse to pack that bucket), but
  // preferring the plain file if they somehow both exist is the same "at
  // least resolve to something reasonable" choice `scanSprites` makes by
  // keying each set off its own suffix rather than erroring outright.
  const entry = entries.find((candidate) => candidate.parsed?.isStrip === false) ?? entries[0];
  if (entry === undefined) {
    return null;
  }
  const { parsed } = entry;
  if (parsed === null) {
    return null;
  }
  const { width, height, pixels } = await decodePngUrl(entry.url);
  const animPath = entry.path.replace(/\.strip\.png$/, '.anim.json');
  const animation = parsed.isStrip ? ANIMATIONS[animPath] : undefined;
  const frameCount = animation?.frames ?? 1;
  const frameWidth = width / frameCount;
  const frames: Uint8ClampedArray[] = [];
  for (let index = 0; index < frameCount; index++) {
    const frame = new Uint8ClampedArray(frameWidth * height * 4);
    for (let row = 0; row < height; row++) {
      const sourceStart = (row * width + index * frameWidth) * 4;
      frame.set(pixels.subarray(sourceStart, sourceStart + frameWidth * 4), row * frameWidth * 4);
    }
    frames.push(frame);
  }
  return {
    frameWidth,
    frameHeight: height,
    frames,
    frameDurationMs: animation?.frameDurationMs ?? 120,
    loop: animation?.loop ?? true,
  };
}
