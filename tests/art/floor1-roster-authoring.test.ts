import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ROSTER,
  ROSTER_BUCKET,
  KELLERASSEL_FRAMES,
  assertOnPalette,
  encodeSingle,
  encodeStrip,
} from '../../tools/art/authoring/floor1-roster.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';

/**
 * The same guard `alois-authoring.test.ts` / `boss-authoring.test.ts` /
 * `floor2-roster-authoring.test.ts` put on their composed art, for Der
 * Keller's roster (#191). The silhouette-vs-collider check lives in
 * `tests/content/sprite-scale.test.ts`, which also owns `kellerassel-segment`
 * leaving `PENDING_REDRAW`.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const CHARS = `${SPRITES}floor-1-cellar/characters/`;
const entries = Object.entries(ROSTER);
const LEGAL = legalPixelColorsFor('floor-1-cellar');

describe("the chibi Der Keller roster's committed art is what the authoring source produces", () => {
  it('covers the seven single-frame sprites the redraw touched', () => {
    expect(Object.keys(ROSTER).sort()).toEqual([
      'bierratte',
      'fasssplitter',
      'kellerassel-segment',
      'rollfass',
      'schimmelfleck',
      'schimmelspore',
      'zapfhahn',
    ]);
  });

  it.each(entries)('%s.png is byte-identical to a fresh encode', async (name, frame) => {
    const committed = await readFile(`${CHARS}${name}.png`);
    expect(
      encodeSingle(frame).equals(committed),
      `${name}.png differs from tools/art/authoring/floor1-roster.mjs — run \`npm run art:floor1\``,
    ).toBe(true);
  });

  it.each(entries)(
    '%s decodes on-palette, on its floor, at its authored canvas',
    async (name, frame) => {
      const { width, height, pixels } = decodePng(await readFile(`${CHARS}${name}.png`));
      expect([width, height]).toEqual([frame.width, frame.height]);
      expect(validateSpriteSize('character', width, height)).toBeNull();
      expect(() => {
        assertOnPalette(ROSTER_BUCKET, [frame]);
      }).not.toThrow();
      expect(
        findOffPalettePixel(pixels, width, height, LEGAL),
        `${name} has an off-palette pixel`,
      ).toBeNull();
    },
  );

  describe('the Kellerassel', () => {
    it('is still seven frames, matching its untouched .anim.json', async () => {
      expect(KELLERASSEL_FRAMES).toHaveLength(7);
      const sidecar = JSON.parse(await readFile(`${CHARS}kellerassel.anim.json`, 'utf8')) as {
        frames: number;
        clips: Record<string, unknown>;
      };
      expect(sidecar.frames).toBe(7);
      expect(Object.keys(sidecar.clips).sort()).toEqual(['death', 'hurt', 'idle', 'move']);
    });

    it('strip.png is byte-identical to a fresh encode', async () => {
      const committed = await readFile(`${CHARS}kellerassel.strip.png`);
      expect(
        encodeStrip('kellerassel', KELLERASSEL_FRAMES).equals(committed),
        'kellerassel.strip.png differs from tools/art/authoring/floor1-roster.mjs — run `npm run art:floor1`',
      ).toBe(true);
    });

    it('decodes to a 7-frame strip within the character spec', async () => {
      const { width, height, pixels } = decodePng(await readFile(`${CHARS}kellerassel.strip.png`));
      expect(width % 7).toBe(0);
      expect(validateSpriteSize('character', width, height, 7)).toBeNull();
      expect(findOffPalettePixel(pixels, width, height, LEGAL)).toBeNull();
    });
  });
});
