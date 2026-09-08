import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import {
  ITEM_ART,
  assertOnPalette,
  encodeSingle,
  itemFrame,
  SIZE,
} from '../../tools/art/authoring/items.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';

/**
 * The same guard `shopkeeper-authoring.test.ts` puts on composed art, for the
 * item icons (`tools/art/authoring/items.mjs`): every committed
 * `item-<id>.png` is byte-identical to a fresh encode, on-palette, on the
 * signed-off 24×24 canvas, and names a real item — and no item has art
 * nobody authored from source.
 */

const CHARS = fileURLToPath(new URL('../../assets/sprites/common/characters/', import.meta.url));
const LEGAL = legalPixelColorsFor('common');
const ITEM_IDS = new Set(ITEM_DEFINITIONS.map((item) => item.id));
const authoredIds = Object.keys(ITEM_ART);

describe('item icons — authored from source, batch by batch', () => {
  it('every authored icon names a real item', () => {
    for (const id of authoredIds) {
      expect(ITEM_IDS.has(id), `items.mjs draws "${id}", which is not in the roster`).toBe(true);
    }
  });

  it('every committed item-*.png has an authoring source', async () => {
    const onDisk = (await readdir(CHARS))
      .filter((file) => file.startsWith('item-') && file.endsWith('.png'))
      .map((file) => file.slice('item-'.length, -'.png'.length));
    expect(onDisk.sort()).toEqual([...authoredIds].sort());
  });

  it.each(authoredIds)('%s is byte-identical to a fresh encode, on-palette, 24x24', async (id) => {
    const frame = itemFrame(id);
    expect(frame.width).toBe(SIZE);
    expect(frame.height).toBe(SIZE);
    expect(() => {
      assertOnPalette('common', [frame]);
    }).not.toThrow();
    const committed = await readFile(`${CHARS}item-${id}.png`);
    expect(
      encodeSingle(frame).equals(committed),
      `item-${id}.png differs from tools/art/authoring/items.mjs — run \`npm run art:items\``,
    ).toBe(true);
    const { width, height, pixels } = decodePng(committed);
    expect(validateSpriteSize('character', width, height)).toBeNull();
    expect(findOffPalettePixel(pixels, width, height, LEGAL)).toBeNull();
  });

  it('every icon has a hard ink edge — no painted pixel touches emptiness without #000000 between', () => {
    for (const id of authoredIds) {
      const { px, width, height } = itemFrame(id);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const c = px[y]?.[x] ?? null;
          if (c === null || c === 0x000000) {
            continue;
          }
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nx = x + dx;
            const ny = y + dy;
            const inside = nx >= 0 && ny >= 0 && nx < width && ny < height;
            const neighbour = inside ? (px[ny]?.[nx] ?? null) : null;
            expect(
              neighbour,
              `${id}: pixel ${String(x)},${String(y)} has no ink edge`,
            ).not.toBeNull();
          }
        }
      }
    }
  });
});
