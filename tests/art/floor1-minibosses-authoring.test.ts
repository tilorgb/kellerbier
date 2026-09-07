import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MINIBOSSES,
  assertOnPalette,
  encodeSingle,
} from '../../tools/art/authoring/floor1-minibosses.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';

/**
 * The same guard `floor1-roster-authoring.test.ts` puts on the roster, for the
 * two mini-bosses #276 added: the committed PNG *is* what
 * `tools/art/authoring/floor1-minibosses.mjs` produces, byte for byte, so
 * editing the source without `npm run art:minibosses` fails a pull request.
 *
 * The silhouette-vs-collider check lives in `tests/content/sprite-scale.test.ts`,
 * which reads the real sprite tree — not duplicated here.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const entries = Object.entries(MINIBOSSES);
const LEGAL = legalPixelColorsFor('floor-1-cellar');

function pathFor(name: string): string {
  return `${SPRITES}floor-1-cellar/characters/${name}.png`;
}

describe("the mini-bosses' committed art is what the authoring source produces", () => {
  it('covers exactly the two mini-boss ids', () => {
    expect(Object.keys(MINIBOSSES).sort()).toEqual(['der-rattenkoenig', 'die-zapfhahn-orgel']);
  });

  it.each(entries)('%s.png is byte-identical to a fresh encode', async (name, frame) => {
    const committed = await readFile(pathFor(name));
    expect(
      encodeSingle(frame).equals(committed),
      `${name}.png differs from tools/art/authoring/floor1-minibosses.mjs — run \`npm run art:minibosses\``,
    ).toBe(true);
  });

  it.each(entries)('%s stays on the floor-1-cellar palette', (_name, frame) => {
    expect(() => {
      assertOnPalette([frame]);
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
