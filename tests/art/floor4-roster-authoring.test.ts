import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PROJECTILES,
  ROSTER,
  ROSTER_BUCKET,
  STRIPS,
  assertOnPalette,
  encodeSingle,
  encodeStrip,
} from '../../tools/art/authoring/floor4-roster.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';

/**
 * `floor3-roster-authoring.test.ts`'s guard, for Die Alpen's roster (#40): the
 * committed PNG *is* what `tools/art/authoring/floor4-roster.mjs` produces,
 * byte for byte, so editing the source without `npm run art:floor4` fails a
 * pull request rather than shipping art nobody looked at. Every walker ships
 * its three heading views; the Murmeltier ships the mound it travels as.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const entries = Object.entries(ROSTER);
const projectiles = Object.entries(PROJECTILES);
const strips = Object.entries(STRIPS);
const LEGAL = legalPixelColorsFor(ROSTER_BUCKET);

function pathFor(name: string, suffix = '.png'): string {
  return `${SPRITES}${ROSTER_BUCKET}/characters/${name}${suffix}`;
}

describe("Die Alpen roster's committed art is what the authoring source produces", () => {
  it('covers every creature, its views, the mound and the projectiles', () => {
    expect([...Object.keys(ROSTER), ...Object.keys(STRIPS)].sort()).toEqual([
      'mountain-hare',
      'mountain-hare-north',
      'mountain-hare-side',
      'mountain-hare-south',
      'murmeltier',
      'murmeltier-shadow',
      'rescue-dog',
      'rescue-dog-north',
      'rescue-dog-side',
      'rescue-dog-south',
      'skier',
      'skier-north',
      'skier-side',
      'skier-south',
      'snow-cannon',
      'summit-cross',
      'the-gondola',
      'tourist',
    ]);
    expect(Object.keys(PROJECTILES).sort()).toEqual(['arrow', 'flint', 'snow-clod']);
  });

  it.each(entries)('%s.png is byte-identical to a fresh encode', async (name, frame) => {
    const committed = await readFile(pathFor(name));
    expect(
      encodeSingle(frame).equals(committed),
      `${name}.png differs from tools/art/authoring/floor4-roster.mjs — run \`npm run art:floor4\``,
    ).toBe(true);
  });

  it.each(projectiles)(
    'projectiles/%s.png is byte-identical to a fresh encode',
    async (name, frame) => {
      const committed = await readFile(`${SPRITES}${ROSTER_BUCKET}/projectiles/${name}.png`);
      expect(
        encodeSingle(frame).equals(committed),
        `${name}.png — run \`npm run art:floor4\``,
      ).toBe(true);
      expect(validateSpriteSize('projectile', frame.width, frame.height)).toBeNull();
    },
  );

  it.each([...entries, ...projectiles])('%s stays on the floor-4-alpen palette', (_name, frame) => {
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
      `${name}.strip.png differs from tools/art/authoring/floor4-roster.mjs — run \`npm run art:floor4\``,
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
});
