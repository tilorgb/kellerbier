import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertOnPalette,
  bases,
  encodeViewStrip,
  sidecars,
  strips,
} from '../../tools/art/authoring/floor2-human-views.mjs';
import { validateSpriteSize } from '../../tools/art/validate.mjs';

/**
 * The side / south / north strips of Floor 2's front-on creatures are what
 * `tools/art/authoring/floor2-human-views.mjs` produces, byte for byte, and
 * every view keeps the canvas of the creature's front art.
 */

const DIR = fileURLToPath(
  new URL('../../assets/sprites/floor-2-rural/characters/', import.meta.url),
);
const entries = Object.entries(strips);
const sizes = bases;

describe("Floor 2's per-heading creature views match the authoring source", () => {
  it('has side, south and north for each of the seven creatures', () => {
    expect(Object.keys(sizes)).toHaveLength(7);
    for (const id of Object.keys(sizes)) {
      for (const dir of ['side', 'south', 'north']) {
        expect(Object.keys(strips)).toContain(`${id}-${dir}`);
      }
    }
  });

  it.each(entries)('%s.strip.png and its sidecar match a fresh encode', async (name, frames) => {
    const committed = await readFile(`${DIR}${name}.strip.png`);
    expect(
      encodeViewStrip(frames).equals(committed),
      `${name}.strip.png differs from tools/art/authoring/floor2-human-views.mjs — run build-floor2-human-views.mjs`,
    ).toBe(true);
    const sidecar: unknown = JSON.parse(await readFile(`${DIR}${name}.anim.json`, 'utf8'));
    expect(sidecar).toEqual(sidecars[name]);
    expect(frames.length).toBe(sidecars[name].frames);
  });

  it('is on the floor-2-rural palette', () => {
    expect(() => {
      assertOnPalette();
    }).not.toThrow();
  });

  it.each(Object.entries(sizes))(
    '%s: three strips on one canvas, equal to its front art',
    (id, size) => {
      expect(validateSpriteSize('character', size.width, size.height)).toBeNull();
      for (const dir of ['side', 'south', 'north']) {
        for (const f of strips[`${id}-${dir}`]) {
          expect([f.width, f.height]).toEqual([size.width, size.height]);
        }
      }
    },
  );
});
