import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AtlasBuildError, buildAtlases } from '../../tools/art/build.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { FLOOR_PALETTES, toBackgroundHue } from '../../tools/art/palette.mjs';
import { makePng, solidPng } from './helpers.js';

// Two arbitrary on-palette cellar colours, read from the real palette rather
// than hardcoded here a second time — a hex value copy-pasted as "some legal
// colour" is exactly what quietly went stale (twice) when the cellar palette
// itself was tuned for contrast (#35).
function cellarColor(index: number): number {
  const value = FLOOR_PALETTES.cellar[index];
  if (value === undefined) {
    throw new Error(`cellar palette has no colour at index ${String(index)}`);
  }
  return value;
}
const CELLAR_A = cellarColor(0);
const CELLAR_B = cellarColor(3);

/** `0xrrggbb` to an `[r, g, b, a]` tuple, for `makePng`'s per-pixel callback. */
function rgba(hex: number, alpha = 255): [number, number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff, alpha];
}

async function writeSprite(
  root: string,
  bucket: string,
  category: string,
  name: string,
  png: Buffer,
) {
  const dir = path.join(root, bucket, category);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${name}.png`), png);
}

describe('buildAtlases', () => {
  let root: string;
  let out: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'kellerbier-art-sprites-'));
    out = await mkdtemp(path.join(tmpdir(), 'kellerbier-art-atlases-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  });

  it('reports no atlases for an empty tree', async () => {
    const report = await buildAtlases({ rootDir: root, outDir: out, write: false });
    expect(report).toEqual({
      atlasCount: 0,
      spriteCount: 0,
      totalBytes: 0,
      projectileSpritesChecked: 0,
      atlases: [],
    });
  });

  it('packs on-palette sprites into an atlas and reports its size and memory', async () => {
    await writeSprite(root, 'floor-1-cellar', 'tiles', 'floor', solidPng(16, 16, CELLAR_A));
    await writeSprite(root, 'floor-1-cellar', 'tiles', 'wall', solidPng(16, 16, CELLAR_B));

    const report = await buildAtlases({ rootDir: root, outDir: out, write: true });
    expect(report.atlasCount).toBe(1);
    expect(report.spriteCount).toBe(2);
    const [atlas] = report.atlases;
    expect(atlas).toBeDefined();
    if (atlas === undefined) {
      return;
    }
    expect(atlas.bucketId).toBe('floor-1-cellar');
    expect(atlas.spriteCount).toBe(2);
    expect(atlas.bytes).toBe(atlas.width * atlas.height * 4);
    expect(report.totalBytes).toBe(atlas.bytes);

    // The atlas PNG and its manifest actually land on disk.
    const pngBuffer = await readFile(path.join(out, 'floor-1-cellar.png'));
    const decoded = decodePng(pngBuffer);
    expect(decoded.width).toBe(atlas.width);
    const manifest = JSON.parse(await readFile(path.join(out, 'floor-1-cellar.json'), 'utf8')) as {
      frames: Record<string, unknown>;
    };
    expect(Object.keys(manifest.frames).sort()).toEqual(['tile/floor', 'tile/wall']);
  });

  it('fails the build on an off-palette pixel, naming the file and the pixel', async () => {
    // 0xd92b3c is only legal on floor-7-wiesn, not floor-1-cellar.
    const bad = makePng(16, 16, (x, y) =>
      x === 5 && y === 9 ? [0xd9, 0x2b, 0x3c, 255] : rgba(CELLAR_A),
    );
    await writeSprite(root, 'floor-1-cellar', 'tiles', 'bad', bad);

    const failure = await buildAtlases({ rootDir: root, outDir: out, write: false }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AtlasBuildError);
    const message = (failure as InstanceType<typeof AtlasBuildError>).message;
    expect(message).toMatch(/bad\.png/);
    expect(message).toMatch(/\(5, 9\)/);
    expect(message).toMatch(/#d92b3c/);
  });

  it('checks a background-tier sprite against the derived tier, not the foreground palette', async () => {
    // A colour only on the background tier — a rural hue darkened and
    // desaturated by `toBackgroundHue`. Legal on `rural-well` (a decorative
    // prop, background tier per `tools/art/tiers.mjs`)...
    const ruralA = FLOOR_PALETTES.rural[0];
    if (ruralA === undefined) {
      throw new Error('rural palette is empty');
    }
    const bgColor = toBackgroundHue(ruralA);
    await writeSprite(root, 'floor-2-rural', 'tiles', 'rural-well', solidPng(16, 16, bgColor));
    const report = await buildAtlases({ rootDir: root, outDir: out, write: false });
    expect(report.spriteCount).toBe(1);

    // ...and off-palette on `rural-barrel`, a destructible the player acts on
    // (foreground tier), even though the pixels are identical.
    await writeSprite(root, 'floor-2-rural', 'tiles', 'rural-barrel', solidPng(16, 16, bgColor));
    const failure = await buildAtlases({ rootDir: root, outDir: out, write: false }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AtlasBuildError);
    const message = (failure as InstanceType<typeof AtlasBuildError>).message;
    expect(message).toMatch(/rural-barrel\.png/);
    expect(message).toMatch(/on the foreground tier/);
    expect(message).not.toMatch(/rural-well\.png/);
  });

  it('fails the build on a sprite outside its category size spec', async () => {
    await writeSprite(root, 'floor-1-cellar', 'tiles', 'oversized', solidPng(20, 20, CELLAR_A));

    const failure = await buildAtlases({ rootDir: root, outDir: out, write: false }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AtlasBuildError);
    expect((failure as InstanceType<typeof AtlasBuildError>).message).toMatch(
      /oversized\.png.*20x20/s,
    );
  });

  it('catches a deliberately low-contrast enemy projectile against a real floor palette', async () => {
    // A projectile whose only opaque colour matches floor 3's own dark
    // background almost exactly — the "swallows the bullet" bug.
    await writeSprite(root, 'floor-3-wald', 'projectiles', 'dull-shot', solidPng(8, 8, 0x17271b));

    const failure = await buildAtlases({ rootDir: root, outDir: out, write: false }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AtlasBuildError);
    expect((failure as InstanceType<typeof AtlasBuildError>).message).toMatch(/dull-shot/);
    expect((failure as InstanceType<typeof AtlasBuildError>).message).toMatch(
      /below the minimum 3:1/,
    );
  });

  it('passes a projectile with a properly bright rim', async () => {
    await writeSprite(root, 'floor-3-wald', 'projectiles', 'good-shot', solidPng(8, 8, 0xffffff));

    const report = await buildAtlases({ rootDir: root, outDir: out, write: false });
    expect(report.projectileSpritesChecked).toBe(1);
  });

  it('validates an animation strip end to end', async () => {
    const dir = path.join(root, 'floor-2-rural', 'characters');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'walk.strip.png'), solidPng(48, 16, 0x3f7a3a));
    await writeFile(
      path.join(dir, 'walk.anim.json'),
      JSON.stringify({ frames: 4, frameDurationMs: [100, 100, 100, 100], loop: true }),
    );

    const report = await buildAtlases({ rootDir: root, outDir: out, write: true });
    expect(report.atlasCount).toBe(1);
    const manifest = JSON.parse(await readFile(path.join(out, 'floor-2-rural.json'), 'utf8')) as {
      frames: Record<string, { animation?: { frames: number } }>;
    };
    expect(manifest.frames['character/walk']?.animation?.frames).toBe(4);
  });

  it('rejects a strip with a malformed animation sidecar', async () => {
    const dir = path.join(root, 'floor-2-rural', 'characters');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'walk.strip.png'), solidPng(48, 16, 0x3f7a3a));
    await writeFile(
      path.join(dir, 'walk.anim.json'),
      JSON.stringify({ frames: 4, frameDurationMs: [100, 100], loop: true }),
    );

    const failure = await buildAtlases({ rootDir: root, outDir: out, write: false }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AtlasBuildError);
    expect((failure as InstanceType<typeof AtlasBuildError>).message).toMatch(
      /2 entries for 4 frames/,
    );
  });
});
