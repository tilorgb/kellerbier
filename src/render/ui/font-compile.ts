import { TEXT_FONT } from './font-data.js';
import { DISPLAY_FONT } from './display-font-data.js';
import type { FontMetrics, GlyphSource, MarkSource, PixelFontSource } from './font-source.js';

/**
 * Compiling an authored face into glyphs, and measuring text with it.
 *
 * Deliberately free of Pixi and of the DOM, so the things that most want
 * checking — that every character has a glyph, and that a given German string
 * fits a given element — are answerable in a plain unit test rather than only
 * in front of a renderer. `font.ts` is the half that turns these bitmaps into
 * textures.
 *
 * Two faces are compiled here:
 *
 * - **the text face** (`font-data.ts`), a 10-row cell, everything read at 1:1;
 * - **the display face** (`display-font-data.ts`), a 16-row Fraktur, used only
 *   for the handful of things the game says in a raised voice.
 *
 * The display face **falls back to the text face** for any character it has no
 * Fraktur glyph of its own for, baseline-aligned. A display face legitimately
 * needs fewer characters than a text face — nothing writes a paragraph in it —
 * but a heading that hits a missing character must not show a box, so the
 * borrowed glyph is the graceful degradation `docs/DECISIONS.md` #19 asks for
 * rather than a gap.
 */

/** A glyph flattened to its cell: where its ink starts, how wide it is, and the rows themselves. */
export interface CompiledGlyph {
  readonly rows: readonly string[];
  /** Row in the cell the first entry of `rows` occupies. */
  readonly top: number;
  readonly width: number;
  readonly advance: number;
}

function sourceWidth(rows: readonly string[]): number {
  let width = 0;
  for (const row of rows) {
    width = Math.max(width, row.length);
  }
  return width;
}

/** Bottom row of a glyph in the cell — the baseline, moved by `descend`/`lift`. */
function bottomRow(source: GlyphSource, metrics: FontMetrics): number {
  return metrics.baselineRow + (source.descend ?? 0) - (source.lift ?? 0);
}

function compileBase(source: GlyphSource, metrics: FontMetrics): CompiledGlyph {
  const width = sourceWidth(source.rows);
  return {
    rows: source.rows,
    top: bottomRow(source, metrics) - source.rows.length + 1,
    width,
    advance: source.advance ?? width + metrics.letterSpacing,
  };
}

/**
 * Places `mark` over (or under) `base`.
 *
 * Vertically by `FontMetrics.markClearance`, which a `tight` mark gives up —
 * see `font-data.ts`'s header for why the dieresis never does. Horizontally
 * the mark is centred over the base, and where the base is *narrower* than the
 * mark — `ı`, one pixel wide — the base slides right instead, so `ï`'s dots
 * stay dots rather than hanging off the left edge.
 */
function compose(base: CompiledGlyph, mark: MarkSource, metrics: FontMetrics): CompiledGlyph {
  const markWidth = sourceWidth(mark.rows);
  const clearance = mark.tight === true ? 0 : metrics.markClearance;
  const markTop = mark.below ? metrics.baselineRow + 1 : base.top - clearance - mark.rows.length;

  let markX = Math.round((base.width - markWidth) / 2);
  let baseX = 0;
  if (markX < 0) {
    baseX = -markX;
    markX = 0;
  }
  const width = Math.max(base.width + baseX, markX + markWidth);

  const top = Math.min(base.top, markTop);
  const bottom = Math.max(base.top + base.rows.length - 1, markTop + mark.rows.length - 1);
  const cells: string[][] = [];
  for (let row = top; row <= bottom; row++) {
    cells.push(new Array<string>(width).fill('.'));
  }
  const paint = (rows: readonly string[], rowTop: number, x: number): void => {
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const target = cells[rowTop + index - top];
      if (row === undefined || target === undefined) {
        continue;
      }
      for (let column = 0; column < row.length; column++) {
        if (row[column] === '#') {
          target[x + column] = '#';
        }
      }
    }
  };
  paint(base.rows, base.top, baseX);
  paint(mark.rows, markTop, markX);

  return {
    rows: cells.map((row) => row.join('')),
    top,
    width,
    advance: Math.max(base.advance, width + metrics.letterSpacing),
  };
}

/** Re-seats a glyph compiled for one face's baseline onto another's. */
function reseat(glyph: CompiledGlyph, from: FontMetrics, to: FontMetrics): CompiledGlyph {
  return { ...glyph, top: glyph.top + (to.baselineRow - from.baselineRow) };
}

