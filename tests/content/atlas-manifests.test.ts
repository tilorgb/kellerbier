import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanSprites } from '../../tools/art/scan.mjs';
import {
  compileAnimationSet,
  type AnimationSidecar,
} from '../../src/render/animation/definition.js';

/**
 * `render/floor-art.ts` and `render/player-art.ts` (#294) no longer read
 * `assets/sprites/**` at runtime — they read the packed `assets/atlases/*.json`
 * manifests `tools/art/build-atlas.mjs` writes from that tree. This is the
 * cross-check that the manifest format those two readers assume — one entry
 * per sprite, keyed `"<category>/<name>"`, `(x, y, width, height)` plus an
 * `animation` sidecar on a strip's one entry — is what actually lands on
 * disk, using the same committed sprites `tests/content/animated-sprites.test.ts`
 * already treats as ground truth.
 */

const SPRITE_ROOT = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const ATLAS_ROOT = fileURLToPath(new URL('../../assets/atlases/', import.meta.url));

interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly animation?: AnimationSidecar;
}

interface AtlasManifest {
  readonly width: number;
  readonly height: number;
  readonly frames: Readonly<Record<string, AtlasFrame>>;
}

async function readManifest(bucketId: string): Promise<AtlasManifest> {
  const raw = await readFile(`${ATLAS_ROOT}${bucketId}.json`, 'utf8');
  return JSON.parse(raw) as AtlasManifest;
}

const sprites = await scanSprites(SPRITE_ROOT);
const bucketIds = [...new Set(sprites.map((sprite) => sprite.bucketId))];
const manifestFiles = (await readdir(ATLAS_ROOT)).filter((name) => name.endsWith('.json'));

describe('atlas manifests match the committed sprite tree', () => {
  it('has at least one manifest, so this file is not silently vacuous', () => {
    expect(manifestFiles.length).toBeGreaterThan(0);
  });

  it('writes one manifest per bucket that actually has sprites', () => {
    expect(manifestFiles.map((name) => name.replace('.json', '')).sort()).toEqual(
      [...bucketIds].sort(),
    );
  });

  it.each(
    sprites.map(
      (sprite) => [`${sprite.bucketId}/${sprite.category}/${sprite.name}`, sprite] as const,
    ),
  )('%s has a manifest frame with its own rectangle', async (_label, sprite) => {
    const manifest = await readManifest(sprite.bucketId);
    const key = `${sprite.category}/${sprite.name}`;
    const frame = manifest.frames[key];
    expect(frame).toBeDefined();
    expect(frame?.width).toBeGreaterThan(0);
    expect(frame?.height).toBeGreaterThan(0);
    expect(frame?.x).toBeGreaterThanOrEqual(0);
    expect(frame?.y).toBeGreaterThanOrEqual(0);
    // Every packed rectangle fits inside its own sheet — a frame that ran
    // off the edge would be exactly the kind of packer bug `Texture.sub`
    // has no way to catch on its own (it just returns a view, valid or not).
    expect((frame?.x ?? 0) + (frame?.width ?? 0)).toBeLessThanOrEqual(manifest.width);
    expect((frame?.y ?? 0) + (frame?.height ?? 0)).toBeLessThanOrEqual(manifest.height);
  });

  it.each(
    sprites
      .filter((sprite) => sprite.animation !== null)
      .map((sprite) => [`${sprite.bucketId}/${sprite.name}`, sprite] as const),
  )('%s carries its animation sidecar onto its one manifest entry', async (_label, sprite) => {
    const manifest = await readManifest(sprite.bucketId);
    const key = `${sprite.category}/${sprite.name}`;
    const frame = manifest.frames[key];
    const sidecar = frame?.animation;
    expect(sidecar).toBeDefined();
    if (sidecar === undefined) {
      return;
    }
    // What `cutStrip`/`loadPlayerArt` actually do with it: compile it against
    // the frame count the manifest itself declares, the same as at runtime.
    expect(() => compileAnimationSet(sprite.name, sidecar, sidecar.frames)).not.toThrow();
  });

  it('never keys a non-animated sprite with an animation sidecar', async () => {
    for (const bucketId of bucketIds) {
      const manifest = await readManifest(bucketId);
      for (const [key, frame] of Object.entries(manifest.frames)) {
        const slash = key.indexOf('/');
        const category = key.slice(0, slash);
        const name = key.slice(slash + 1);
        const sprite = sprites.find(
          (s) => s.bucketId === bucketId && s.category === category && s.name === name,
        );
        if (sprite?.animation === null) {
          expect(frame.animation).toBeUndefined();
        }
      }
    }
  });
});
