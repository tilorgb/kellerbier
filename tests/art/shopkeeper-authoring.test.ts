import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SHOPKEEPER_FRAMES,
  assertOnPalette,
  encodeStrip,
} from '../../tools/art/authoring/shopkeeper.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';

/**
 * The same guard `floor1-roster-authoring.test.ts`/`floor2-roster-authoring.
 * test.ts` put on their composed art, for Der Wirt (#194). The
 * silhouette-vs-collider check lives in `tests/content/sprite-scale.test.ts`,
 * which also owns `shopkeeper` leaving `PENDING_REDRAW`.
 */

const CHARS = fileURLToPath(new URL('../../assets/sprites/common/characters/', import.meta.url));
const LEGAL = legalPixelColorsFor('common');

describe("Der Wirt's committed art is what the authoring source produces", () => {
  it('is a two-frame idle breathing loop', () => {
    expect(SHOPKEEPER_FRAMES).toHaveLength(2);
  });

  it('strip.png is byte-identical to a fresh encode', async () => {
    const committed = await readFile(`${CHARS}shopkeeper.strip.png`);
    expect(
      encodeStrip('shopkeeper', SHOPKEEPER_FRAMES).equals(committed),
      'shopkeeper.strip.png differs from tools/art/authoring/shopkeeper.mjs — run `npm run art:shopkeeper`',
    ).toBe(true);
  });

  it('decodes on-palette, at its authored canvas, within the character spec', async () => {
    const { width, height, pixels } = decodePng(await readFile(`${CHARS}shopkeeper.strip.png`));
    expect(width % SHOPKEEPER_FRAMES.length).toBe(0);
    expect(validateSpriteSize('character', width, height, SHOPKEEPER_FRAMES.length)).toBeNull();
    expect(() => {
      assertOnPalette('common', SHOPKEEPER_FRAMES);
    }).not.toThrow();
    expect(
      findOffPalettePixel(pixels, width, height, LEGAL),
      'shopkeeper has an off-palette pixel',
    ).toBeNull();
  });

  it('has an idle clip in its sidecar', async () => {
    const sidecar = JSON.parse(await readFile(`${CHARS}shopkeeper.anim.json`, 'utf8')) as {
      frames: number;
      clips: Record<string, unknown>;
    };
    expect(sidecar.frames).toBe(2);
    expect(Object.keys(sidecar.clips)).toEqual(['idle']);
  });
});
