import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  encodeStrip,
  encodeSingle,
  assertOnPalette,
  STRIPS,
  SINGLES,
  BOSS_BUCKETS,
} from '../../tools/art/authoring/bosses.mjs';
import { decodePng } from '../../tools/art/png.mjs';

/**
 * The same guard `alois-authoring.test.ts` puts on Alois, for the two chibi
 * bosses that joined him under `docs/DECISIONS.md` #55/#56: the committed PNG
 * *is* what `tools/art/authoring/bosses.mjs` produces, byte for byte, so the
 * source cannot silently drift from the art the game loads. Editing a block
 * and running `npm run art:bosses` is what lands a change; a hand edit in the
 * pixel editor gets reverted the next build with nothing to notice.
 */

const SPRITES = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));

function bucketOf(name: string): string {
  const bucket = BOSS_BUCKETS[name];
  if (bucket === undefined) {
    throw new Error(`no bucket registered for boss sprite "${name}"`);
  }
  return bucket;
}

function pathFor(name: string, ext: string): string {
  return `${SPRITES}${bucketOf(name)}/bosses/${name}${ext}`;
}

const strips = Object.entries(STRIPS);
const singles = Object.entries(SINGLES);

describe("the chibi bosses' committed art is what the authoring source produces", () => {
  it.each(strips)('%s: seven frames, matching its .anim.json', async (name, frames) => {
    expect(frames).toHaveLength(7);
    const sidecar = JSON.parse(await readFile(pathFor(name, '.anim.json'), 'utf8')) as {
      frames: number;
    };
    expect(sidecar.frames).toBe(frames.length);
  });

  it.each(strips)('%s.strip.png is byte-identical to a fresh encode', async (name, frames) => {
    const committed = await readFile(pathFor(name, '.strip.png'));
    expect(
      encodeStrip(name, frames).equals(committed),
      `${name}.strip.png differs from tools/art/authoring/bosses.mjs — run \`npm run art:bosses\``,
    ).toBe(true);
  });

  it.each(singles)('%s.png is byte-identical to a fresh encode', async (name, frame) => {
    const committed = await readFile(pathFor(name, '.png'));
    expect(
      encodeSingle(frame).equals(committed),
      `${name}.png differs from tools/art/authoring/bosses.mjs — run \`npm run art:bosses\``,
    ).toBe(true);
  });

  it.each([...strips, ...singles.map(([n, f]) => [n, [f]] as const)])(
    '%s stays on its floor palette',
    (name, frames) => {
      expect(() => {
        assertOnPalette(bucketOf(name), frames);
      }).not.toThrow();
    },
  );

  it.each(strips)('%s decodes to the canvas its frames were authored at', async (name, frames) => {
    const first = frames[0];
    expect(first).toBeDefined();
    const { width, height } = decodePng(await readFile(pathFor(name, '.strip.png')));
    expect(height).toBe(first?.height);
    expect(width).toBe((first?.width ?? 0) * frames.length);
  });

  it('the Maibaum-Dieb is no longer authored as a character', async () => {
    await expect(
      readFile(`${SPRITES}floor-2-rural/characters/der-stier-maibaum-dieb.png`),
    ).rejects.toThrow();
  });
});
