import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ROSTER,
  ROSTER_BUCKET,
  STRIPS,
  assertOnPalette,
  encodeSingle,
  encodeStrip,
} from '../../tools/art/authoring/floor3-roster.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';

/**
 * `floor2-roster-authoring.test.ts`'s guard, for Der Wald's roster: the
 * committed PNG *is* what `tools/art/authoring/floor3-roster.mjs` produces,
 * byte for byte, so editing the source without `npm run art:floor3` fails a
 * pull request rather than shipping art nobody looked at. Grows by one entry
 * per Floor 3 creature as each is signed off (#405-#411). The Boar and the
 * Kaninchen are strips (a trot, a hop) whose first frame is the signed-off
 * sprite, unchanged.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const entries = Object.entries(ROSTER);
const strips = Object.entries(STRIPS);
const LEGAL = legalPixelColorsFor('floor-3-wald');

function pathFor(name: string, suffix = '.png'): string {
  return `${SPRITES}floor-3-wald/characters/${name}${suffix}`;
}

describe("Der Wald roster's committed art is what the authoring source produces", () => {
  it('covers the signed-off creatures so far', () => {
    expect([...Object.keys(ROSTER), ...Object.keys(STRIPS)].sort()).toEqual([
      'bachforelle',
      'bachforelle-shadow',
      'boar',
      'borkenkaefer',
      'fliegenpilz',
      'kaninchen',
      'specht',
      'specht-landed',
      // Placeholders until the boss art is signed off (#412, #413).
      'waldradl',
      'waldradler',
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

  it.each(strips)('%s.strip.png and its sidecar match a fresh encode', async (name, strip) => {
    const committed = await readFile(pathFor(name, '.strip.png'));
    expect(
      encodeStrip(name, strip.frames).equals(committed),
      `${name}.strip.png differs from tools/art/authoring/floor3-roster.mjs — run \`npm run art:floor3\``,
    ).toBe(true);
    const sidecar: unknown = JSON.parse(await readFile(pathFor(name, '.anim.json'), 'utf8'));
    expect(sidecar).toEqual(strip.anim);
    expect(strip.anim.frames).toBe(strip.frames.length);
  });

  it.each(strips)('%s strip stays on-palette, every frame its canvas', (_name, strip) => {
    expect(() => {
      assertOnPalette(ROSTER_BUCKET, strip.frames);
    }).not.toThrow();
    const first = strip.frames[0];
    for (const frame of strip.frames) {
      expect([frame.width, frame.height]).toEqual([first?.width, first?.height]);
      expect(validateSpriteSize('character', frame.width, frame.height)).toBeNull();
    }
  });

  it('only re-poses the legs: every strip frame matches frame 0 above the feet', () => {
    // The body is the signed-off sprite; animation must not quietly redraw it.
    const legRows = { boar: 26, kaninchen: 14 } as const;
    for (const [name, strip] of strips) {
      const from = legRows[name as keyof typeof legRows];
      const [base, ...rest] = strip.frames;
      for (const frame of rest) {
        expect(frame.px.slice(0, from)).toEqual(base?.px.slice(0, from));
      }
    }
  });
});
