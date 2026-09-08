import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MINIBOSSES,
  assertOnPalette,
  encodeSingle,
} from '../../tools/art/authoring/floor2-minibosses.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';
import { HUMAN_FACE as ROSTER_FACE } from '../../tools/art/authoring/floor2-roster.mjs';
import { HUMAN_FACE as MINIBOSS_FACE } from '../../tools/art/authoring/floor2-minibosses.mjs';

/**
 * The same guard `floor1-minibosses-authoring.test.ts` puts on floor 1's pair,
 * for the four bodies #277 added: the committed PNG *is* what
 * `tools/art/authoring/floor2-minibosses.mjs` produces, byte for byte, so
 * editing the source without `npm run art:minibosses2` fails a pull request.
 *
 * The silhouette-vs-collider check lives in `tests/content/sprite-scale.test.ts`,
 * which reads the real sprite tree — not duplicated here.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const entries = Object.entries(MINIBOSSES);
const LEGAL = legalPixelColorsFor('floor-2-rural');

function pathFor(name: string): string {
  return `${SPRITES}floor-2-rural/characters/${name}.png`;
}

describe("floor 2's mini-boss art is what the authoring source produces", () => {
  it('covers exactly the four mini-boss ids', () => {
    expect(Object.keys(MINIBOSSES).sort()).toEqual([
      'der-ladewagen',
      'die-blaskapelle-posaune',
      'die-blaskapelle-trompete',
      'die-blaskapelle-tuba',
    ]);
  });

  it.each(entries)('%s.png is byte-identical to a fresh encode', async (name, frame) => {
    const committed = await readFile(pathFor(name));
    expect(
      encodeSingle(frame).equals(committed),
      `${name}.png differs from tools/art/authoring/floor2-minibosses.mjs — run \`npm run art:minibosses2\``,
    ).toBe(true);
  });

  it.each(entries)('%s stays on the floor-2-rural palette', (_name, frame) => {
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

  it("the three bandsmen carry the roster's own face, pixel for pixel", () => {
    // `floor2-roster.mjs`'s `HUMAN_FACE` rule (#55 / issue #192), extended to
    // the mini-boss that stands three of them in one room with the roster:
    // "same eye" is what "same game" reduces to at this size.
    expect(MINIBOSS_FACE).toEqual(ROSTER_FACE);
  });
});
