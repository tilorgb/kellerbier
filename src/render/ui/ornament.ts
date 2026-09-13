import { textureFromPixels, type Texture } from '../gfx/index.js';
import { TITLE_PALETTE } from '../palette.js';

/** Side length of one lattice cell, in UI pixels. */
const CELL = 12;

/**
 * The title screen's wallpaper: a Rautenmuster — the diamond lattice off the
 * Bavarian flag — drawn tone-on-tone against the same dark a title card's
 * backdrop already uses. Screen-space UI art in the sense
 * `docs/DECISIONS.md` #43 means (drawn at the UI's own integer pixel, not
 * held to a room's five-colour tile budget), but generated rather than
 * hand-authored: the pattern is periodic and cheap to compute exactly, so
 * there is no drawing to keep in sync the way `ui/title-key-art.ts` keeps one
 * with its own authoring script.
 *
 * Pure, the same reason `ui/key-art.ts`'s `renderKeyArt` is: a test can call
 * `renderOrnamentPixels` directly with no renderer. Always fully opaque — the
 * title screen paints this first and everything else over it, so there is no
 * transparent pixel for a caller to reason about.
 */
export function renderOrnamentPixels(
  width: number,
  height: number,
): { width: number; height: number; colours: Int32Array } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const colours = new Int32Array(w * h).fill(TITLE_PALETTE.cardBackdrop);
  const half = CELL / 2;
  for (let y = 0; y < h; y++) {
    const ly = y % CELL;
    for (let x = 0; x < w; x++) {
      const lx = x % CELL;
      if (Math.abs(lx - half) + Math.abs(ly - half) === half) {
        colours[y * w + x] = TITLE_PALETTE.ornamentTone;
      }
    }
  }
  return { width: w, height: h, colours };
}

export function ornamentTexture(width: number, height: number): Texture {
  const { colours } = renderOrnamentPixels(width, height);
  return textureFromPixels(width, height, colours);
}
