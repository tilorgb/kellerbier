import { describe, expect, it } from 'vitest';
import { TEXT_FACE } from '../../src/render/ui/font-compile.js';
import {
  parseSeasoned,
  renderSeasonedPixels,
  seasonedTextWidth,
  stripSeasoning,
} from '../../src/render/ui/text.js';

describe('render/ui seasoned text (#221)', () => {
  it('splits a *word*-marked line into plain and accented runs', () => {
    expect(parseSeasoned('Watch your *Fiaß*')).toEqual([
      { text: 'Watch your ', accent: false },
      { text: 'Fiaß', accent: true },
    ]);
  });

  it('handles no markers, markers at either end, and more than one run', () => {
    expect(parseSeasoned('Plain line')).toEqual([{ text: 'Plain line', accent: false }]);
    expect(parseSeasoned('*Prost*, cheers')).toEqual([
      { text: 'Prost', accent: true },
      { text: ', cheers', accent: false },
    ]);
    expect(parseSeasoned('the *Keller* has a *Geist*')).toEqual([
      { text: 'the ', accent: false },
      { text: 'Keller', accent: true },
      { text: ' has a ', accent: false },
      { text: 'Geist', accent: true },
    ]);
  });

  it('leaves an unmatched marker as a literal character', () => {
    expect(parseSeasoned('a stray * here')).toEqual([{ text: 'a stray * here', accent: false }]);
  });

  it('strips markers back to the plain string', () => {
    expect(stripSeasoning('Watch your *Fiaß*')).toBe('Watch your Fiaß');
    expect(stripSeasoning('no markers here')).toBe('no markers here');
  });

  it('measures the same as the unmarked text, markers costing nothing', () => {
    expect(seasonedTextWidth('Watch your *Fiaß*')).toBe(TEXT_FACE.measure('Watch your Fiaß'));
  });

  it('rasterises at the exact pen position a single uiText would use', () => {
    const marked = renderSeasonedPixels('Watch your *Fiaß*', 0x111111, 0x222222);
    const plain = renderSeasonedPixels('Watch your Fiaß', 0x111111, 0x111111);
    expect(marked.width).toBe(plain.width);
    expect(marked.height).toBe(plain.height);
    // Every inked pixel lands in the same place either way — only the colour differs.
    for (let index = 0; index < plain.colours.length; index++) {
      const markedInked = (marked.colours[index] ?? -1) >= 0;
      const plainInked = (plain.colours[index] ?? -1) >= 0;
      expect(markedInked).toBe(plainInked);
    }
  });

  it('colours only the marked run with the accent colour', () => {
    const { colours, width, height } = renderSeasonedPixels(
      'Watch your *Fiaß*',
      0x111111,
      0x222222,
    );
    const prefixWidth = TEXT_FACE.measure('Watch your ');
    let sawPlain = false;
    let sawAccent = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const colour = colours[y * width + x];
        if (colour === undefined || colour < 0) {
          continue;
        }
        if (x < prefixWidth) {
          expect(colour).toBe(0x111111);
          sawPlain = true;
        } else {
          expect(colour).toBe(0x222222);
          sawAccent = true;
        }
      }
    }
    expect(sawPlain).toBe(true);
    expect(sawAccent).toBe(true);
  });

  it('rasterises the empty string as a zero-width, fully transparent line', () => {
    const { width, colours } = renderSeasonedPixels('', 0x111111, 0x222222);
    expect(width).toBe(0);
    expect([...colours].every((colour) => colour === -1)).toBe(true);
  });
});
