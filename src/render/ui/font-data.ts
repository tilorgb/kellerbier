/**
 * The Kellerbier pixel font, authored as bitmaps.
 *
 * ## The shape of the cell, and why it is 10 rows
 *
 * `docs/DECISIONS.md` #42 is the decision this file implements. The short
 * version: German is a first-class language here rather than a localisation
 * afterthought, `Ä`/`Ö`/`Ü` are letters rather than decorated `A`/`O`/`U`, and
 * a diacritic therefore needs room that is *reserved* rather than borrowed.
 * The two ways to reserve it are a shorter cap height or a taller line box.
 * **The line box grew.**
 *
 * ```text
 * row 0   ▁▁▁▁▁   diacritic band for capitals
 * row 1           clearance
 * row 2   ▄▄▄▄▄   cap / ascender top       (diacritic band for x-height letters)
 * row 3   █████                            (clearance)
 * row 4   █████   x-height top
 * row 5   █████
 * row 6   █████
 * row 7   █████
 * row 8   █████   baseline (the last row a letter sits on)
 * row 9   ▀▀▀▀▀   descender
 * ```
 *
 * Cap height is 7 rows, x-height 5, one descender row. `LINE_ADVANCE` is 12
 * rather than 10 so a descender on one line and a diacritic on the next never
 * touch — the cell is what a glyph occupies, the advance is what a paragraph
 * costs.
 *
 * ## Authoring
 *
 * A glyph is authored as the rows it actually inks, `#` set and `.` clear,
 * positioned by where its *bottom* row sits rather than by a top-left origin:
 * `descend` pushes it a row below the baseline (`g`, `p`, the comma tail),
 * `lift` raises it off the baseline (`-`, `=`, `°`). Everything else lands on
 * the baseline, which is what makes a 7-row entry a capital and a 5-row entry
 * a lowercase letter without either one having to say so.
 *
 * ## Composition
 *
 * Accented glyphs are **composed**, not drawn: `Ä` is `A` plus the dieresis
 * mark, placed by rule. That is the payoff of reserving a diacritic band —
 * 60-odd Latin-1 letters that would otherwise each be a hand-drawn bitmap
 * (and each an opportunity to put the dots a pixel off) become one table of
 * base-plus-mark pairs, and a mark redrawn once moves every letter using it.
 *
 * The placement rule has one deliberate asymmetry. A **one-row mark keeps a
 * clear row** between itself and the letter; a **two-row mark does not**. The
 * dieresis is a one-row mark for exactly this reason: dots resting directly on
 * `A`'s apex merge into it at this size, and the dieresis is the one mark the
 * languages this game is actually written in cannot afford to have misread.
 * The circumflex, ring and tilde — no target language uses them — pay the
 * cramped price instead.
 */

import type { ComposedGlyph, GlyphSource, MarkSource, PixelFontSource } from './font-source.js';

/** Rows in a glyph cell. */
export const CELL_HEIGHT = 10;

/** The row a letter's last ink sits on. Rows below this are descender space. */
export const BASELINE_ROW = 8;

/** Top row of a capital or an ascender. `BASELINE_ROW - CAP_TOP_ROW + 1` is the cap height. */
export const CAP_TOP_ROW = 2;

/** Top row of a lowercase letter with no ascender. */
export const X_TOP_ROW = 4;

/** Blank columns between two glyphs. */
export const LETTER_SPACING = 1;

/**
 * Baseline-to-baseline distance for wrapped or multi-line text.
 *
 * Two rows more than the cell, so line N's descender and line N+1's diacritic
 * band cannot collide — a 10-row advance would let `Wagenrädlgspräch` on one
 * line sit inside `gjpqy` on the line above.
 */
export const LINE_ADVANCE = 12;

/**
 * The glyphs drawn by hand — ASCII, plus the Latin-1 letters and symbols that
 * are not a base letter with a mark on it.
 *
 * Capitals are 5 wide unless the letter itself is narrower; digits are 4 wide
 * and share one advance so a counter does not jitter as it counts; lowercase
 * is 4 wide with narrower exceptions. Proportional rather than monospaced
 * because German UI strings run roughly a third longer than their English
 * equivalents, and a monospaced `Kellerschlüssel` costs 15 full cells.
 */
