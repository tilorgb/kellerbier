import { describe, expect, it } from 'vitest';
import { DISPLAY_FACE, TEXT_FACE, type PixelFace } from '../../src/render/ui/font-compile.js';
import { BASE_GLYPHS, COMPOSED_GLYPHS, MARKS } from '../../src/render/ui/font-data.js';

/** Every printable Latin-1 codepoint: ASCII up to `~`, then the supplement from NBSP. */
function latin1(): string[] {
  const characters: string[] = [];
  for (let code = 0x20; code <= 0x7e; code++) {
    characters.push(String.fromCodePoint(code));
  }
  for (let code = 0xa0; code <= 0xff; code++) {
    characters.push(String.fromCodePoint(code));
  }
  return characters;
}

/** The characters German and Boarisch actually need beyond ASCII. */
const GERMAN = 'ÄÖÜäöüß„“–—…‰'.split('');

const FACES: readonly (readonly [string, PixelFace])[] = [
  ['text', TEXT_FACE],
  ['display', DISPLAY_FACE],
];

describe('render/ui font data', () => {
  it('gives every glyph rows of one consistent width', () => {
    // A ragged glyph is the easiest mistake to make in this format and the
    // hardest to see: the atlas packs it at its widest row, and the short rows
    // simply lose their last pixel.
    for (const [character, source] of Object.entries(BASE_GLYPHS)) {
      const widths = new Set(source.rows.map((row) => row.length));
      expect(widths.size, `"${character}" has ragged rows`).toBeLessThanOrEqual(1);
    }
    for (const [name, mark] of Object.entries(MARKS)) {
      const widths = new Set(mark.rows.map((row) => row.length));
      expect(widths.size, `mark "${name}" has ragged rows`).toBeLessThanOrEqual(1);
    }
  });

  it('uses only ink and clear characters', () => {
    for (const [character, source] of Object.entries(BASE_GLYPHS)) {
      for (const row of source.rows) {
        expect(/^[#.]*$/.test(row), `"${character}" has a row with a stray character`).toBe(true);
      }
    }
  });

  it('composes every accented Latin-1 letter rather than drawing it', () => {
    // The point of reserving a diacritic band: 54 letters that would each
    // otherwise be a hand-drawn bitmap, and each an opportunity to put the
    // dots a pixel off.
    for (const character of latin1()) {
      const decomposed = character.normalize('NFD');
      if (decomposed.length < 2) {
        continue;
      }
      expect(
        Object.hasOwn(COMPOSED_GLYPHS, character),
        `"${character}" should be composed, not drawn`,
      ).toBe(true);
    }
  });
});

describe.each(FACES)('render/ui %s face', (name, face) => {
  it('draws every printable Latin-1 character', () => {
    const missing = latin1().filter((character) => !face.has(character));
    expect(missing, `${name} face is missing ${String(missing.length)} character(s)`).toEqual([]);
  });

  it('draws the characters German and Boarisch need', () => {
    for (const character of GERMAN) {
      expect(face.has(character), `${name} face cannot draw "${character}"`).toBe(true);
    }
  });

  it('keeps every glyph inside its own cell', () => {
    // The loud half of `docs/DECISIONS.md` #19: a glyph whose mark hangs off
    // the top of the cell would be silently clipped by the atlas rather than
    // reported, and would look merely "a bit thin" on screen.
    for (const character of face.characters()) {
      const glyph = face.glyph(character);
      expect(glyph.top, `"${character}" starts above its cell`).toBeGreaterThanOrEqual(0);
      expect(
        glyph.top + glyph.rows.length,
        `"${character}" runs past the bottom of its cell`,
      ).toBeLessThanOrEqual(face.metrics.cellHeight);
    }
  });

  it('sits every unaccented capital on the baseline, at the cap height', () => {
    for (const character of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const glyph = face.glyph(character);
      expect(glyph.top, `"${character}" does not start at the cap line`).toBe(
        face.metrics.capTopRow,
      );
      expect(glyph.top + glyph.rows.length - 1, `"${character}" is off the baseline`).toBe(
        face.metrics.baselineRow,
      );
    }
  });

  it('leaves a clear row between a dieresis and the letter under it', () => {
    // The decision the whole face is shaped around (`docs/DECISIONS.md` #42).
    // Dots resting on `A`'s apex merge into it at this size, and `Ä` is a
    // letter rather than a decorated `A`.
    const pairs = [
      ['Ä', 'A'],
      ['Ö', 'O'],
      ['Ü', 'U'],
      ['ä', 'a'],
      ['ö', 'o'],
      ['ü', 'u'],
    ] as const;
    for (const [accented, base] of pairs) {
      const glyph = face.glyph(accented);
      const plain = face.glyph(base);
      const clearRowIndex = plain.top - glyph.top - 1;
      const clearRow = glyph.rows[clearRowIndex];
      expect(clearRow, `"${accented}" has no row where its clearance should be`).toBeDefined();
      expect(clearRow, `"${accented}" has its dots resting on the letter`).not.toContain('#');
    }
  });

  it('measures a string as the sum of its advances, less the trailing space', () => {
    const width = face.measure('Maß');
    const expected =
      face.glyph('M').advance +
      face.glyph('a').advance +
      face.glyph('ß').advance -
      face.metrics.letterSpacing;
    expect(width).toBe(expected);
  });

  it('measures the empty string as nothing and a multi-line string as its widest line', () => {
    expect(face.measure('')).toBe(0);
    expect(face.measure('Maß\nMaßkrug')).toBe(face.measure('Maßkrug'));
    expect(face.measureHeight('a\nb\nc')).toBe(
      face.metrics.cellHeight + 2 * face.metrics.lineAdvance,
    );
  });

  it('draws the missing-glyph box for a character nobody authored', () => {
    // Graceful, per `docs/DECISIONS.md` #19 — a string with a character the
    // face has never seen shows a box rather than taking the frame down.
    const box = face.glyph('\u{1f600}');
    expect(box.rows.length).toBeGreaterThan(0);
    expect(box.rows.join('')).toContain('#');
  });
});

describe('render/ui display face', () => {
  it('borrows from the text face rather than showing a box', () => {
    // A display face legitimately needs fewer characters than a text face —
    // nothing writes a paragraph in Fraktur — but a heading that hits one of
    // them must show a letter.
    expect(DISPLAY_FACE.has('§')).toBe(true);
    expect(DISPLAY_FACE.glyph('§').rows).not.toEqual(DISPLAY_FACE.glyph('�').rows);
  });

  it('seats a borrowed glyph on its own baseline rather than the text face one', () => {
    // A glyph reseated wrongly would float or sink by the difference between
    // the two faces' baselines, which is five rows.
    const borrowed = DISPLAY_FACE.glyph('§');
    expect(borrowed.top + borrowed.rows.length - 1).toBe(DISPLAY_FACE.metrics.baselineRow);
  });

  it('is drawn much larger than the text face', () => {
    const capHeight = (face: PixelFace): number =>
      face.metrics.baselineRow - face.metrics.capTopRow + 1;
    expect(capHeight(DISPLAY_FACE)).toBeGreaterThan(capHeight(TEXT_FACE) + 3);
  });
});
