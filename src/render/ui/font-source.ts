/**
 * What a pixel font is made of, before it is compiled.
 *
 * Two faces are authored against this (`font-data.ts`'s text face and
 * `display-font-data.ts`'s Fraktur), which is the only reason the shape is a
 * type rather than a handful of module constants: the compiler, the measurer
 * and the atlas builder all had to stop assuming there was one set of metrics
 * in the project.
 */

/** Where the rows of a face's cell mean what. */
export interface FontMetrics {
  /** Rows in a glyph cell. */
  readonly cellHeight: number;
  /** The row a letter's last ink sits on. Rows below it are descender space. */
  readonly baselineRow: number;
  /** Top row of a capital or an ascender. */
  readonly capTopRow: number;
  /** Top row of a lowercase letter with no ascender. */
  readonly xTopRow: number;
  /** Blank columns between two glyphs. */
  readonly letterSpacing: number;
  /** Baseline-to-baseline distance for wrapped or multi-line text. */
  readonly lineAdvance: number;
  /**
   * Clear rows a mark leaves between itself and the letter it sits on.
   *
   * One, normally: dots resting directly on a cap's apex merge into it. A
   * mark may opt out with `tight` when the face has no room to give it — see
   * `MarkSource.tight`.
   */
  readonly markClearance: number;
}

/** One authored glyph. */
export interface GlyphSource {
  /** Rows of `#` (ink) and `.` (clear). Every row must be the same length. */
  readonly rows: readonly string[];
  /** Rows below the baseline the glyph reaches. */
  readonly descend?: number;
  /** Rows above the baseline the glyph's bottom is raised to. */
  readonly lift?: number;
  /** Pen movement after drawing, in pixels. Defaults to the glyph's width plus the face's letter spacing. */
  readonly advance?: number;
}

/** A diacritic, placed over (or under) a base glyph by rule. */
export interface MarkSource {
  readonly rows: readonly string[];
  /** Hangs below the baseline instead of above the letter — the cedilla. */
  readonly below?: boolean;
  /**
   * Sits straight on the letter, giving up the face's `markClearance`.
   *
   * Only for marks that need two rows in a face that cannot spare three. The
   * dieresis is never tight in any face: it is the one mark the languages
   * this game is written in cannot afford to have misread.
   */
  readonly tight?: boolean;
}

/** A glyph built from another glyph plus a mark. */
export interface ComposedGlyph {
  readonly base: string;
  readonly mark: string;
}

/** A complete authored face. */
export interface PixelFontSource {
  /** `BitmapText`'s `fontFamily` for this face. */
  readonly family: string;
  readonly metrics: FontMetrics;
  readonly glyphs: Readonly<Record<string, GlyphSource>>;
  readonly marks: Readonly<Record<string, MarkSource>>;
  readonly composed: Readonly<Record<string, ComposedGlyph>>;
  /** The character drawn in place of one the face has no glyph for. Must be in `glyphs`. */
  readonly notdef: string;
}