export const BASE_GLYPHS: Readonly<Record<string, GlyphSource>> = {
  ' ': { rows: [], advance: 4 },

  A: { rows: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'] },
  B: { rows: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'] },
  C: { rows: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'] },
  D: { rows: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'] },
  E: { rows: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'] },
  F: { rows: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'] },
  G: { rows: ['.###.', '#...#', '#....', '#..##', '#...#', '#...#', '.###.'] },
  H: { rows: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'] },
  I: { rows: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'] },
  J: { rows: ['..##', '...#', '...#', '...#', '...#', '#..#', '.##.'] },
  K: { rows: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'] },
  L: { rows: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'] },
  M: { rows: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'] },
  N: { rows: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'] },
  O: { rows: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'] },
  P: { rows: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'] },
  Q: { rows: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'] },
  R: { rows: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'] },
  S: { rows: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'] },
  T: { rows: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'] },
  U: { rows: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'] },
  V: { rows: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'] },
  W: { rows: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'] },
  X: { rows: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'] },
  Y: { rows: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'] },
  Z: { rows: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'] },

  a: { rows: ['.##.', '...#', '.###', '#..#', '.###'] },
  b: { rows: ['#...', '#...', '###.', '#..#', '#..#', '#..#', '###.'] },
  c: { rows: ['.###', '#...', '#...', '#...', '.###'] },
  d: { rows: ['...#', '...#', '.###', '#..#', '#..#', '#..#', '.###'] },
  e: { rows: ['.##.', '#..#', '####', '#...', '.###'] },
  f: { rows: ['.##', '#..', '###', '#..', '#..', '#..', '#..'] },
  g: { rows: ['.###', '#..#', '#..#', '.###', '...#', '###.'], descend: 1 },
  h: { rows: ['#...', '#...', '###.', '#..#', '#..#', '#..#', '#..#'] },
  i: { rows: ['#', '.', '#', '#', '#', '#', '#'] },
  j: { rows: ['..#', '...', '..#', '..#', '..#', '..#', '..#', '##.'], descend: 1 },
  k: { rows: ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'] },
  l: { rows: ['#.', '#.', '#.', '#.', '#.', '#.', '##'] },
  m: { rows: ['#####', '#.#.#', '#.#.#', '#.#.#', '#.#.#'] },
  n: { rows: ['###.', '#..#', '#..#', '#..#', '#..#'] },
  o: { rows: ['.##.', '#..#', '#..#', '#..#', '.##.'] },
  p: { rows: ['###.', '#..#', '#..#', '###.', '#...', '#...'], descend: 1 },
  q: { rows: ['.###', '#..#', '#..#', '.###', '...#', '...#'], descend: 1 },
  r: { rows: ['##.', '#.#', '#..', '#..', '#..'] },
  s: { rows: ['.###', '#...', '.##.', '...#', '###.'] },
  t: { rows: ['.#.', '.#.', '###', '.#.', '.#.', '.#.', '.##'] },
  u: { rows: ['#..#', '#..#', '#..#', '#..#', '.###'] },
  v: { rows: ['#...#', '#...#', '#...#', '.#.#.', '..#..'] },
  w: { rows: ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'] },
  x: { rows: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'] },
  y: { rows: ['#..#', '#..#', '#..#', '.###', '...#', '###.'], descend: 1 },
  z: { rows: ['####', '...#', '.##.', '#...', '####'] },

  '0': { rows: ['.##.', '#..#', '#..#', '#.##', '##.#', '#..#', '.##.'], advance: 5 },
  '1': { rows: ['.#..', '##..', '.#..', '.#..', '.#..', '.#..', '###.'], advance: 5 },
  '2': { rows: ['.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'], advance: 5 },
  '3': { rows: ['###.', '...#', '...#', '.##.', '...#', '...#', '###.'], advance: 5 },
  '4': { rows: ['#..#', '#..#', '#..#', '####', '...#', '...#', '...#'], advance: 5 },
  '5': { rows: ['####', '#...', '#...', '###.', '...#', '...#', '###.'], advance: 5 },
  '6': { rows: ['.##.', '#...', '#...', '###.', '#..#', '#..#', '.##.'], advance: 5 },
  '7': { rows: ['####', '...#', '...#', '..#.', '..#.', '.#..', '.#..'], advance: 5 },
  '8': { rows: ['.##.', '#..#', '#..#', '.##.', '#..#', '#..#', '.##.'], advance: 5 },
  '9': { rows: ['.##.', '#..#', '#..#', '.###', '...#', '...#', '.##.'], advance: 5 },

  '!': { rows: ['#', '#', '#', '#', '#', '.', '#'] },
  '"': { rows: ['#.#', '#.#'], lift: 5 },
  '#': { rows: ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'] },
  $: { rows: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'] },
  '%': { rows: ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'] },
  '&': { rows: ['.##..', '#..#.', '#..#.', '.##..', '#..#.', '#..#.', '.##.#'] },
  "'": { rows: ['#', '#'], lift: 5 },
  '(': { rows: ['.#', '#.', '#.', '#.', '#.', '#.', '.#'] },
  ')': { rows: ['#.', '.#', '.#', '.#', '.#', '.#', '#.'] },
  '*': { rows: ['..#..', '#.#.#', '.###.', '#.#.#', '..#..'], lift: 2 },
  '+': { rows: ['..#..', '..#..', '#####', '..#..', '..#..'], lift: 1 },
  ',': { rows: ['.#', '#.'], descend: 1 },
  '-': { rows: ['####'], lift: 3 },
  '.': { rows: ['#'] },
  '/': { rows: ['..#', '..#', '.#.', '.#.', '.#.', '#..', '#..'] },
  ':': { rows: ['#', '.', '.', '#'], lift: 1 },
  ';': { rows: ['.#', '..', '..', '.#', '#.'], descend: 1 },
  '<': { rows: ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'] },
  '=': { rows: ['####', '....', '####'], lift: 2 },
  '>': { rows: ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'] },
  '?': { rows: ['.##.', '#..#', '...#', '..#.', '.#..', '....', '.#..'] },
  '@': { rows: ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'] },
  '[': { rows: ['##', '#.', '#.', '#.', '#.', '#.', '##'] },
  '\\': { rows: ['#..', '#..', '.#.', '.#.', '.#.', '..#', '..#'] },
  ']': { rows: ['##', '.#', '.#', '.#', '.#', '.#', '##'] },
  '^': { rows: ['..#..', '.#.#.', '#...#'], lift: 4 },
  _: { rows: ['#####'], descend: 1 },
  '`': { rows: ['#.', '.#'], lift: 5 },
  '{': { rows: ['.##', '.#.', '.#.', '##.', '.#.', '.#.', '.##'] },
  '|': { rows: ['#', '#', '#', '#', '#', '#', '#'] },
  '}': { rows: ['##.', '.#.', '.#.', '.##', '.#.', '.#.', '##.'] },
  '~': { rows: ['.##.#', '#..##'], lift: 3 },

  // ---------------------------------------------------------------------
  // Latin-1 supplement: the letters that are not a base plus a mark, and
  // the symbol block.
  // ---------------------------------------------------------------------

  /** Non-breaking space — same metrics as a space, so a line it holds together measures the same. */
  '\u00a0': { rows: [], advance: 4 },
  '¡': { rows: ['#', '.', '#', '#', '#', '#', '#'], descend: 1 },
  '¢': { rows: ['..#.', '.###', '#.#.', '#.#.', '#.#.', '###.', '..#.'] },
  '£': { rows: ['..##.', '.#..#', '.#...', '####.', '.#...', '.#...', '#####'] },
  '¤': { rows: ['#...#', '.###.', '.#.#.', '.###.', '#...#'], lift: 1 },
  '¥': { rows: ['#...#', '.#.#.', '..#..', '#####', '..#..', '#####', '..#..'] },
  '¦': { rows: ['#', '#', '#', '.', '#', '#', '#'] },
  '§': { rows: ['.###', '#...', '.##.', '#..#', '.##.', '...#', '###.'] },
  '¨': { rows: ['#.#'], lift: 8 },
  '©': { rows: ['.###.', '#...#', '#.##.', '#.#..', '#.##.', '#...#', '.###.'] },
  ª: { rows: ['.##', '#.#', '.##'], lift: 4 },
  '«': { rows: ['.#.#', '#.#.', '.#.#'], lift: 2 },
  '¬': { rows: ['####', '...#'], lift: 3 },
  /** Soft hyphen — drawn as a hyphen on the rare occasion one is not stripped before display. */
  '\u00ad': { rows: ['####'], lift: 3 },
  '®': { rows: ['.###.', '#...#', '#.##.', '#.##.', '#.#.#', '#...#', '.###.'] },
  '¯': { rows: ['####'], lift: 8 },
  '°': { rows: ['.#.', '#.#', '.#.'], lift: 4 },
  '±': { rows: ['..#..', '..#..', '#####', '..#..', '..#..', '.....', '#####'] },
  '²': { rows: ['##.', '..#', '.#.', '###'], lift: 3 },
  '³': { rows: ['##.', '..#', '.##', '##.'], lift: 3 },
  '´': { rows: ['.#', '#.'], lift: 7 },
  µ: { rows: ['#..#', '#..#', '#..#', '#..#', '###.', '#...'], descend: 1 },
  '¶': { rows: ['.###', '####', '####', '.###', '..##', '..##', '..##'] },
  '·': { rows: ['#'], lift: 3 },
  '¸': { rows: ['.#.'], descend: 1 },
  '¹': { rows: ['.#.', '##.', '.#.', '###'], lift: 3 },
  º: { rows: ['###', '#.#', '###'], lift: 4 },
  '»': { rows: ['#.#.', '.#.#', '#.#.'], lift: 2 },
  '¼': { rows: ['#...#.', '#..#..', '#..#..', '..#...', '.#.#.#', '#..###', '.....#'] },
  '½': { rows: ['#...#.', '#..#..', '#..#..', '..#...', '.#.##.', '#...#.', '...###'] },
  '¾': { rows: ['##..#.', '.#.#..', '##.#..', '..#...', '.#.#.#', '#..###', '.....#'] },
  '¿': { rows: ['.#.', '...', '.#.', '.#.', '#..', '#.#', '.#.'] },
  Æ: { rows: ['.#####', '#.#...', '#.#...', '#.####', '#.#...', '#.#...', '#.####'] },
  Ð: { rows: ['.####.', '.#...#', '.#...#', '####.#', '.#...#', '.#...#', '.####.'] },
  '×': { rows: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], lift: 1 },
  Ø: { rows: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'] },
  Þ: { rows: ['#....', '####.', '#...#', '#...#', '####.', '#....', '#....'] },
  ß: { rows: ['.##.', '#..#', '#..#', '#.#.', '#..#', '#..#', '#.##'] },
  æ: { rows: ['.#####', '#.#..#', '#.####', '#.#...', '.#####'] },
  ð: { rows: ['..##.', '.##..', '#####', '#...#', '#...#', '#...#', '.###.'] },
  '÷': { rows: ['..#..', '.....', '#####', '.....', '..#..'], lift: 1 },
  ø: { rows: ['.###.', '#..##', '#.#.#', '##..#', '.###.'] },
  þ: { rows: ['#...', '#...', '###.', '#..#', '#..#', '###.', '#...', '#...'], descend: 1 },
  ı: { rows: ['#', '#', '#', '#', '#'] },

  // ---------------------------------------------------------------------
  // Outside Latin-1, but German prose needs them: the low-high quote pair,
  // the dashes and the ellipsis item flavour text (#58) is written with.
  // ---------------------------------------------------------------------

  '‚': { rows: ['.#', '#.'], descend: 1 },
  '„': { rows: ['.#.#', '#.#.'], descend: 1 },
  '‘': { rows: ['.#', '#.'], lift: 5 },
  '’': { rows: ['#.', '.#'], lift: 5 },
  '“': { rows: ['.#.#', '#.#.'], lift: 5 },
  '”': { rows: ['#.#.', '.#.#'], lift: 5 },
  '–': { rows: ['#####'], lift: 3 },
  '—': { rows: ['#######'], lift: 3 },
  '…': { rows: ['#.#.#'] },
  '€': { rows: ['..###', '.#...', '####.', '.#...', '####.', '.#...', '..###'] },
  '‰': {
    rows: ['##...#.', '##..#..', '...#...', '..#.##.', '.#..##.', '#....##', '.....##'],
  },
  '→': { rows: ['..#..', '...#.', '#####', '...#.', '..#..'], lift: 1 },
  '←': { rows: ['..#..', '.#...', '#####', '.#...', '..#..'], lift: 1 },

  /**
   * The glyph a character with no bitmap of its own draws as — an empty box,
   * loud enough to be noticed in a screenshot and quiet enough not to be
   * mistaken for a letter. `docs/DECISIONS.md` #19's "a content gap degrades
   * gracefully, and still fails loudly in CI": this is the graceful half,
   * `tests/unit/ui-font.test.ts`'s coverage check is the loud one.
   */
  '�': { rows: ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'] },
};

/** The name of the mark a composed glyph carries. */
export type MarkName = 'dieresis' | 'acute' | 'grave' | 'circumflex' | 'tilde' | 'ring' | 'cedilla';

export const MARKS: Readonly<Record<string, MarkSource>> = {
  /** The one German needs. One row, so it always keeps its clear row. */
  dieresis: { rows: ['#.#'] },
  acute: { rows: ['..#'] },
  grave: { rows: ['#..'] },
  /** Two rows: a one-pixel caret would be a dot, and a dot is the dieresis's job. Tight, because two rows plus clearance is three the 10-row cell has not got. */
  circumflex: { rows: ['.#.', '#.#'], tight: true },
  tilde: { rows: ['.##', '##.'], tight: true },
  /** A closed block rather than a caret with legs — the one shape the circumflex cannot be mistaken for at this size. */
  ring: { rows: ['##', '##'], tight: true },
  cedilla: { rows: ['.#.'], below: true },
};

/**
 * Every accented Latin-1 letter, as a base plus a mark.
 *
 * `Ì`-`Ï` and `ì`-`ï` compose over the dotless forms (`I`, `ı`) rather than
 * over `i`, because a mark stacked on top of a title dot is two dots too many.
 */
export const COMPOSED_GLYPHS: Readonly<Record<string, ComposedGlyph>> = {
  À: { base: 'A', mark: 'grave' },
  Á: { base: 'A', mark: 'acute' },
  Â: { base: 'A', mark: 'circumflex' },
  Ã: { base: 'A', mark: 'tilde' },
  Ä: { base: 'A', mark: 'dieresis' },
  Å: { base: 'A', mark: 'ring' },
  Ç: { base: 'C', mark: 'cedilla' },
  È: { base: 'E', mark: 'grave' },
  É: { base: 'E', mark: 'acute' },
  Ê: { base: 'E', mark: 'circumflex' },
  Ë: { base: 'E', mark: 'dieresis' },
  Ì: { base: 'I', mark: 'grave' },
  Í: { base: 'I', mark: 'acute' },
  Î: { base: 'I', mark: 'circumflex' },
  Ï: { base: 'I', mark: 'dieresis' },
  Ñ: { base: 'N', mark: 'tilde' },
  Ò: { base: 'O', mark: 'grave' },
  Ó: { base: 'O', mark: 'acute' },
  Ô: { base: 'O', mark: 'circumflex' },
  Õ: { base: 'O', mark: 'tilde' },
  Ö: { base: 'O', mark: 'dieresis' },
  Ù: { base: 'U', mark: 'grave' },
  Ú: { base: 'U', mark: 'acute' },
  Û: { base: 'U', mark: 'circumflex' },
  Ü: { base: 'U', mark: 'dieresis' },
  Ý: { base: 'Y', mark: 'acute' },
  à: { base: 'a', mark: 'grave' },
  á: { base: 'a', mark: 'acute' },
  â: { base: 'a', mark: 'circumflex' },
  ã: { base: 'a', mark: 'tilde' },
  ä: { base: 'a', mark: 'dieresis' },
  å: { base: 'a', mark: 'ring' },
  ç: { base: 'c', mark: 'cedilla' },
  è: { base: 'e', mark: 'grave' },
  é: { base: 'e', mark: 'acute' },
  ê: { base: 'e', mark: 'circumflex' },
  ë: { base: 'e', mark: 'dieresis' },
  ì: { base: 'ı', mark: 'grave' },
  í: { base: 'ı', mark: 'acute' },
  î: { base: 'ı', mark: 'circumflex' },
  ï: { base: 'ı', mark: 'dieresis' },
  ñ: { base: 'n', mark: 'tilde' },
  ò: { base: 'o', mark: 'grave' },
  ó: { base: 'o', mark: 'acute' },
  ô: { base: 'o', mark: 'circumflex' },
  õ: { base: 'o', mark: 'tilde' },
  ö: { base: 'o', mark: 'dieresis' },
  ù: { base: 'u', mark: 'grave' },
  ú: { base: 'u', mark: 'acute' },
  û: { base: 'u', mark: 'circumflex' },
  ü: { base: 'u', mark: 'dieresis' },
  ý: { base: 'y', mark: 'acute' },
  ÿ: { base: 'y', mark: 'dieresis' },
};

/** `BitmapText`'s `fontFamily` for the text face. */
export const UI_FONT_FAMILY = 'kellerbier';

/** The text face: everything read at 1:1 — HUD labels, prices, prompts, body copy. */
export const TEXT_FONT: PixelFontSource = {
  family: UI_FONT_FAMILY,
  metrics: {
    cellHeight: CELL_HEIGHT,
    baselineRow: BASELINE_ROW,
    capTopRow: CAP_TOP_ROW,
    xTopRow: X_TOP_ROW,
    letterSpacing: LETTER_SPACING,
    lineAdvance: LINE_ADVANCE,
    markClearance: 1,
  },
  glyphs: BASE_GLYPHS,
  marks: MARKS,
  composed: COMPOSED_GLYPHS,
  notdef: '\ufffd',
};
