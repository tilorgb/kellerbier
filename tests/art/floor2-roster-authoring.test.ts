import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ROSTER,
  ROSTER_BUCKET,
  HUMAN_FACE,
  assertOnPalette,
  encodeSingle,
} from '../../tools/art/authoring/floor2-roster.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateSpriteSize, findOffPalettePixel } from '../../tools/art/validate.mjs';
import { legalPixelColorsFor } from '../../tools/art/palette.mjs';

/**
 * The same guard `alois-authoring.test.ts` / `boss-authoring.test.ts` put on
 * their composed art, for the Floor 2 roster that #192 redrew to the chibi
 * direction: the committed PNG *is* what `tools/art/authoring/floor2-roster.mjs`
 * produces, byte for byte, so editing the source without `npm run art:floor2`
 * fails a pull request rather than shipping art nobody looked at.
 *
 * The silhouette-vs-collider check lives in `tests/content/sprite-scale.test.ts`,
 * which reads the real sprite tree — it is not duplicated here.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));
const entries = Object.entries(ROSTER);
const LEGAL = legalPixelColorsFor('floor-2-rural');

function pathFor(name: string): string {
  return `${SPRITES}floor-2-rural/characters/${name}.png`;
}

describe("the chibi Dorf & Acker roster's committed art is what the authoring source produces", () => {
  it('covers exactly the seven characters/ sprites, and no boss', () => {
    expect(Object.keys(ROSTER).sort()).toEqual([
      'bauer',
      'blaskapellist',
      'boellerschmeisser',
      'gartenzwerg',
      'gockel',
      'kuh',
      'traktor',
    ]);
  });

  it.each(entries)('%s.png is byte-identical to a fresh encode', async (name, frame) => {
    const committed = await readFile(pathFor(name));
    expect(
      encodeSingle(frame).equals(committed),
      `${name}.png differs from tools/art/authoring/floor2-roster.mjs — run \`npm run art:floor2\``,
    ).toBe(true);
  });

  it.each(entries)('%s stays on the floor-2-rural palette', (_name, frame) => {
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

  /**
   * #192's decided call: the human roster carries Alois's own eye at his own
   * head ratio, so a Bauer reads as his brother rather than as an adult he is
   * a child beside. `HUMAN_FACE`'s three eye rows must appear verbatim in each
   * full-bodied human — the gnome (a face peeking over a beard) and the
   * animals are exempt by design. Read off the authored grid (`frame.px`); the
   * byte-identity test above already ties that to the committed PNG.
   */
  const KEY = new Map<number | null, string>([
    [null, '.'],
    [0x000000, 'K'],
    [0xffffff, 'W'],
    [0x233c69, 'e'],
    [0xcabc92, 'S'],
  ]);
  // Lash line, upper eye, lower eye — trimmed of the outer face column an
  // instrument or arm can clip. Still an unambiguous fingerprint.
  const eyeRows = HUMAN_FACE.slice(2, 5).map((row) => row.slice(1, -1));

  it.each(['bauer', 'blaskapellist', 'boellerschmeisser'])(
    '%s embeds the shared chibi eye block',
    (name) => {
      const frame = ROSTER[name];
      expect(frame).toBeDefined();
      if (frame === undefined) return;
      const grid = frame.px.map((row) => row.map((c) => KEY.get(c) ?? '?').join(''));
      const found = grid.some((_row, y) =>
        eyeRows.every((pattern, k) => (grid[y + k] ?? '').includes(pattern)),
      );
      expect(found, `${name} does not contain HUMAN_FACE's eye rows`).toBe(true);
    },
  );

  it('the animated boss body it does not touch is still where #199 put it', async () => {
    await expect(
      readFile(`${SPRITES}floor-2-rural/bosses/der-stier-maibaum-dieb.strip.png`),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
