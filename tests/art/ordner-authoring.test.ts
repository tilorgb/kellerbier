import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ORDNER_ANIM,
  ORDNER_HEIGHT,
  ORDNER_STRIPS,
  ORDNER_WIDTH,
  assertOnPalette,
  encodeOrdnerStrip,
} from '../../tools/art/authoring/ordner.mjs';
import { validateSpriteSize } from '../../tools/art/validate.mjs';

/**
 * Der Ordner's familiar strips are what `tools/art/authoring/ordner.mjs`
 * produces, byte for byte — the same guard the floor rosters have — in all
 * three directions Alois himself has.
 */

const DIR = fileURLToPath(new URL('../../assets/sprites/common/characters/', import.meta.url));
const strips = Object.entries(ORDNER_STRIPS);

describe("Der Ordner's committed art is what the authoring source produces", () => {
  it('has a side, a south and a north strip, like Alois', () => {
    expect(Object.keys(ORDNER_STRIPS).sort()).toEqual([
      'der-ordner-north',
      'der-ordner-side',
      'der-ordner-south',
    ]);
  });

  it.each(strips)('%s.strip.png and its sidecar match a fresh encode', async (name, frames) => {
    const committed = await readFile(`${DIR}${name}.strip.png`);
    expect(
      encodeOrdnerStrip(frames).equals(committed),
      `${name}.strip.png differs from tools/art/authoring/ordner.mjs — run \`npm run art:ordner\``,
    ).toBe(true);
    const sidecar: unknown = JSON.parse(await readFile(`${DIR}${name}.anim.json`, 'utf8'));
    expect(sidecar).toEqual(ORDNER_ANIM);
    expect(frames.length).toBe(ORDNER_ANIM.frames);
  });

  it('is on the common palette and a legal character canvas', () => {
    expect(() => {
      assertOnPalette();
    }).not.toThrow();
    expect(validateSpriteSize('character', ORDNER_WIDTH, ORDNER_HEIGHT)).toBeNull();
  });
});
