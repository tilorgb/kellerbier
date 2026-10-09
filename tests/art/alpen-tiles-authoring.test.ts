import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALPEN_TILES,
  TILE_BUCKET,
  assertOnPalette,
  encodeTile,
} from '../../tools/art/authoring/alpen-tiles.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize } from '../../tools/art/validate.mjs';
import { spriteTier } from '../../tools/art/tiers.mjs';
import { FLOOR_TILESETS, PROP_TILE_NAMES } from '../../src/render/floor-art.js';

/**
 * `blocks-authoring.test.ts`'s guard for Die Alpen's tileset and props: the
 * committed PNG *is* what `tools/art/authoring/alpen-tiles.mjs` produces,
 * byte for byte, so editing the source without `npm run art:alpen-tiles`
 * fails a pull request rather than shipping art nobody looked at.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const entries = Object.entries(ALPEN_TILES);

function pathFor(name: string): string {
  return `${SPRITES}${TILE_BUCKET}/tiles/${name}.png`;
}

describe("Die Alpen's committed tiles are what the authoring source produces", () => {
  it('authors the floor-4 tileset, every alpen prop a room can name, and the barrel', () => {
    const tileset = FLOOR_TILESETS[4];
    expect(tileset).toBeDefined();
    if (tileset === undefined) {
      return;
    }
    const named = new Set([
      ...tileset.floorVariants,
      tileset.wall,
      tileset.wallLip,
      tileset.wallLipCorner,
      ...(tileset.surround === undefined ? [] : [tileset.surround]),
      ...tileset.destructibles,
      ...Object.values(PROP_TILE_NAMES).filter(
        (tile): tile is string => tile?.startsWith('alpen-') === true,
      ),
    ]);
    expect(Object.keys(ALPEN_TILES).sort()).toEqual([...named].sort());
  });

  it.each(entries)('%s.png is byte-identical to a fresh encode', async (name, frame) => {
    const committed = await readFile(pathFor(name));
    expect(
      encodeTile(frame).equals(committed),
      `${name}.png differs from tools/art/authoring/alpen-tiles.mjs — run \`npm run art:alpen-tiles\``,
    ).toBe(true);
  });

  it.each(entries)('%s stays on its tier of the floor-4-alpen palette', (_name, frame) => {
    expect(() => {
      assertOnPalette(frame);
    }).not.toThrow();
    expect(spriteTier(TILE_BUCKET, 'tile', frame.name)).toBe(frame.tier);
  });

  it.each(entries)('%s decodes to its authored canvas, a legal tile size', async (name, frame) => {
    const { width, height } = decodePng(await readFile(pathFor(name)));
    expect([width, height]).toEqual([frame.width, frame.height]);
    expect(validateSpriteSize('tile', width, height)).toBeNull();
  });

  it('tiles the floor and the wall seamlessly: no row or column is a hard seam', () => {
    // The floor is drawn repeated; a tile whose left edge is a different
    // picture from its right edge draws a grid over the room. Held loosely:
    // the mean brightness of the two outer columns (and rows) stays close.
    const luma = (c: number | null): number =>
      c === null ? 0 : ((c >> 16) & 0xff) * 0.3 + ((c >> 8) & 0xff) * 0.59 + (c & 0xff) * 0.11;
    for (const name of ['alpen-floor-1', 'alpen-floor-2', 'alpen-floor-3', 'alpen-floor-4']) {
      const frame = ALPEN_TILES[name];
      if (frame === undefined) {
        throw new Error(name);
      }
      const col = (x: number): number =>
        frame.px.reduce<number>((sum, row) => sum + luma(row[x] ?? null), 0) / frame.height;
      const row = (y: number): number =>
        (frame.px[y] ?? []).reduce<number>((sum, c) => sum + luma(c), 0) / frame.width;
      expect(Math.abs(col(0) - col(frame.width - 1)), name).toBeLessThan(12);
      expect(Math.abs(row(0) - row(frame.height - 1)), name).toBeLessThan(12);
    }
  });

  it('keeps the wall top’s body rows self-tiling and its edge band at the top', () => {
    // `render/world/scenery.ts` reads the image's top 8 rows as the room-side
    // edge and tiles rows 8-31 to fill a wide void top; the authoring draws
    // the band at the bottom and flips, so the committed image has the
    // alpenglow rim on row 0.
    const lip = ALPEN_TILES['alpen-wall-lip'];
    expect(lip).toBeDefined();
    const rimRow = lip?.px[0] ?? [];
    expect(new Set(rimRow).size).toBeLessThanOrEqual(2);
    expect(rimRow.every((c) => c === 0xb47384 || c === 0xa3576b)).toBe(true);
  });
});
