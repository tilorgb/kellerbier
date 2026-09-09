import { type Texture, textureFromPixels } from '../gfx/index.js';

/**
 * The title screen's key art, authored here as source rather than committed as
 * a PNG.
 *
 * `docs/DECISIONS.md` #43's reasoning applies to this exactly as it does to a
 * panel corner or a heart: it is screen-space art, drawn at the UI's own
 * integer scale on every floor at once, and holding it to a floor's five
 * colours would be asking the wrong question. What it is *not* is a
 * four-role `PixelArt` — `ui/pixel-art.ts`'s `o`/`f`/`h`/`a` alphabet exists so
 * one heart bitmap can be drawn in three health pools' colours, and an
 * illustration has no such reuse to buy. So this carries its own key, in the
 * same "upper case is the tone, lower case is its shade" convention
 * `tools/art/authoring/compose.mjs` uses for Alois, and the two agree on the
 * colours a viewer would compare: the same skin, the same Trachtenhut green,
 * the same brass.
 */

/** Rows of palette characters, one per pixel. `.` is transparent. */
export interface KeyArt {
  readonly rows: readonly string[];
  readonly palette: Readonly<Record<string, number>>;
  /**
   * Whole-number scale the art is drawn at.
   *
   * A poster is allowed a coarser pixel than the HUD around it — this is the
   * one drawing on the screen nobody reads, and doubling its pixel is what
   * makes a 640×360 frame big enough to hold an illustration at all. Whole,
   * for `render/resolution.ts`'s reason: a sprite at 1.5× has some pixels one
   * screen pixel wide and some two.
   */
  readonly scale: number;
}

export function keyArtWidth(art: KeyArt): number {
  let width = 0;
  for (const row of art.rows) {
    width = Math.max(width, row.length);
  }
  return width;
}

export function keyArtHeight(art: KeyArt): number {
  return art.rows.length;
}

/** `art` as a colour grid, `-1` where it is transparent. Pure; the specimen tooling draws from this too. */
export function renderKeyArt(art: KeyArt): {
  width: number;
  height: number;
  colours: Int32Array;
} {
  const width = keyArtWidth(art);
  const height = keyArtHeight(art);
  const colours = new Int32Array(Math.max(1, width) * Math.max(1, height)).fill(-1);
  for (let row = 0; row < height; row++) {
    const line = art.rows[row] ?? '';
    for (let column = 0; column < line.length; column++) {
      const character = line[column] ?? '.';
      if (character === '.') {
        continue;
      }
      const colour = art.palette[character];
      if (colour === undefined) {
        // A character with no colour is a typo in the drawing, not a content
        // gap — `docs/DECISIONS.md` #19's loud half. There is no sensible
        // fallback for "the wrong ink".
        throw new Error(`key art: no palette entry for "${character}"`);
      }
      colours[row * width + column] = colour;
    }
  }
  return { width, height, colours };
}

export function keyArtTexture(art: KeyArt): Texture {
  const { width, height, colours } = renderKeyArt(art);
  return textureFromPixels(width, height, colours);
}
