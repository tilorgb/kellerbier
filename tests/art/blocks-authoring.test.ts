import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BLOCKS,
  BLOCK_BUCKETS,
  assertOnPalette,
  encodeSingle,
} from '../../tools/art/authoring/blocks.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { FLOOR_TILESETS } from '../../src/render/floor-art.js';

/**
 * The same guard `alois-authoring.test.ts` / `boss-authoring.test.ts` put on
 * their composed art, for the in-room blocking tiles: the committed PNG *is*
 * what `tools/art/authoring/blocks.mjs` produces, byte for byte, so editing
 * the source without `npm run art:blocks` fails a pull request rather than
 * shipping art nobody is looking at.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const entries = Object.entries(BLOCKS);

function bucketOf(name: string): string {
  const bucket = BLOCK_BUCKETS[name];
  if (bucket === undefined) {
    throw new Error(`no bucket registered for block sprite "${name}"`);
  }
  return bucket;
}

function pathFor(name: string): string {
  return `${SPRITES}${bucketOf(name)}/tiles/${name}.png`;
}

describe("the block tiles' committed art is what the authoring source produces", () => {
  it('produces the variant sets the tilesets name, and nothing else', () => {
    const named = Object.values(FLOOR_TILESETS)
      .flatMap((tileset) => tileset.blockVariants)
      .sort();
    expect(Object.keys(BLOCKS).sort()).toEqual(named);
  });

  it.each(Object.entries(FLOOR_TILESETS))('floor %s names 2–4 obstacle variants', (_floor, tileset) => {
    expect(tileset.blockVariants.length).toBeGreaterThanOrEqual(2);
    expect(tileset.blockVariants.length).toBeLessThanOrEqual(4);
  });

  it.each(entries)('%s.png is byte-identical to a fresh encode', async (name, frame) => {
    const committed = await readFile(pathFor(name));
    expect(
      encodeSingle(frame).equals(committed),
      `${name}.png differs from tools/art/authoring/blocks.mjs — run \`npm run art:blocks\``,
    ).toBe(true);
  });

  it.each(entries)('%s is a 32×32 tile', async (name) => {
    const { width, height } = decodePng(await readFile(pathFor(name)));
    expect([width, height]).toEqual([32, 32]);
  });

  it.each(entries)('%s stays on its floor palette', (name, frame) => {
    expect(() => {
      assertOnPalette(bucketOf(name), frame);
    }).not.toThrow();
  });

  it('the square-edged obstacles it replaces are gone', async () => {
    await expect(
      readFile(`${SPRITES}floor-1-cellar/tiles/cellar-plank.png`),
    ).rejects.toThrow();
    await expect(
      readFile(`${SPRITES}floor-2-rural/tiles/rural-hedge-block.png`),
    ).rejects.toThrow();
  });
});
