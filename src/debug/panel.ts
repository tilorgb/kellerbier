import { BitmapText, Container, Graphics } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import type { FrameMetrics } from './metrics.js';
import type { DrawCallCounter } from './draw-calls.js';

/**
 * Everything a panel is allowed to look at.
 *
 * Passed in rather than reached for, so a panel added by a later issue — the
 * stat inspector in #25, the room warp in #20, the item spawner in #29, the
 * Promille slider in #17 — declares what it needs by using it, and adding one
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

export const PANEL_WIDTH = 168;
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
  heading.position.set(4, 3);
  container.addChild(heading);

  return container;
}

/**
 * A line of overlay text.
 *
 * `BitmapText` rather than `Text`: the overlay rewrites most of its lines every
 * frame, and a `Text` regenerates its texture whenever the string changes. An
 * overlay that costs a dozen texture uploads a frame is an overlay that changes
 * the timings it exists to report.
 */
export function createLabel(text: string, colour: number = PANEL_TEXT_COLOUR): BitmapText {
  return new BitmapText({
    text,
    style: { fontFamily: 'monospace', fontSize: 8, fill: colour },
  });
}
