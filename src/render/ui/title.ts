import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { TITLE_PALETTE } from '../palette.js';
import { DISPLAY_FACE, TEXT_FACE, type PixelFace } from './font-compile.js';

/**
 * Display type with a treatment on it — outline, weight, a colour ramp, a
 * texture and a shadow — rendered a whole line at a time.
 *
 * ## Why a line at a time, and not per glyph
 *
 * The obvious implementation puts the outline in the font atlas, so every
 * glyph carries its own. It looks wrong for exactly one reason, and the reason
 * is fatal: adjacent letters in a display face sit a pixel apart, so their
 * outlines land *between* them and every word grows a seam down each letter
 * gap. An outline belongs to the word, not to the letter.
 *
 * Rasterising the whole line instead also buys the rest of it for free: a
 * colour ramp can run top-to-bottom across the line rather than restarting on
 * each glyph, and the shadow is one offset copy of one shape rather than a
 * dozen overlapping ones.
 *
 * The cost is a texture per distinct string, built when the string changes.
 * That is affordable precisely *because* this is a display face: the things
 * drawn with it — a floor's name, a boss plate, the word a run ends on —
 * change on an event, a handful of times a run, never per frame.
 *
 * ## The layers, in the order they are drawn
 *
 * ```text
 * shadow    the whole silhouette, offset, in one flat colour
 * outline   one pixel around the silhouette
 * fill      the glyph mass, coloured by a top-to-bottom ramp
 * texture   a lighter value picked out of the fill in a pattern
 * ```
 */

/** How the fill is broken up once the ramp has coloured it. */
export type TitleTexture =
  /** Nothing. Flat bands of the ramp. */
  | 'none'
  /** Every third row lightened — the horizontal grain of a painted enamel sign. */
  | 'stripes'
  /** A one-pixel checker, lightened — reads as a screen-printed tint at any size. */
  | 'hatch';

export interface TitleStyle {
  /**
   * Fill colours from the top of the line to the bottom, at least one.
   *
   * A ramp rather than a gradient: this is pixel art, and two or three flat
   * bands is what the era's actual title cards did. Values are spread evenly
   * over the inked rows of the line.
   */
  readonly ramp: readonly number[];
  /** The colour `texture` picks out of the fill. Ignored when `texture` is `'none'`. */
  readonly texture: TitleTexture;
  readonly textureColour?: number;
  /** One pixel around the whole line. `undefined` draws none. */
  readonly outline?: number;
  /** Offset copy of the silhouette, under everything. `undefined` draws none. */
  readonly shadow?: { readonly colour: number; readonly x: number; readonly y: number };
  /** Thickens every stroke by a pixel to the right. The face is already heavy; this is for the largest sizes. */
  readonly bold?: boolean;
}

/** Layer ids in the composed mask, in draw order. */
const EMPTY = 0;
const SHADOW = 1;
const OUTLINE = 2;
const FILL = 3;

interface Mask {
  readonly cells: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** First and last inked row of the *fill*, so the ramp spans the letters rather than the shadow. */
  readonly fillTop: number;
  readonly fillBottom: number;
}

