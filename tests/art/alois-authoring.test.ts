import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { encodeStrip } from '../../tools/art/authoring/compose.mjs';
import { STRIPS } from '../../tools/art/authoring/alois.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { PLAYER_BODY_KEYS } from '../../src/render/player-art.js';

/**
 * The check that makes `tools/art/authoring/` worth having.
 *
 * A generator the committed art has drifted away from is worse than no
 * generator: it reads like the source of truth, so the next person edits a
 * block, runs the build, and silently reverts six months of pixel-editor
 * touch-ups nobody wrote down. So the source *is* the source — this re-encodes
 * every strip and compares it byte for byte with the file the game loads.
 *
 * The consequence is deliberate and worth stating: Alois's strips cannot be
 * hand-edited in the pixel editor and committed. The editor is still where you
 * *try* something; folding it back into `alois.mjs` is what makes it land. That
 * trade is the same one `docs/DECISIONS.md` #43 made for UI art, and it is
 * confined to the one sprite whose forty-four frames are a dozen drawings
 * rearranged — every other sprite in the tree is drawn and committed directly.
 */

const SPRITE_DIR = fileURLToPath(
  new URL('../../assets/sprites/common/characters/', import.meta.url),
);

const strips = Object.entries(STRIPS);

describe("Alois's committed art is what the authoring source produces", () => {
  it('covers every strip the player art loader asks for', () => {
    // The loader globs the folder, so a strip the generator forgot would not
    // fail at load — it would fail at `keyFor`, mid-run, on the first time the
    // player walked that way.
    const generated = new Set(strips.map(([name]) => name));
    for (const key of PLAYER_BODY_KEYS) {
      expect(generated, `alois-${key} has no authoring source`).toContain(`alois-${key}`);
    }
    expect(generated).toContain('alois-schlauch');
  });

  it.each(strips)('%s.strip.png is byte-identical to a fresh encode', async (name, frames) => {
    const committed = await readFile(`${SPRITE_DIR}${name}.strip.png`);
    const encoded = encodeStrip(name, frames);
    expect(
      encoded.equals(committed),
      `${name}.strip.png differs from what tools/art/authoring/alois.mjs produces. ` +
        'Run `npm run art:alois` if the source changed, or fold a hand edit back into the source.',
    ).toBe(true);
  });

  it.each(strips)('%s decodes to the canvas its frames were authored at', async (name, frames) => {
    const first = frames[0];
    expect(first).toBeDefined();
    const { width, height } = decodePng(await readFile(`${SPRITE_DIR}${name}.strip.png`));
    expect(height).toBe(first?.height);
    expect(width).toBe((first?.width ?? 0) * frames.length);
  });
});
