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
    await writeFile(path.join(dir, 'floor.png'), solidPng(16, 16, 0x35383a));

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

  it('ignores an unknown bucket folder', async () => {
    const dir = path.join(root, 'not-a-real-bucket', 'tiles');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'floor.png'), solidPng(16, 16, 0x000000));

    expect(await scanSprites(root)).toEqual([]);
  });
});
