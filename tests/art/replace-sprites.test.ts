import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replaceSprites } from '../../tools/art/replace-sprites.mjs';
import { solidPng } from './helpers.js';

const GREEN = 0x3f7a3a;
const NOW = new Date('2026-10-01T12:00:00Z');

describe('replaceSprites', () => {
  let base: string;
  let rootDir: string;
  let inboxDir: string;
  let archiveDir: string;
  let characters: string;

  beforeEach(async () => {
    base = await mkdtemp(path.join(tmpdir(), 'kellerbier-replace-'));
    rootDir = path.join(base, 'sprites');
    inboxDir = path.join(base, 'inbox');
    archiveDir = path.join(base, 'archive');
    characters = path.join(rootDir, 'common', 'characters');
    await mkdir(characters, { recursive: true });
    await mkdir(inboxDir, { recursive: true });
    await writeFile(path.join(characters, 'kuh.png'), solidPng(16, 16, GREEN));
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  const run = () => replaceSprites({ rootDir, inboxDir, archiveDir, now: NOW });

  it('swaps the sprite in and archives the old file with a log', async () => {
    await writeFile(path.join(inboxDir, 'kuh.png'), solidPng(20, 20, GREEN));

    const { replaced, archiveFolder } = await run();

    expect(replaced).toEqual(['common/characters: kuh.png -> kuh.png']);
    expect((await readFile(path.join(characters, 'kuh.png'))).equals(solidPng(20, 20, GREEN))).toBe(
      true,
    );
    const archived = path.join(archiveFolder ?? '', 'common', 'characters', 'kuh.png');
    expect((await readFile(archived)).equals(solidPng(16, 16, GREEN))).toBe(true);
    expect(await readFile(path.join(archiveFolder ?? '', 'REPLACED.txt'), 'utf8')).toContain(
      'kuh.png -> kuh.png',
    );
    expect(await readdir(inboxDir)).toEqual([]);
  });

  it('moves a sprite to @2x, replacing the plain file', async () => {
    await writeFile(path.join(inboxDir, 'kuh@2x.png'), solidPng(32, 32, GREEN));

    await run();

    expect((await readdir(characters)).sort()).toEqual(['kuh@2x.png']);
  });

  it('keeps the old sidecar for a strip delivered without one', async () => {
    const sidecar = JSON.stringify({ frames: 2, frameDurationMs: 100, loop: true });
    await writeFile(path.join(characters, 'walk.strip.png'), solidPng(32, 16, GREEN));
    await writeFile(path.join(characters, 'walk.anim.json'), sidecar);
    await writeFile(path.join(inboxDir, 'walk@2x.strip.png'), solidPng(64, 32, GREEN));

    await run();

    expect((await readdir(characters)).sort()).toEqual([
      'kuh.png',
      'walk@2x.anim.json',
      'walk@2x.strip.png',
    ]);
    expect(await readFile(path.join(characters, 'walk@2x.anim.json'), 'utf8')).toBe(sidecar);
  });

  it('replaces nothing, and restores everything, when the new art fails the pipeline', async () => {
    // 200px wide is outside the character spec.
    await writeFile(path.join(inboxDir, 'kuh.png'), solidPng(200, 16, GREEN));

    await expect(run()).rejects.toThrow(/nothing replaced/);

    expect((await readFile(path.join(characters, 'kuh.png'))).equals(solidPng(16, 16, GREEN))).toBe(
      true,
    );
    expect(await readdir(inboxDir)).toEqual(['kuh.png']);
    expect(await readdir(archiveDir).catch(() => [])).toEqual([]);
  });

  it('refuses a file that names no existing sprite', async () => {
    await writeFile(path.join(inboxDir, 'neu.png'), solidPng(16, 16, GREEN));

    await expect(run()).rejects.toThrow(/no existing sprite named "neu"/);
    expect(await readdir(inboxDir)).toEqual(['neu.png']);
  });

  it('asks for a bucket subfolder when a name exists on two floors', async () => {
    const rural = path.join(rootDir, 'floor-2-rural', 'characters');
    await mkdir(rural, { recursive: true });
    await writeFile(path.join(rural, 'kuh.png'), solidPng(16, 16, GREEN));
    await writeFile(path.join(inboxDir, 'kuh.png'), solidPng(16, 16, GREEN));

    await expect(run()).rejects.toThrow(/more than one bucket/);

    await mkdir(path.join(inboxDir, 'common'));
    await rm(path.join(inboxDir, 'kuh.png'));
    await writeFile(path.join(inboxDir, 'common', 'kuh.png'), solidPng(18, 18, GREEN));
    const { replaced } = await run();
    expect(replaced).toEqual(['common/characters: kuh.png -> kuh.png']);
  });
});