/** A compiled face: its glyphs, its metrics, and the measuring that follows from both. */
export class PixelFace {
  readonly family: string;
  readonly metrics: FontMetrics;

  private readonly glyphs = new Map<string, CompiledGlyph>();
  private readonly notdef: CompiledGlyph;
  private readonly warned = new Set<string>();

  constructor(source: PixelFontSource, fallback?: PixelFace) {
    this.family = source.family;
    this.metrics = source.metrics;

    for (const [character, glyph] of Object.entries(source.glyphs)) {
      this.glyphs.set(character, compileBase(glyph, source.metrics));
    }
    for (const [character, { base, mark }] of Object.entries(source.composed)) {
      const baseGlyph = this.glyphs.get(base);
      const markSource = source.marks[mark];
      if (baseGlyph === undefined || markSource === undefined) {
        // A composition naming a base or a mark nobody drew is a typo in the
        // table, not a content gap — `docs/DECISIONS.md` #19's "wrong, not
        // missing" half, thrown at construction time.
        throw new Error(
          `pixel font "${source.family}": "${character}" composes ${base}+${mark}, which is not authored`,
        );
      }
      this.glyphs.set(character, compose(baseGlyph, markSource, source.metrics));
    }
    if (fallback !== undefined) {
      // Borrowed glyphs are added *after* the face's own, so nothing this face
      // actually draws can be shadowed by the one it borrows from.
      for (const [character, glyph] of fallback.glyphs) {
        if (!this.glyphs.has(character)) {
          this.glyphs.set(character, reseat(glyph, fallback.metrics, source.metrics));
        }
      }
    }

    const notdef = this.glyphs.get(source.notdef);
    if (notdef === undefined) {
      throw new Error(`pixel font "${source.family}": no glyph for its own notdef character`);
    }
    this.notdef = notdef;
  }

  /** Every character this face can draw, in the order it was authored. */
  characters(): readonly string[] {
    return [...this.glyphs.keys()];
  }

  /** Whether this face has a glyph for `character` — its own or a borrowed one. */
  has(character: string): boolean {
    return this.glyphs.has(character);
  }

  /** The compiled bitmap for `character`, or the missing-glyph box. */
  glyph(character: string): CompiledGlyph {
    const glyph = this.glyphs.get(character);
    if (glyph !== undefined) {
      return glyph;
    }
    // Degrade, once, loudly enough to fix — `docs/DECISIONS.md` #19. A string
    // reaching a player with a character nobody drew should show a box, not
    // take the frame down or silently swallow a word.
    if (import.meta.env.DEV && !this.warned.has(character)) {
      this.warned.add(character);
      console.warn(
        `pixel font "${this.family}": no glyph for "${character}" (U+${
          character.codePointAt(0)?.toString(16).padStart(4, '0') ?? '????'
        }), drawing the missing-glyph box`,
      );
    }
    return this.notdef;
  }

  /**
   * How wide `text` draws, in cell pixels.
   *
   * The whole point of owning the font: this is exact, it needs no renderer
   * and no DOM, and it is therefore assertable in a unit test.
   */
  measure(text: string): number {
    let widest = 0;
    let line = 0;
    const endLine = (): void => {
      // The pen ends one letter-space past the last glyph; a measurement that
      // kept it would report every string a pixel wider than it draws.
      widest = Math.max(widest, line > 0 ? line - this.metrics.letterSpacing : 0);
      line = 0;
    };
    for (const character of text) {
      if (character === '\n') {
        endLine();
        continue;
      }
      line += this.glyph(character).advance;
    }
    endLine();
    return widest;
  }

  /** How tall `text` draws — one line is a cell, each further line an advance. */
  measureHeight(text: string): number {
    let lines = 1;
    for (const character of text) {
      if (character === '\n') {
        lines += 1;
      }
    }
    return this.metrics.cellHeight + (lines - 1) * this.metrics.lineAdvance;
  }

  /** The whole glyph table, in authoring order — `font.ts` lays the atlas out from it. */
  compiledGlyphs(): ReadonlyMap<string, CompiledGlyph> {
    return this.glyphs;
  }
}

/** The face everything is read in. */
export const TEXT_FACE = new PixelFace(TEXT_FONT);

/** The face the game raises its voice in — see `display-font-data.ts`. */
export const DISPLAY_FACE = new PixelFace(DISPLAY_FONT, TEXT_FACE);

/** Both faces, in install order. */
export const PIXEL_FACES: readonly PixelFace[] = [TEXT_FACE, DISPLAY_FACE];
