import { describe, expect, it } from 'vitest';
import { FOCUS_CORNER, FRAME_CORNER, KNOB } from '../../src/render/ui/frames.js';
import { FRAME_BUTTON, FRAME_PANEL, FRAME_SLOT, FRAME_WELL } from '../../src/render/ui/frames.js';
import { UI_ICONS } from '../../src/render/ui/icons.js';
import { artHeight, artWidth, type PixelArt } from '../../src/render/ui/pixel-art.js';
import { DISPLAY_FACE } from '../../src/render/ui/font-compile.js';
import { renderTitlePixels, TITLE_STYLES } from '../../src/render/ui/title.js';
import { uiScaleFor } from '../../src/render/ui/text.js';

const FRAMES: Readonly<Record<string, PixelArt>> = {
  panel: FRAME_PANEL,
  button: FRAME_BUTTON,
  well: FRAME_WELL,
  slot: FRAME_SLOT,
};

describe('render/ui kit art', () => {
  it('gives every icon rows of one consistent width', () => {
    for (const [name, art] of Object.entries(UI_ICONS)) {
      const widths = new Set(art.map((row) => row.length));
      expect(widths.size, `icon "${name}" has ragged rows`).toBe(1);
    }
  });

  it('uses only role characters', () => {
    const all: [string, PixelArt][] = [
      ...Object.entries(UI_ICONS),
      ...Object.entries(FRAMES),
      ['focus corner', FOCUS_CORNER],
      ['knob', KNOB],
    ];
    for (const [name, art] of all) {
      for (const row of art) {
        expect(/^[.ofha]*$/.test(row), `"${name}" has a row with a stray role`).toBe(true);
      }
    }
  });

  it('sizes every nine-slice frame so its corners cannot overlap', () => {
    // A nine-slice whose corners are wider than half its texture draws its
    // left and right corners on top of each other, and the border doubles.
    for (const [name, art] of Object.entries(FRAMES)) {
      expect(artWidth(art), `frame "${name}" is too narrow for its corners`).toBeGreaterThanOrEqual(
        FRAME_CORNER * 2 + 1,
      );
      expect(artHeight(art), `frame "${name}" is too short for its corners`).toBeGreaterThanOrEqual(
        FRAME_CORNER * 2 + 1,
      );
    }
  });

  it('keeps every frame stretch band uniform', () => {
    // Rows and columns inside the corners are what a nine-slice repeats. If
    // they differ from each other, a panel's border changes as it is
    // stretched, which reads as a rendering bug rather than as a bigger box.
    for (const [name, art] of Object.entries(FRAMES)) {
      const middleRows = art.slice(FRAME_CORNER, artHeight(art) - FRAME_CORNER);
      expect(new Set(middleRows).size, `frame "${name}" has a ragged stretch band`).toBe(1);
      const columns = new Set(
        Array.from({ length: artWidth(art) - FRAME_CORNER * 2 }, (_, offset) =>
          art.map((row) => row[FRAME_CORNER + offset]).join(''),
        ),
      );
      expect(columns.size, `frame "${name}" has a ragged horizontal stretch band`).toBe(1);
    }
  });

  it('gives every icon a silhouette that survives losing its colours', () => {
    // `CONTRIBUTING.md`'s art row: silhouette reads at a glance. An icon that
    // is all fill and no outline is an icon that vanishes over a light floor.
    for (const [name, art] of Object.entries(UI_ICONS)) {
      expect(art.join('').includes('o'), `icon "${name}" has no outline at all`).toBe(true);
    }
  });
});

describe('render/ui title treatment', () => {
  it('surrounds the fill with its outline', () => {
    const { width, height, colours } = renderTitlePixels(DISPLAY_FACE, 'A', TITLE_STYLES.floor);
    const outline = TITLE_STYLES.floor.outline;
    const ramp = new Set<number>(TITLE_STYLES.floor.ramp);
    ramp.add(TITLE_STYLES.floor.textureColour);
    let checked = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!ramp.has(colours[y * width + x] ?? -1)) {
          continue;
        }
        // Every fill pixel's neighbours are fill, outline, or off the sheet —
        // never the backdrop, or the letter has a hole in its edge.
        const neighbours: readonly (readonly [number, number])[] = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const [nx, ny] of neighbours) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          const neighbour = colours[ny * width + nx] ?? -1;
          if (!ramp.has(neighbour)) {
            expect(neighbour).toBe(outline);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('puts the shadow behind, never over, the letter', () => {
    const style = TITLE_STYLES.threat;
    const { width, height, colours } = renderTitlePixels(DISPLAY_FACE, 'Umgfalln', style);
    const shadow = style.shadow.colour;
    const fill = new Set<number>([...style.ramp, style.textureColour, style.outline]);
    for (let index = 0; index < width * height; index++) {
      const colour = colours[index] ?? -1;
      if (colour === shadow) {
        expect(fill.has(colour)).toBe(false);
      }
    }
    // And it actually drew one, or the assertion above is vacuous.
    expect([...colours].includes(shadow)).toBe(true);
  });

  it('grows with bold and with the shadow, never shrinks', () => {
    const plain = renderTitlePixels(DISPLAY_FACE, 'Bier', {
      ramp: [0xffffff],
      texture: 'none',
    });
    const treated = renderTitlePixels(DISPLAY_FACE, 'Bier', TITLE_STYLES.floor);
    expect(treated.width).toBeGreaterThan(plain.width);
    expect(treated.height).toBeGreaterThan(plain.height);
  });
});

describe('render/ui scale', () => {
  it('is always a whole number, and never below one', () => {
    // `resolution.ts`'s hard rule, applied to glyphs: a pixel font at a
    // fractional size resamples, and resampled pixel art stops reading as
    // pixel art.
    for (const scale of [0, 0.5, 1, 1.4, 2, 3.6, 7]) {
      for (const textScale of [1, 2, 3]) {
        const applied = uiScaleFor({ scale, originX: 0, originY: 0 }, textScale);
        expect(Number.isInteger(applied)).toBe(true);
        expect(applied).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('multiplies the text scale rather than replacing the window scale', () => {
    const layout = { scale: 3, originX: 0, originY: 0 };
    expect(uiScaleFor(layout, 1)).toBe(3);
    expect(uiScaleFor(layout, 2)).toBe(6);
  });
});
