import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PALETTE, SCALE, build } from '../../tools/art/authoring/title-key-art.mjs';
import { renderModule } from '../../tools/art/authoring/build-title-key-art.mjs';
import { TITLE_KEY_ART } from '../../src/render/ui/title-key-art.js';
import { keyArtHeight, keyArtWidth, renderKeyArt } from '../../src/render/ui/key-art.js';

/**
 * The check that makes `tools/art/authoring/title-key-art.mjs` worth having,
 * the same one `alois-authoring.test.ts` makes for the character strips: a
 * generator the committed art has drifted away from is worse than no
 * generator, because it reads like the source of truth.
 */

const MODULE = fileURLToPath(new URL('../../src/render/ui/title-key-art.ts', import.meta.url));

describe('the committed key art is what the composition produces', () => {
  it('matches the generator byte for byte', async () => {
    const committed = await readFile(MODULE, 'utf8');
    expect(committed).toBe(renderModule());
  });

  it('is the size the composition drew, at the scale it asked for', () => {
    const rows = build();
    expect(keyArtWidth(TITLE_KEY_ART)).toBe(rows[0]?.length);
    expect(keyArtHeight(TITLE_KEY_ART)).toBe(rows.length);
    expect(TITLE_KEY_ART.scale).toBe(SCALE);
  });

  it('rasterises without a missing ink — every character in the drawing has a colour', () => {
    // `renderKeyArt` throws on an unknown character rather than dropping the
    // pixel, so this is the whole assertion: it either draws or it names the
    // typo.
    const { width, height, colours } = renderKeyArt(TITLE_KEY_ART);
    expect(colours).toHaveLength(width * height);
    expect(colours.some((colour) => colour >= 0)).toBe(true);
  });

  it('draws only in the palette it declares', () => {
    const declared = new Set(Object.values(PALETTE));
    for (const colour of renderKeyArt(TITLE_KEY_ART).colours) {
      if (colour < 0) continue;
      expect(declared).toContain(colour);
    }
  });
});