function composeLine(face: PixelFace, text: string, style: TitleStyle): Mask {
  const glyphs: { rows: readonly string[]; top: number; x: number }[] = [];
  let pen = 0;
  for (const character of text) {
    const glyph = face.glyph(character);
    glyphs.push({ rows: glyph.rows, top: glyph.top, x: pen });
    pen += glyph.advance;
  }
  const inkWidth = Math.max(0, pen - face.metrics.letterSpacing) + (style.bold === true ? 1 : 0);
  const inkHeight = face.metrics.cellHeight;

  // Room for the outline on every side and for the shadow wherever it falls.
  const outlinePad = style.outline === undefined ? 0 : 1;
  const shadow = style.shadow;
  const padLeft = outlinePad + (shadow === undefined ? 0 : Math.max(0, -shadow.x));
  const padTop = outlinePad + (shadow === undefined ? 0 : Math.max(0, -shadow.y));
  const padRight = outlinePad + (shadow === undefined ? 0 : Math.max(0, shadow.x));
  const padBottom = outlinePad + (shadow === undefined ? 0 : Math.max(0, shadow.y));

  const width = inkWidth + padLeft + padRight;
  const height = inkHeight + padTop + padBottom;
  const cells = new Uint8Array(width * height);

  let fillTop = height;
  let fillBottom = -1;
  const ink = (x: number, y: number): void => {
    cells[y * width + x] = FILL;
    fillTop = Math.min(fillTop, y);
    fillBottom = Math.max(fillBottom, y);
  };
  for (const glyph of glyphs) {
    for (let row = 0; row < glyph.rows.length; row++) {
      const line = glyph.rows[row] ?? '';
      const y = padTop + glyph.top + row;
      for (let column = 0; column < line.length; column++) {
        if (line[column] !== '#') {
          continue;
        }
        const x = padLeft + glyph.x + column;
        ink(x, y);
        if (style.bold === true) {
          ink(x + 1, y);
        }
      }
    }
  }
  if (fillBottom < 0) {
    return { cells, width, height, fillTop: 0, fillBottom: 0 };
  }

  // Outline: the four-neighbour dilation of the fill, minus the fill. Four
  // rather than eight — a diagonal-inclusive outline rounds off the sharp
  // corners the whole face is built out of.
  if (style.outline !== undefined) {
    const grown = new Uint8Array(cells);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (cells[y * width + x] !== FILL) {
          continue;
        }
        const neighbours = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const [nx, ny] of neighbours) {
          if (nx === undefined || ny === undefined) {
            continue;
          }
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          if (grown[ny * width + nx] === EMPTY) {
            grown[ny * width + nx] = OUTLINE;
          }
        }
      }
    }
    cells.set(grown);
  }

  if (shadow !== undefined) {
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const value = cells[y * width + x];
        if (value !== FILL && value !== OUTLINE) {
          continue;
        }
        const sx = x + shadow.x;
        const sy = y + shadow.y;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
          continue;
        }
        if (cells[sy * width + sx] === EMPTY) {
          cells[sy * width + sx] = SHADOW;
        }
      }
    }
  }

  return { cells, width, height, fillTop, fillBottom };
}

/** The ramp colour for a fill row. */
function rampColour(style: TitleStyle, y: number, mask: Mask): number {
  const stops = style.ramp;
  const first = stops[0] ?? 0xffffff;
  if (stops.length === 1) {
    return first;
  }
  const span = Math.max(1, mask.fillBottom - mask.fillTop);
  const t = Math.min(1, Math.max(0, (y - mask.fillTop) / span));
  const index = Math.min(stops.length - 1, Math.floor(t * stops.length));
  return stops[index] ?? first;
}

function texturedAt(style: TitleStyle, x: number, y: number, mask: Mask): boolean {
  switch (style.texture) {
    case 'stripes':
      // Anchored to the top of the letters rather than to the bitmap, so the
      // grain sits the same way whatever padding the outline and shadow added.
      return (y - mask.fillTop) % 3 === 0;
    case 'hatch':
      return (x + y) % 2 === 0;
    default:
      return false;
  }
}

/** A rasterised line: one colour per pixel, `-1` where nothing is drawn. */
export interface TitlePixels {
  readonly width: number;
  readonly height: number;
  readonly colours: Int32Array;
}

/**
 * Rasterises `text` in `face` with `style`.
 *
 * Pure — no renderer, no DOM — so the same code paints the texture the game
 * draws and the specimen sheets the art was signed off from, and so a test can
 * assert that (say) the outline actually surrounds the fill.
 */
export function renderTitlePixels(face: PixelFace, text: string, style: TitleStyle): TitlePixels {
  const mask = composeLine(face, text, style);
  const colours = new Int32Array(mask.width * mask.height).fill(-1);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const index = y * mask.width + x;
      switch (mask.cells[index]) {
        case SHADOW:
          colours[index] = style.shadow?.colour ?? -1;
          break;
        case OUTLINE:
          colours[index] = style.outline ?? -1;
          break;
        case FILL:
          colours[index] =
            style.texture !== 'none' &&
            style.textureColour !== undefined &&
            texturedAt(style, x, y, mask)
              ? style.textureColour
              : rampColour(style, y, mask);
          break;
        default:
          break;
      }
    }
  }
  return { width: mask.width, height: mask.height, colours };
}

/** Draws `text` in `face` with `style` into a texture sized exactly to it. */
export function titleTexture(
  renderer: Renderer,
  face: PixelFace,
  text: string,
  style: TitleStyle,
): Texture {
  const { width, height, colours } = renderTitlePixels(face, text, style);
  const graphics = new Graphics();
  // One fill per distinct colour, and horizontal runs within it: a treated
  // line is a handful of flat bands, so this is a few dozen rectangles rather
  // than one per pixel.
  const distinct = new Set<number>();
  for (const colour of colours) {
    if (colour >= 0) {
      distinct.add(colour);
    }
  }
  for (const colour of distinct) {
    let drew = false;
    for (let y = 0; y < height; y++) {
      let run = 0;
      for (let x = 0; x <= width; x++) {
        if (x < width && colours[y * width + x] === colour) {
          run += 1;
          continue;
        }
        if (run > 0) {
          graphics.rect(x - run, y, run, 1);
          drew = true;
          run = 0;
        }
      }
    }
    if (drew) {
      graphics.fill({ color: colour });
    }
  }

  const texture = renderer.generateTexture({
    target: graphics,
    resolution: 1,
    frame: new Rectangle(0, 0, Math.max(1, width), Math.max(1, height)),
  });
  graphics.destroy();
  return texture;
}

