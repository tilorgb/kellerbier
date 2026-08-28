import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanSprites } from '../../tools/art/scan.mjs';
import { solidPng } from './helpers.js';

describe('scanSprites', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'kellerbier-art-scan-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds nothing in an empty tree', async () => {
    expect(await scanSprites(root)).toEqual([]);
  });

  it('finds a plain sprite under a known bucket and category', async () => {
    const dir = path.join(root, 'floor-1-cellar', 'tiles');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'floor.png'), solidPng(16, 16, 0x3c3e40));

    const sprites = await scanSprites(root);
    expect(sprites).toEqual([
      {
        bucketId: 'floor-1-cellar',
        category: 'tile',
        name: 'floor',
        filePath: path.join(dir, 'floor.png'),
        animation: null,
      },
    ]);
  });

  it('pairs a strip with its sidecar', async () => {
    const dir = path.join(root, 'floor-2-rural', 'characters');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'walk.strip.png'), solidPng(48, 16, 0x3f7a3a));
    const animation = { frames: 4, frameDurationMs: 120, loop: true };
    await writeFile(path.join(dir, 'walk.anim.json'), JSON.stringify(animation));

    const [sprite] = await scanSprites(root);
    expect(sprite?.animation).toEqual(animation);
    expect(sprite?.name).toBe('walk');
  });

  it('throws a descriptive error for a strip missing its sidecar', async () => {
    const dir = path.join(root, 'floor-2-rural', 'characters');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'walk.strip.png'), solidPng(48, 16, 0x3f7a3a));

    await expect(scanSprites(root)).rejects.toThrow(/walk\.anim\.json/);
  });

  it('carries a strip sidecar clips map through untouched', async () => {
    const dir = path.join(root, 'floor-1-cellar', 'characters');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'crawler.strip.png'), solidPng(48, 16, 0x54402e));
    const animation = {
      frames: 4,
      frameDurationMs: 120,
      loop: true,
      clips: {
        idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
        move: { frames: [0, 1, 2, 3], frameDurationMs: 110, mode: 'loop' },
      },
    };
    await writeFile(path.join(dir, 'crawler.anim.json'), JSON.stringify(animation));

    const [sprite] = await scanSprites(root);
    expect(sprite?.animation).toEqual(animation);
  });

  it('throws for a name authored as both a plain sprite and a strip', async () => {
    const dir = path.join(root, 'floor-1-cellar', 'characters');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'crawler.png'), solidPng(16, 16, 0x54402e));
    await writeFile(path.join(dir, 'crawler.strip.png'), solidPng(64, 16, 0x54402e));
    await writeFile(
      path.join(dir, 'crawler.anim.json'),
      JSON.stringify({ frames: 4, frameDurationMs: 120, loop: true }),
    );

    // Both would pack under `character/crawler`, so one of them would silently
    // win. This is the shape of forgetting to delete the static PNG when
    // animating an existing creature — the exact thing #150 did to the
    // Kellerassel.
    await expect(scanSprites(root)).rejects.toThrow(/authored twice/);
  });

  it('ignores an unknown bucket folder', async () => {
    const dir = path.join(root, 'not-a-real-bucket', 'tiles');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'floor.png'), solidPng(16, 16, 0x000000));

    expect(await scanSprites(root)).toEqual([]);
  });
});
