import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ROSTER,
  ROSTER_BUCKET,
  assertOnPalette,
  encodeSingle,
} from '../../tools/art/authoring/floor3-roster.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';

/**
 * `floor2-roster-authoring.test.ts`'s guard, for Der Wald's roster: the
 * committed PNG *is* what `tools/art/authoring/floor3-roster.mjs` produces,
 * byte for byte, so editing the source without `npm run art:floor3` fails a
 * pull request rather than shipping art nobody looked at. Grows by one entry
 * per Floor 3 creature as each is signed off (#405-#411).
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const entries = Object.entries(ROSTER);
const LEGAL = legalPixelColorsFor('floor-3-wald');

function pathFor(name: string): string {
  return `${SPRITES}floor-3-wald/characters/${name}.png`;
}

describe("Der Wald roster's committed art is what the authoring source produces", () => {
  it('covers the signed-off creatures so far', () => {
    expect(Object.keys(ROSTER).sort()).toEqual([
      'bachforelle',
      'bachforelle-shadow',
      'boar',
      'borkenkaefer',
      'fliegenpilz',
      'kaninchen',
      'zecke',
    ]);
  });

  it.each(entries)('%s.png is byte-identical to a fresh encode', async (name, frame) => {
    const committed = await readFile(pathFor(name));
    expect(
      encodeSingle(frame).equals(committed),
      `${name}.png differs from tools/art/authoring/floor3-roster.mjs — run \`npm run art:floor3\``,
    ).toBe(true);
  });

  it.each(entries)('%s stays on the floor-3-wald palette', (_name, frame) => {
    expect(() => {
      assertOnPalette(ROSTER_BUCKET, [frame]);
    }).not.toThrow();
  });

  it.each(entries)('%s decodes on-palette and to its authored canvas', async (name, frame) => {
    const { width, height, pixels } = decodePng(await readFile(pathFor(name)));
    expect([width, height]).toEqual([frame.width, frame.height]);
    expect(validateSpriteSize('character', width, height)).toBeNull();
    expect(
      findOffPalettePixel(pixels, width, height, LEGAL),
      `${name} has an off-palette pixel`,
    ).toBeNull();
  });
});