/**
 * A line of treated display type, as a sprite.
 *
 * `set` rebuilds the texture; `view.scale` is how it is made bigger, and it
 * must stay a whole number for the reason everything in `render/ui/` does.
 * The old texture is destroyed on every change — there is exactly one of
 * these on screen at a time and the strings are unbounded (a boss name, a
 * death word), so a cache would only ever grow.
 */
export class DisplayTitle {
  readonly view = new Sprite();

  private readonly renderer: Renderer;
  private readonly face: PixelFace;
  private style: TitleStyle;
  private current = '';

  constructor(renderer: Renderer, style: TitleStyle, face: PixelFace = DISPLAY_FACE) {
    this.renderer = renderer;
    this.face = face;
    this.style = style;
  }

  /** Sets the line. A repeat of the current text is a no-op, so a per-frame `sync` costs nothing. */
  set(text: string): void {
    if (text === this.current && this.view.texture.width > 1) {
      return;
    }
    this.current = text;
    this.rebuild();
  }

  /** Swaps the treatment — the death word takes a different one from a floor card. */
  setStyle(style: TitleStyle): void {
    this.style = style;
    this.rebuild();
  }

  private rebuild(): void {
    const previous = this.view.texture;
    this.view.texture = titleTexture(this.renderer, this.face, this.current, this.style);
    if (previous.width > 1) {
      previous.destroy(true);
    }
  }

  /** Width in UI pixels at scale 1. */
  get width(): number {
    return this.view.texture.width;
  }

  /** Height in UI pixels at scale 1. */
  get height(): number {
    return this.view.texture.height;
  }

  /** Centres the line on `centreX`, with its top at `top`, honouring the sprite's own scale. */
  place(centreX: number, top: number): void {
    this.view.position.set(
      Math.round(centreX - (this.width * this.view.scale.x) / 2),
      Math.round(top),
    );
  }
}

/** A rule — the ornamental bar an old title card puts above and below its text. */
export function ruleTexture(renderer: Renderer, colour: number, accent: number): Texture {
  const graphics = new Graphics();
  // A heavy bar with a hairline under it, and a diamond in the middle: the
  // cheapest mark that reads as "this is a title card" rather than "this is a
  // divider in a settings menu".
  graphics.rect(0, 0, 9, 2).fill({ color: colour });
  graphics.rect(0, 3, 9, 1).fill({ color: accent });
  const container = new Container();
  container.addChild(graphics);
  const texture = renderer.generateTexture({
    target: container,
    resolution: 1,
    frame: new Rectangle(0, 0, 9, 4),
  });
  container.destroy({ children: true });
  return texture;
}

/** The text face, for anything that wants a treated line at reading size. */
export const TITLE_TEXT_FACE = TEXT_FACE;

/**
 * The treatments themselves.
 *
 * Three schemes over one set of shapes: gold for a place, blood for a threat,
 * bone for a heading that is only a heading. Every one of them carries the
 * same outline and the same hard offset shadow, because that pair is what
 * makes a title read over a room rather than on top of one — the floors these
 * appear over range from Der Keller's grey to Die Wiesn's magenta, and no
 * single fill colour survives all seven on its own.
 */
export const TITLE_STYLES = {
  /** A floor's name on its intro card, and the game's own name. */
  floor: {
    ramp: TITLE_PALETTE.goldRamp,
    texture: 'stripes',
    textureColour: TITLE_PALETTE.goldGrain,
    outline: TITLE_PALETTE.outline,
    shadow: { colour: TITLE_PALETTE.shadow, x: 2, y: 3 },
    bold: true,
  },
  /** The boss room's plate, and the word a run ends on. */
  threat: {
    ramp: TITLE_PALETTE.bloodRamp,
    texture: 'stripes',
    textureColour: TITLE_PALETTE.bloodGrain,
    outline: TITLE_PALETTE.outline,
    shadow: { colour: TITLE_PALETTE.shadow, x: 2, y: 2 },
    bold: true,
  },
  /** A heading with no event behind it — the map overlay's floor line. */
  heading: {
    ramp: TITLE_PALETTE.boneRamp,
    texture: 'none',
    outline: TITLE_PALETTE.outline,
  },
} as const satisfies Readonly<Record<string, TitleStyle>>;
