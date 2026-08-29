import { BitmapFont, Cache, Graphics, Rectangle, type Renderer, type Texture } from 'pixi.js';
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
 * The UI is drawn outside the scaled game container, at the display's own
 * resolution (`docs/CONTENT_BIBLE.md` §5, and `render/app.ts`'s doc comment) —
 * which is why the HUD is not stuck with eight device pixels of glyph height
 * on a 4K monitor. What it *is* stuck with is that a pixel font at a
 * fractional size resamples, and resampled pixel art is the one thing
 * `resolution.ts` exists to prevent. So the size knob is an **integer
 * multiple of the cell** — `render/ui/text.ts`'s `uiScaleFor` — never an
 * arbitrary point size. #53's text-scaling setting moves that integer, which
 * is the whole of "text scaling works against the font rather than fighting
 * it."
 *
 * ## One atlas per face, one draw call
 *
 * Every glyph of a face lives on one generated texture, so a screen full of
 * HUD text batches the way the rest of `render/` does. The atlas is built
 * once, from `Graphics` rectangles rather than a canvas, for the same reason
 * `placeholder-art.ts` builds its shapes that way: the renderer is the one
 * thing both the game and the room editor's playtest view already have.
 *
 * The two faces get an atlas each rather than sharing one. A shared sheet
 * would batch marginally better and cost the display face's 16-row cells
 * across every text glyph's row — the text atlas would grow by 60% to hold
 * padding nothing draws — and the two are never on screen in quantity at the
 * same time anyway: a frame has one heading and a dozen labels.
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

/**
 * Lays every glyph out on one sheet and draws it.
 *
 * Runs of set pixels become one rectangle rather than one per pixel: a
 * five-wide capital is at most five rectangles instead of twenty-five, which
 * keeps the one-off `Graphics` this builds an ordinary object rather than a
 * ten-thousand-command one.
 */
function drawAtlas(face: PixelFace): {
  graphics: Graphics;
  cells: AtlasCell[];
  width: number;
  height: number;
} {
  const graphics = new Graphics();
  const cells: AtlasCell[] = [];
  const glyphs = face.compiledGlyphs();
  const cellHeight = face.metrics.cellHeight;
  let cellWidth = 0;
  for (const glyph of glyphs.values()) {
    cellWidth = Math.max(cellWidth, glyph.width);
  }
  const strideX = cellWidth + ATLAS_PADDING;
  const strideY = cellHeight + ATLAS_PADDING;

  let index = 0;
  for (const [character, glyph] of glyphs) {
    const x = (index % ATLAS_COLUMNS) * strideX;
    const y = Math.floor(index / ATLAS_COLUMNS) * strideY;
    cells.push({ character, glyph, x, y });
    for (let row = 0; row < glyph.rows.length; row++) {
      const line = glyph.rows[row] ?? '';
      let run = 0;
      for (let column = 0; column <= line.length; column++) {
        if (line[column] === '#') {
          run += 1;
          continue;
        }
        if (run > 0) {
          graphics.rect(x + column - run, y + row, run, 1);
          run = 0;
        }
      }
    }
    index += 1;
  }
  graphics.fill({ color: STRUCTURAL_WHITE });

  const rows = Math.ceil(glyphs.size / ATLAS_COLUMNS);
  return { graphics, cells, width: ATLAS_COLUMNS * strideX, height: rows * strideY };
}

const installed = new Map<string, BitmapFont>();

/**
 * Builds every face's atlas and registers it for `BitmapText`.
 *
 * Idempotent: `app/main.ts` and `editor/playtest.ts` both boot a renderer and
 * both want the fonts, and the second caller should get the first one's rather
 * than a second copy of a two-hundred-glyph sheet.
 */
export function installPixelFonts(renderer: Renderer): void {
  for (const face of PIXEL_FACES) {
    if (!installed.has(face.family)) {
      installed.set(face.family, buildFont(renderer, face));
    }
  }
}

function buildFont(renderer: Renderer, face: PixelFace): BitmapFont {
  const { graphics, cells, width, height } = drawAtlas(face);
  const atlas: Texture = renderer.generateTexture({
    target: graphics,
    resolution: 1,
    frame: new Rectangle(0, 0, width, height),
  });
  graphics.destroy();

  const chars: Record<
    string,
    {
      id: number;
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      xOffset: number;
      yOffset: number;
      xAdvance: number;
      letter: string;
      kerning: Record<string, number>;
    }
  > = {};
  for (const cell of cells) {
    chars[cell.character] = {
      id: cell.character.codePointAt(0) ?? 0,
      page: 0,
      x: cell.x,
      // The cell's own top, not the glyph's: `drawAtlas` inks each glyph from
      // row 0 of its cell, and where it sits in the *line* is `yOffset`'s job
      // below. Conflating the two shifts every frame down by the glyph's own
      // top and slices a letter in half.
      y: cell.y,
      width: cell.glyph.width,
      height: cell.glyph.rows.length,
      xOffset: 0,
      // Measured from the top of the cell, because `baseLineOffset` below is
      // zero: a `BitmapText`'s local origin is the top-left of its line box,
      // which is what lets the HUD position text on whole pixels without
      // having to know a baseline.
      yOffset: cell.glyph.top,
      xAdvance: cell.glyph.advance,
      letter: cell.character,
      kerning: {},
    };
  }

  const font = new BitmapFont({
    textures: [atlas],
    data: {
      pages: [{ id: 0, file: `${face.family}-atlas` }],
      chars,
      fontSize: face.metrics.cellHeight,
      // The cell, not the line advance: a single-line label anchored at 0.5
      // should centre on its own rows. Multi-line text passes the advance as
      // an explicit `lineHeight` style instead (`render/ui/text.ts`).
      lineHeight: face.metrics.cellHeight,
      baseLineOffset: 0,
      fontFamily: face.family,
    },
  });
  // The key Pixi's own `BitmapFontManager.getFont` looks a pre-installed font
  // up under. Registering it here is what makes `fontFamily: face.family`
  // resolve to these bitmaps instead of generating a font from a browser face
  // of the same name — which is exactly the system-font HUD #154 removes.
  Cache.set(`${face.family}-bitmap`, font);
  return font;
}

/** Whether `installPixelFonts` has run — `render/ui/text.ts` asserts on it rather than drawing in a system font by accident. */
export function pixelFontsInstalled(): boolean {
  return installed.size >= PIXEL_FACES.length;
}
