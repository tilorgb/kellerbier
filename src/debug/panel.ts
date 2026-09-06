import { BitmapText, Container, Graphics } from '../render/gfx/index.js';
import { UI_FONT_FAMILY } from '../render/ui/font.js';
import { UI_LINE_HEIGHT, UI_TEXT_HEIGHT } from '../render/ui/text.js';
import type { GameSim } from '../sim/game/sim.js';
import type { FrameMetrics } from './metrics.js';
import type { DrawCallCounter } from './draw-calls.js';

/**
 * Everything a panel is allowed to look at.
 *
 * Passed in rather than reached for, so a panel added by a later issue — the
 * stat inspector (#25), the room warp (#20), the item spawner (#29), the
 * Promille slider (#17) — declares what it needs by using it, and adding one
 * is writing a class rather than wiring anything up.
 */
export interface DebugContext {
  readonly sim: GameSim;
  readonly metrics: FrameMetrics;
  readonly drawCalls: DrawCallCounter;
  /** Fraction of a tick elapsed, so a panel can draw interpolated things. */
  readonly alpha: number;
  /** Frames rendered since the overlay opened. Panels use it to throttle. */
  readonly frame: number;
}

export interface DebugPanel {
  readonly title: string;
  /** The panel's own display object. The overlay positions it. */
  readonly view: Container;
  /** Height the overlay should reserve, in pixels. */
  readonly height: number;
  update(context: DebugContext): void;
}

/**
 * Panel geometry, in UI pixels.
 *
 * UI pixels — the internal 640×360 frame — because that is the only frame
 * there is now: the canvas *is* the internal resolution and CSS scales it up
 * (`render/app.ts`), so a panel drawn at display resolution is no longer a
 * thing a renderer here could do. The panels used to be sized in screen pixels
 * for a 13px system monospace; they are now set in the pixel text face at 1:1,
 * which is the one size it is crisp at, and laid out against 640×360. That
 * makes a panel a larger share of the frame than it was on a big window, and
 * the layout wraps into columns accordingly (`DebugOverlay.layOutPanels`).
 *
 * The face is proportional, so `padEnd` alignment in a panel is approximate
 * rather than exact — most glyphs are four or five columns, and a column of
 * numbers still reads as one.
 */
export const PANEL_WIDTH = 176;
export const PANEL_FONT_SIZE = UI_TEXT_HEIGHT;
/** Baseline spacing between lines of panel text. */
export const PANEL_LINE_HEIGHT = UI_LINE_HEIGHT;
/** Where a panel's first line of content starts, below its title. */
export const PANEL_CONTENT_TOP = 18;
export const PANEL_PADDING = 4;
export const PANEL_TEXT_COLOUR = 0xd8cfc4;
export const PANEL_DIM_COLOUR = 0x8a7f74;
export const PANEL_WARN_COLOUR = 0xe0703a;
const PANEL_BACKGROUND = 0x120f16;
const PANEL_BORDER = 0x2e2637;

/** The panel chrome: a dark plate with a title, drawn once. */
export function createPanelFrame(title: string, height: number): Container {
  const container = new Container();

  const plate = new Graphics();
  plate
    .rect(0, 0, PANEL_WIDTH, height)
    .fill({ color: PANEL_BACKGROUND, alpha: 0.94 })
    .stroke({ width: 1, color: PANEL_BORDER, alignment: 0 });
  container.addChild(plate);

  const heading = createLabel(title, PANEL_DIM_COLOUR);
  heading.position.set(PANEL_PADDING, 4);
  container.addChild(heading);

  return container;
}

/**
 * A line of overlay text.
 *
 * `BitmapText` in the game's own pixel text face: the overlay rewrites most of
 * its lines every frame, and a bitmap label is a handful of quads into an atlas
 * that already exists — no texture is generated when the string changes. An
 * overlay that costs a dozen texture uploads a frame is an overlay that changes
 * the timings it exists to report. (The face has to be installed before the
 * overlay mounts — `installPixelFonts()` at boot, which the HUD needs anyway.)
 */
export function createLabel(text: string, colour: number = PANEL_TEXT_COLOUR): BitmapText {
  return new BitmapText({
    text,
    style: { fontFamily: UI_FONT_FAMILY, fontSize: PANEL_FONT_SIZE, fill: colour },
  });
}
