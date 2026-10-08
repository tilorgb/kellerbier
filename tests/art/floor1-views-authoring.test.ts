import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  BASE_CANVAS,
  BOSS_DIR,
  BOSS_SIDECARS,
  BOSS_STRIPS,
  CHARACTER_DIR,
  CHARACTER_SIDECARS,
  CHARACTER_STRIPS,
  VIEW_ANIM,
  assertOnPalette,
  encodeSidecar,
  encodeViewStrip,
} from '../../tools/art/authoring/floor1-views.mjs';
import { validateSpriteSize } from '../../tools/art/validate.mjs';

/**
 * The Floor 1 creatures' per-heading strips are what
 * `tools/art/authoring/floor1-views.mjs` produces, byte for byte, and every
 * creature's three views share the canvas of its existing art (#438, epic #457).
 */

const groups = [
  {
    dir: CHARACTER_DIR,
    strips: CHARACTER_STRIPS,
    sidecars: CHARACTER_SIDECARS,
    category: 'character',
  },
  { dir: BOSS_DIR, strips: BOSS_STRIPS, sidecars: BOSS_SIDECARS, category: 'boss' },
];
const all = groups.flatMap(({ dir, strips, sidecars, category }) =>
  Object.entries(strips).map(([name, frames]) => ({ name, dir, frames, sidecars, category })),
);

describe("the Floor 1 creatures' view strips are what the authoring source produces", () => {
  it('has a side, a south and a north strip for every creature', () => {
    for (const id of Object.keys(BASE_CANVAS)) {
      for (const view of ['side', 'south', 'north']) {
        expect(
          all.map((a) => a.name),
          `${id}-${view}`,
        ).toContain(`${id}-${view}`);
      }
    }
    expect(all.length).toBe(Object.keys(BASE_CANVAS).length * 3);
  });

  it.each(all)('$name.strip.png and its sidecar match a fresh encode', async (strip) => {
    const committed = await readFile(`${strip.dir}${strip.name}.strip.png`);
    expect(
      encodeViewStrip(strip.frames).equals(committed),
      `${strip.name}.strip.png differs from tools/art/authoring/floor1-views.mjs — run \`node tools/art/authoring/build-floor1-views.mjs\``,
    ).toBe(true);
    const anim = strip.sidecars[strip.name] ?? VIEW_ANIM;
    expect(anim.frames).toBe(strip.frames.length);
    const text = await readFile(`${strip.dir}${strip.name}.anim.json`, 'utf8');
    expect(text).toBe(await encodeSidecar(anim));
    expect(JSON.parse(text)).toEqual(anim);
  });

  it.each(all)('$name is a legal sprite size on one canvas', ({ name, frames, category }) => {
    const [first] = frames;
    if (first === undefined) throw new Error('empty strip');
    const { width, height } = first;
    expect(validateSpriteSize(category, width * frames.length, height, frames.length)).toBeNull();
    for (const f of frames) expect([f.width, f.height], f.name).toEqual([width, height]);
    const id = Object.keys(BASE_CANVAS).find((k) => name.startsWith(`${k}-`));
    expect([width, height]).toEqual(BASE_CANVAS[id ?? '']);
  });

  it("the boss' three views keep the base strip's twelve frames and its clips", async () => {
    const base: unknown = JSON.parse(
      await readFile(`${BOSS_DIR}grosse-kellerassel.anim.json`, 'utf8'),
    );
    for (const name of Object.keys(BOSS_STRIPS)) {
      expect(BOSS_STRIPS[name]).toHaveLength(12);
      expect(BOSS_SIDECARS[name]).toEqual(base);
    }
  });

  it('is on the floor 1 palette', () => {
    expect(() => {
      assertOnPalette();
    }).not.toThrow();
  });
});
