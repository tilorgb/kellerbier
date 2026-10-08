import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertOnPalette,
  buckets,
  canvases,
  encodeSidecar,
  encodeViewStrip,
  folders,
  sidecars,
  strips,
} from '../../tools/art/authoring/floor2-side-views.mjs';
import { validateSpriteSize } from '../../tools/art/validate.mjs';

/**
 * Floor 2's side-on creatures' side / south / north strips are what
 * `tools/art/authoring/floor2-side-views.mjs` produces, byte for byte.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const entries = Object.entries(strips);

describe('Floor 2 side-on creatures: committed views match the authoring source', () => {
  it('has side, south and north for each of the five creatures', () => {
    expect(Object.keys(strips).sort()).toEqual(
      Object.keys(canvases)
        .flatMap((id) => ['north', 'side', 'south'].map((v) => `${id}-${v}`))
        .sort(),
    );
  });

  it.each(entries)('%s.strip.png and its sidecar match a fresh encode', async (name, frames) => {
    const dir = `${SPRITES}${folders[name] ?? ''}`;
    const committed = await readFile(`${dir}${name}.strip.png`);
    expect(
      encodeViewStrip(frames).equals(committed),
      `${name}.strip.png differs from the authoring source — run \`node tools/art/authoring/build-floor2-side-views.mjs\``,
    ).toBe(true);
    const sidecar = sidecars[name];
    if (sidecar === undefined) throw new Error(`no sidecar for ${name}`);
    expect(await readFile(`${dir}${name}.anim.json`, 'utf8')).toBe(await encodeSidecar(sidecar));
    expect(frames.length).toBe(sidecar.frames);
  });

  it('is on the floor-2-rural palette', () => {
    expect(() => {
      assertOnPalette();
    }).not.toThrow();
    for (const bucket of Object.values(buckets)) expect(bucket).toBe('floor-2-rural');
  });

  it('keeps the boss clips identical across his three views', async () => {
    const base: unknown = JSON.parse(
      await readFile(`${SPRITES}floor-2-rural/bosses/der-stier.anim.json`, 'utf8'),
    );
    for (const v of ['side', 'south', 'north']) {
      expect(sidecars[`der-stier-${v}`]).toEqual(base);
    }
  });

  it.each(Object.entries(canvases))(
    "%s's three views share the canvas of its base art",
    (id, [w, h]) => {
      const kind = id === 'der-stier' ? 'boss' : 'character';
      expect(validateSpriteSize(kind, w, h)).toBeNull();
      for (const v of ['side', 'south', 'north']) {
        for (const f of strips[`${id}-${v}`] ?? []) {
          expect([f.width, f.height]).toEqual([w, h]);
        }
      }
    },
  );
});
