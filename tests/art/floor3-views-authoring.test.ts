import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  BASE_CANVAS,
  CHARACTER_DIR,
  SIDECARS,
  SINGLES,
  STRIPS,
  assertOnPalette,
  encodeSidecar,
  encodeViewStrip,
} from '../../tools/art/authoring/floor3-views.mjs';
import { validateSpriteSize } from '../../tools/art/validate.mjs';

/**
 * The Floor 3 animals' toward-the-camera and away views (#448-#450, epic
 * #457) are what `tools/art/authoring/floor3-views.mjs` produces, byte for
 * byte, on the canvas of the art they sit beside.
 */

const strips = Object.entries(STRIPS);
const singles = Object.entries(SINGLES);

function canvasOf(name: string): readonly [number, number] {
  const id = Object.keys(BASE_CANVAS).find((key) => name.startsWith(`${key}-`));
  const canvas = id === undefined ? undefined : BASE_CANVAS[id];
  if (canvas === undefined) throw new Error(`no base canvas for ${name}`);
  return canvas;
}

describe("the Floor 3 animals' view art is what the authoring source produces", () => {
  it('has a south and a north view for each of the three', () => {
    expect(Object.keys(STRIPS).sort()).toEqual([
      'boar-north',
      'boar-south',
      'kaninchen-north',
      'kaninchen-south',
    ]);
    expect(Object.keys(SINGLES).sort()).toEqual([
      'bachforelle-shadow-north',
      'bachforelle-shadow-south',
    ]);
  });

  it.each(strips)('%s.strip.png and its sidecar match a fresh encode', async (name, frames) => {
    const committed = await readFile(`${CHARACTER_DIR}${name}.strip.png`);
    expect(
      encodeViewStrip(frames).equals(committed),
      `${name}.strip.png differs from tools/art/authoring/floor3-views.mjs — run \`npm run art:floor3-views\``,
    ).toBe(true);
    const anim = SIDECARS[name];
    if (anim === undefined) throw new Error(`no sidecar for ${name}`);
    expect(anim.frames).toBe(frames.length);
    expect(await readFile(`${CHARACTER_DIR}${name}.anim.json`, 'utf8')).toBe(
      await encodeSidecar(anim),
    );
  });

  it.each(singles)('%s.png matches a fresh encode', async (name, frame) => {
    const committed = await readFile(`${CHARACTER_DIR}${name}.png`);
    expect(
      encodeViewStrip([frame]).equals(committed),
      `${name}.png differs from tools/art/authoring/floor3-views.mjs — run \`npm run art:floor3-views\``,
    ).toBe(true);
  });

  it("keeps the base strips' clips verbatim", async () => {
    for (const id of ['boar', 'kaninchen']) {
      const base: unknown = JSON.parse(await readFile(`${CHARACTER_DIR}${id}.anim.json`, 'utf8'));
      expect(SIDECARS[`${id}-south`]).toEqual(base);
      expect(SIDECARS[`${id}-north`]).toEqual(base);
    }
  });

  it.each([...strips, ...singles.map(([n, f]) => [n, [f]] as const)])(
    "%s is a legal sprite size on its creature's canvas",
    (name, frames) => {
      const [width, height] = canvasOf(name);
      expect(
        validateSpriteSize('character', width * frames.length, height, frames.length),
      ).toBeNull();
      for (const f of frames) expect([f.width, f.height], f.name).toEqual([width, height]);
    },
  );

  it('is on the floor-3-wald palette', () => {
    expect(() => {
      assertOnPalette();
    }).not.toThrow();
  });
});
