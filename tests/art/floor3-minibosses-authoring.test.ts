import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MINIBOSSES,
  MINIBOSS_BUCKET,
  STRIPS,
  assertOnPalette,
  encodeSingle,
  encodeStrip,
} from '../../tools/art/authoring/floor3-minibosses.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';

/**
 * `floor3-roster-authoring.test.ts`'s guard, for Der Wald's mini-boss (#467):
 * the committed PNGs *are* what `tools/art/authoring/floor3-minibosses.mjs`
 * produces, byte for byte, so editing the source without
 * `npm run art:minibosses3` fails a pull request.
 *
 * The silhouette-vs-collider check lives in `tests/content/sprite-scale.test.ts`,
 * which reads the real sprite tree — not duplicated here.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const singles = Object.entries(MINIBOSSES);
const strips = Object.entries(STRIPS);
const LEGAL = legalPixelColorsFor(MINIBOSS_BUCKET);

function pathFor(name: string, suffix = '.png'): string {
  return `${SPRITES}floor-3-wald/characters/${name}${suffix}`;
}

describe("floor 3's mini-boss art is what the authoring source produces", () => {
  it('covers Bieber and his log, rolling each way', () => {
    expect([...Object.keys(MINIBOSSES), ...Object.keys(STRIPS)].sort()).toEqual([
      'bieber',
      'bieber-log-east',
      'bieber-log-west',
    ]);
  });

  it.each(singles)('%s.png is byte-identical to a fresh encode', async (name, frame) => {
    const committed = await readFile(pathFor(name));
    expect(encodeSingle(frame).equals(committed)).toBe(true);
  });

  it.each(strips)('%s.strip.png and its sidecar match a fresh encode', async (name, strip) => {
    const committed = await readFile(pathFor(name, '.strip.png'));
    expect(
      encodeStrip(name, strip.frames).equals(committed),
      `${name}.strip.png differs from tools/art/authoring/floor3-minibosses.mjs — run \`npm run art:minibosses3\``,
    ).toBe(true);
    const sidecar: unknown = JSON.parse(await readFile(pathFor(name, '.anim.json'), 'utf8'));
    expect(sidecar).toEqual(strip.anim);
    expect((strip.anim as { frames: number }).frames).toBe(strip.frames.length);
  });

  it.each(strips)('%s strip stays on-palette, every frame its canvas', (_name, strip) => {
    expect(() => {
      assertOnPalette(strip.frames);
    }).not.toThrow();
    const first = strip.frames[0];
    for (const frame of strip.frames) {
      expect([frame.width, frame.height]).toEqual([first?.width, first?.height]);
      expect(validateSpriteSize('character', frame.width, frame.height)).toBeNull();
    }
  });

  it.each(strips)('%s decodes on-palette from the committed strip', async (name, strip) => {
    const { width, height, pixels } = decodePng(await readFile(pathFor(name, '.strip.png')));
    expect(height).toBe(strip.frames[0]?.height);
    expect(width).toBe((strip.frames[0]?.width ?? 0) * strip.frames.length);
    expect(
      findOffPalettePixel(pixels, width, height, LEGAL),
      `${name} has an off-palette pixel`,
    ).toBeNull();
  });
});
