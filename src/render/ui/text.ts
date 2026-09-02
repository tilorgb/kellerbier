import { BitmapText, Sprite, type Renderer } from 'pixi.js';
import type { GameLayout } from '../resolution.js';
import { UI_PALETTE } from '../palette.js';
import { DISPLAY_FACE, TEXT_FACE } from './font-compile.js';
import { pixelFontsInstalled } from './font.js';
import { pixelsToTexture } from './title.js';

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

/**
 * One run of a `*word*`-marked flavour line: `text`, and whether it's the
 * one Bavarian word the line drops in.
 *
 * `docs/CONTENT_BIBLE.md` §0 (#221): flavour text carries its Bavarian as a
 * single seasoned word, not a translated sentence, and that word gets its
 * own type treatment so it reads as deliberate rather than as a typo. This
 * is the authoring seam that says *which* word — a content author wraps it
 * in asterisks (`'Watch your *Fiaß*'`) at the string, no rendering
 * knowledge required.
 */
export interface SeasonedRun {
  readonly text: string;
  readonly accent: boolean;
}

/**
 * Splits a `*word*`-marked line into runs. A `*` with no matching close is
 * left as an ordinary character — a stray marker degrades to "one odd
 * character in the line", not a broken screen (`docs/DECISIONS.md` #19).
 */
export function parseSeasoned(marked: string): readonly SeasonedRun[] {
  const runs: SeasonedRun[] = [];
  const pattern = /\*([^*]+)\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(marked)) !== null) {
    if (match.index > cursor) {
      runs.push({ text: marked.slice(cursor, match.index), accent: false });
    }
    runs.push({ text: match[1] ?? '', accent: true });
    cursor = pattern.lastIndex;
  }
  if (cursor < marked.length) {
    runs.push({ text: marked.slice(cursor), accent: false });
  }
  return runs;
}

/** `marked` with its `*...*` markers removed — the locale/measurement paths that don't draw them. */
export function stripSeasoning(marked: string): string {
  return marked.replace(/\*([^*]+)\*/g, '$1');
}

/** How wide a `seasonedText`/`SeasonedText` line draws, in UI pixels. The markers cost nothing. */
export function seasonedTextWidth(marked: string): number {
  return TEXT_FACE.measure(stripSeasoning(marked));
}

/** A rasterised two-colour line: one colour per pixel, `-1` where nothing is drawn. Single-line only. */
export interface SeasonedPixels {
  readonly width: number;
  readonly height: number;
  readonly colours: Int32Array;
}

/**
 * Rasterises a `*word*`-marked line in the text face: every character in its
 * run's colour, at the exact pen position a single `uiText` would have put
 * it. One `BitmapText` can only draw its whole string in one colour
 * (`makeText` above), so this is the "two colours, one line" primitive
 * #221 needs — built pure, the same no-renderer, no-DOM way `title.ts`'s
 * `renderTitlePixels` is, so a unit test can assert the accent run lands in
 * the right pixels without a `Renderer`.
 */
export function renderSeasonedPixels(
  marked: string,
  colour: number,
  accentColour: number,
): SeasonedPixels {
  const runs = parseSeasoned(marked);
  const height = TEXT_FACE.metrics.cellHeight;
  const placements: { rows: readonly string[]; top: number; colour: number; x: number }[] = [];
  let pen = 0;
  for (const run of runs) {
    const runColour = run.accent ? accentColour : colour;
    for (const character of run.text) {
      const glyph = TEXT_FACE.glyph(character);
      placements.push({ rows: glyph.rows, top: glyph.top, colour: runColour, x: pen });
      pen += glyph.advance;
    }
  }
  const width = Math.max(0, pen - TEXT_FACE.metrics.letterSpacing);
  const colours = new Int32Array(Math.max(1, width) * height).fill(-1);
  for (const placement of placements) {
    for (let row = 0; row < placement.rows.length; row++) {
      const line = placement.rows[row] ?? '';
      const y = placement.top + row;
      if (y < 0 || y >= height) {
        continue;
      }
      for (let column = 0; column < line.length; column++) {
        if (line[column] !== '#') {
          continue;
        }
        const x = placement.x + column;
        if (x < 0 || x >= width) {
          continue;
        }
        colours[y * width + x] = placement.colour;
      }
    }
  }
  return { width, height, colours };
}

export interface SeasonedTextOptions {
  /** Colour of the plain runs. Defaults to `UI_PALETTE.text`. */
  readonly colour?: number;
  /** Colour of the `*...*`-marked run(s). Defaults to `UI_PALETTE.accent`. */
  readonly accentColour?: number;
}

/**
 * A single-line `*word*`-marked string as a sprite, one colour on the plain
 * runs and another on the accented one — the floor title card's subtitle is
 * the first consumer (#221). Same rebuild-on-change lifecycle as
 * `DisplayTitle`, and for the same reason: this changes on an event, a
 * handful of times a run, never per frame.
 */
export class SeasonedText {
  readonly view = new Sprite();

  private readonly renderer: Renderer;
  private readonly colour: number;
  private readonly accentColour: number;
  private current = '';

  constructor(renderer: Renderer, options: SeasonedTextOptions = {}) {
    this.renderer = renderer;
    this.colour = options.colour ?? UI_PALETTE.text;
    this.accentColour = options.accentColour ?? UI_PALETTE.accent;
  }

  /** Sets the line. A repeat of the current text is a no-op. */
  set(text: string): void {
    if (text === this.current && this.view.texture.width > 1) {
      return;
    }
    this.current = text;
    this.rebuild();
  }

  private rebuild(): void {
    const previous = this.view.texture;
    const { width, height, colours } = renderSeasonedPixels(
      this.current,
      this.colour,
      this.accentColour,
    );
    this.view.texture = pixelsToTexture(this.renderer, width, height, colours);
    if (previous.width > 1) {
      previous.destroy(true);
    }
  }

  /** Width in UI pixels. */
  get width(): number {
    return this.view.texture.width;
  }

  /** Height in UI pixels. */
  get height(): number {
    return this.view.texture.height;
  }
}
