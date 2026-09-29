import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PICKUP_DEFINITIONS } from '../../src/content/pickups/index.js';
import {
  CHEST_ART,
  HEIGHT,
  WIDTH,
  assertOnPalette,
  chestFrame,
  encodeSingle,
} from '../../tools/art/authoring/chests.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';

/**
 * The same guard `items-authoring.test.ts` puts on item icons, for the Chest
 * and Locked Chest art (#353, `tools/art/authoring/chests.mjs`): every
 * committed chest PNG is byte-identical to a fresh encode, on-palette, on the
 * signed-off 24×18 canvas, and names a real pickup.
 */

const CHARS = fileURLToPath(new URL('../../assets/sprites/common/characters/', import.meta.url));
const LEGAL = legalPixelColorsFor('common');
const PICKUP_IDS = new Set(PICKUP_DEFINITIONS.map((pickup) => pickup.id));
const authoredIds = Object.keys(CHEST_ART);

describe('chest art — authored from source', () => {
  it('every authored chest names a real pickup, and every chest pickup is authored', () => {
    for (const id of authoredIds) {
      expect(PICKUP_IDS.has(id), `chests.mjs draws "${id}", which is not a pickup`).toBe(true);
    }
    const chestPickups = PICKUP_DEFINITIONS.filter(
      (pickup) => pickup.effect.kind === 'chest' || pickup.effect.kind === 'opened-chest',
    ).map((pickup) => pickup.id);
    expect(chestPickups.sort()).toEqual([...authoredIds].sort());
  });

  it.each(authoredIds)('%s is byte-identical to a fresh encode, on-palette, 24x18', async (id) => {
    const frame = chestFrame(id);
    expect(frame.width).toBe(WIDTH);
    expect(frame.height).toBe(HEIGHT);
    expect(WIDTH).toBe(24);
    expect(HEIGHT).toBe(18);
    expect(() => {
      assertOnPalette('common', [frame]);
    }).not.toThrow();
    const committed = await readFile(`${CHARS}pickup-${id}.png`);
    expect(
      encodeSingle(frame).equals(committed),
      `pickup-${id}.png differs from tools/art/authoring/chests.mjs — run \`npm run art:chests\``,
    ).toBe(true);
    const { width, height, pixels } = decodePng(committed);
    expect(validateSpriteSize('character', width, height)).toBeNull();
    expect(findOffPalettePixel(pixels, width, height, LEGAL)).toBeNull();
  });
});
