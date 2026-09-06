import {
  type BitmapFont,
  type BitmapGlyph,
  installedBitmapFontCount,
  registerBitmapFont,
  textureFromPixels,
} from '../gfx/index.js';
import { STRUCTURAL_WHITE } from '../palette.js';
import { PIXEL_FACES, TEXT_FACE, type CompiledGlyph, type PixelFace } from './font-compile.js';

/**
 * Turning the compiled faces into `BitmapText` fonts.
 *
 * ## Why a font at all
 *
 * Every HUD in the game was drawn in the browser's `monospace` at 9-13px
 * (#154). That is not a style choice, it is the absence of one — the face
 * differs per platform, it has no relationship to the art, and its metrics
 * are whatever the user's system font happens to be, which makes "the longest
 * German string fits this element" unanswerable at author time. A bitmap font
 * the project owns makes the answer arithmetic (`PixelFace.measure`), which is
 * what `tests/unit/ui-strings.test.ts` checks the real German strings against.
 *
 * ## Integer scale, not font size
 *
 * A pixel font at a fractional size resamples, and resampled pixel art is the
 * one thing `resolution.ts` exists to prevent. So the size knob is an
 * **integer multiple of the cell** — `render/ui/text.ts`'s `uiScaleFor` —
 * never an arbitrary point size. #53's text-scaling setting moves that
 * integer, which is the whole of "text scaling works against the font rather
 * than fighting it."
 *
 * ## One atlas per face, one draw call
 *
 * Every glyph of a face lives on one generated texture, so a label is one
 * mesh over one texture however long it is. The atlas is built once, straight
 * from the glyph bitmaps into pixels (`textureFromPixels`) — no canvas and no
 * renderer, so the fonts exist in a headless test exactly as they do in the
 * game.
 *
 * The two faces get an atlas each rather than sharing one. A shared sheet
 * would cost the display face's 16-row cells across every text glyph's row —
 * the text atlas would grow by 60% to hold padding nothing draws — and the two
 * are never on screen in quantity at the same time anyway: a frame has one
 * heading and a dozen labels.
 */

/** `BitmapText`'s `fontFamily` for the text face. Re-exported so nothing has to reach into the data module. */
export const UI_FONT_FAMILY = TEXT_FACE.family;

/** The size a `BitmapText` draws the text face at, 1:1 with the authored bitmaps. */
export const UI_FONT_BASE_SIZE = TEXT_FACE.metrics.cellHeight;

/** Columns per atlas row. 16 keeps the sheet close to square for the ~200 glyphs authored. */
const ATLAS_COLUMNS = 16;

/** One clear pixel around every cell, so no glyph can sample its neighbour at any scale. */
const ATLAS_PADDING = 1;

interface AtlasCell {
  readonly character: string;
  readonly glyph: CompiledGlyph;
  readonly x: number;
  readonly y: number;
}

/** Lays every glyph out on one sheet and inks it into a colour grid. */
function drawAtlas(face: PixelFace): {
  colours: Int32Array;
  cells: AtlasCell[];
  width: number;
  height: number;
} {
  const cells: AtlasCell[] = [];
  const glyphs = face.compiledGlyphs();
  const cellHeight = face.metrics.cellHeight;
  let cellWidth = 0;
  for (const glyph of glyphs.values()) {
    cellWidth = Math.max(cellWidth, glyph.width);
  }
  const strideX = cellWidth + ATLAS_PADDING;
  const strideY = cellHeight + ATLAS_PADDING;
  const rows = Math.ceil(glyphs.size / ATLAS_COLUMNS);
  const width = ATLAS_COLUMNS * strideX;
  const height = Math.max(1, rows * strideY);
  const colours = new Int32Array(width * height).fill(-1);

  let index = 0;
  for (const [character, glyph] of glyphs) {
    const x = (index % ATLAS_COLUMNS) * strideX;
    const y = Math.floor(index / ATLAS_COLUMNS) * strideY;
    cells.push({ character, glyph, x, y });
    for (let row = 0; row < glyph.rows.length; row++) {
      const line = glyph.rows[row] ?? '';
      for (let column = 0; column < line.length; column++) {
        if (line[column] === '#') {
          colours[(y + row) * width + x + column] = STRUCTURAL_WHITE;
        }
      }
    }
    index += 1;
  }
  return { colours, cells, width, height };
}

/**
 * Builds every face's atlas and registers it for `BitmapText`.
 *
 * Idempotent: `app/main.ts` and `editor/playtest.ts` both boot and both want
 * the fonts, and the second caller should get the first one's rather than a
 * second copy of a two-hundred-glyph sheet.
 */
export function installPixelFonts(): void {
  for (const face of PIXEL_FACES) {
    if (!installedFamilies.has(face.family)) {
      registerBitmapFont(buildFont(face));
      installedFamilies.add(face.family);
    }
  }
}

const installedFamilies = new Set<string>();

function buildFont(face: PixelFace): BitmapFont {
  const { colours, cells, width, height } = drawAtlas(face);
  const atlas = textureFromPixels(width, height, colours);
  const glyphs = new Map<string, BitmapGlyph>();
  for (const cell of cells) {
    glyphs.set(cell.character, {
      // The cell's own top, not the glyph's: `drawAtlas` inks each glyph from
      // row 0 of its cell, and where it sits in the *line* is `yOffset`'s job.
      texture: atlas.sub(cell.x, cell.y, cell.glyph.width, cell.glyph.rows.length),
      // Measured from the top of the line box: a `BitmapText`'s local origin
      // is the top-left of its line, which is what lets the HUD position text
      // on whole pixels without having to know a baseline.
      yOffset: cell.glyph.top,
      xAdvance: cell.glyph.advance,
    });
  }
  return {
    family: face.family,
    cellHeight: face.metrics.cellHeight,
    lineAdvance: face.metrics.lineAdvance,
    letterSpacing: face.metrics.letterSpacing,
    glyphs,
    atlas,
  };
}

/** Whether `installPixelFonts` has run — `render/ui/text.ts` asserts on it rather than drawing nothing by accident. */
export function pixelFontsInstalled(): boolean {
  return installedBitmapFontCount() >= PIXEL_FACES.length;
}
