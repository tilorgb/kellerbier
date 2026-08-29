import { BitmapText } from 'pixi.js';
import type { GameLayout } from '../resolution.js';
import { UI_PALETTE } from '../palette.js';
import { DISPLAY_FACE, TEXT_FACE } from './font-compile.js';
import { pixelFontsInstalled } from './font.js';

/**
 * Making text with the pixel font, and the one number every HUD lays itself
 * out in.
 *
 * ## UI pixels
 *
 * Everything in `render/ui/` and every HUD component measures itself in **UI
 * pixels** — the font's own cell is 10 of them, an icon is 8-11, a margin is 8
 * — and `app/main.ts` scales the whole `uiLayer` by `uiScaleFor(layout)`, a
 * whole number. So a HUD component never asks how big the window is; it lays
 * out once, in one unit, and the scale happens above it.
 *
 * This replaced a HUD sized in *screen* pixels at a fixed 9-13px, whose own
 * comment argued that a fixed size kept icons from going blocky. That was true
 * of a generated icon and untrue of the game: at 3× the HUD was a third of the
 * size it is at 1×, and the text was drawn in whatever `monospace` meant on
 * that machine. A whole-number scale on a pixel font is crisp *and* constant
 * relative to the frame, which is the pair the old arrangement could not have.
 *
 * ## Why the scale is whole
 *
 * `resolution.ts`'s hard rule — never a fractional scale, because a sprite
 * drawn at 1.5× has some pixels one screen pixel wide and some two — applies
 * to a glyph exactly as it applies to a tile. It is also what makes #53's text
 * scaling cheap: the setting moves an integer, so a larger UI is the same font
 * bigger rather than a different, resampled one.
 */

/** The height of one line of UI text, in UI pixels. */
export const UI_TEXT_HEIGHT = TEXT_FACE.metrics.cellHeight;

/** Baseline-to-baseline distance for multi-line UI text, in UI pixels. */
export const UI_LINE_HEIGHT = TEXT_FACE.metrics.lineAdvance;

/** The height of one line of display text, in UI pixels. */
export const DISPLAY_TEXT_HEIGHT = DISPLAY_FACE.metrics.cellHeight;

/** How wide `text` draws in the text face, in UI pixels. Exact, and needs no renderer. */
export function uiTextWidth(text: string): number {
  return TEXT_FACE.measure(text);
}

/** How tall `text` draws in the text face, in UI pixels, counting its newlines. */
export function uiTextHeight(text: string): number {
  return TEXT_FACE.measureHeight(text);
}

/** How wide `text` draws in the display face, in UI pixels. */
export function displayTextWidth(text: string): number {
  return DISPLAY_FACE.measure(text);
}

/**
 * The whole-number scale the UI layer is drawn at for a given game layout.
 *
 * Tied to the game's own integer zoom rather than computed separately, so the
 * HUD covers the same fraction of the frame at every window size — a 640×360
 * window and a 2560×1440 one show the same HUD, four times the device pixels.
 *
 * `textScale` is #53's seam: a whole-number multiplier a player can raise for
 * a larger UI. It multiplies rather than replacing, so "bigger text" cannot
 * produce a fractional scale however the two combine.
 */
export function uiScaleFor(layout: GameLayout, textScale = 1): number {
  return Math.max(1, Math.round(layout.scale)) * Math.max(1, Math.round(textScale));
}

export interface UiTextOptions {
  /** Defaults to `UI_PALETTE.text`. */
  readonly colour?: number;
  readonly align?: 'left' | 'center' | 'right';
  /** Wrap width in UI pixels. Omitted means no wrapping. */
  readonly wrapWidth?: number;
}

let warnedMissingFont = false;

/**
 * A `BitmapText` in the pixel font, at 1:1 with the authored bitmaps.
 *
 * `BitmapText` rather than `Text` throughout the HUD, and not only for the
 * reason `damage-numbers.ts` already gives (a `Text` regenerates a texture
 * every time its string changes): a `Text` has no bitmap font to draw *from*,
 * so it would fall back to a system face and quietly undo the whole issue.
 */
export function uiText(text: string, options: UiTextOptions = {}): BitmapText {
  return makeText(
    TEXT_FACE.family,
    TEXT_FACE.metrics.cellHeight,
    TEXT_FACE.metrics.lineAdvance,
    text,
    options,
  );
}

/**
 * A `BitmapText` in the **display** face — the pixel Fraktur.
 *
 * For the things listed in `docs/DECISIONS.md` #44 and nothing else: the
 * title, a floor's name, a boss plate, the word a run ends on. A label, a
 * price or a button uses `uiText`. A broken script is beautiful and slow to
 * read, and the things a player reads under fire must be fast.
 */
export function displayText(text: string, options: UiTextOptions = {}): BitmapText {
  return makeText(
    DISPLAY_FACE.family,
    DISPLAY_FACE.metrics.cellHeight,
    DISPLAY_FACE.metrics.lineAdvance,
    text,
    options,
  );
}

function makeText(
  family: string,
  cellHeight: number,
  lineAdvance: number,
  text: string,
  options: UiTextOptions,
): BitmapText {
  if (import.meta.env.DEV && !pixelFontsInstalled() && !warnedMissingFont) {
    warnedMissingFont = true;
    // Pixi answers an unknown `fontFamily` by generating a font from the
    // browser's own face of that name — which silently produces exactly the
    // system-font HUD #154 exists to remove, and looks merely "a bit off"
    // rather than broken. Say so out loud instead.
    console.warn(
      'ui text: the pixel font is not installed — call installPixelFont(renderer) at boot, ' +
        'or every label here draws in a system font',
    );
  }
  return new BitmapText({
    text,
    style: {
      fontFamily: family,
      fontSize: cellHeight,
      fill: options.colour ?? UI_PALETTE.text,
      ...(options.align === undefined ? {} : { align: options.align }),
      ...(options.wrapWidth === undefined
        ? {}
        : { wordWrap: true, wordWrapWidth: options.wrapWidth, lineHeight: lineAdvance }),
    },
  });
}
