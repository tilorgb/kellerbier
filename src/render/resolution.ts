/**
 * Internal resolution and integer scaling.
 *
 * The simulation and every sprite live in a fixed 640x360 pixel space. The
 * canvas is the size of the window, and the *game* inside it is scaled by a
 * whole number of device pixels, so one game pixel is always an exact NxN block
 * of screen pixels. Non-integer scaling on 32px tiles produces uneven pixel
 * widths and the art direction falls apart, so this is a hard rule rather than
 * a preference.
 *
 * The canvas is full-size rather than 640x360-and-stretched because the game is
 * not the only thing drawn on it. Debug panels, and later the menus, are text,
 * and text rendered into a 640x360 buffer has eight pixels of glyph height to
 * work with however large the window is. Those layers are drawn outside the
 * scaled container, at the display's own resolution.
 */

export const INTERNAL_WIDTH = 640;
export const INTERNAL_HEIGHT = 360;

/**
 * Whole-number zoom the room is drawn at.
 *
 * The room is authored in half the internal resolution and blown up by this,
 * which is what decides how large the player reads against the space they are
 * dodging in: a body of a fixed pixel size covers twice as much of a room half
 * the size. At 1x the player was a fortieth of the room's width and the room
 * felt enormous; at 2x they are a twentieth, which is roughly where the genre
 * sits.
 *
 * Whole-number for the same reason the canvas scale is: a sprite drawn at 1.5x
 * has some pixels one screen pixel wide and some two, and pixel art stops
 * reading as pixel art. `PLAYFIELD_WIDTH * WORLD_ZOOM === INTERNAL_WIDTH` is
 * pinned by a test.
 */
export const WORLD_ZOOM = 2;

export interface Viewport {
  /** Whole-number scale factor applied to the canvas element. */
  readonly scale: number;
  /** On-screen size of the scaled canvas, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Letterbox bars left over on each axis, in CSS pixels. */
  readonly letterboxX: number;
  readonly letterboxY: number;
}

/**
 * Largest whole-number scale at which the internal resolution still fits the
 * window, floored at 1 — a window smaller than 640x360 crops rather than
 * producing a blurry sub-pixel scale.
 */
export function computeViewport(
  windowWidth: number,
  windowHeight: number,
  internalWidth: number = INTERNAL_WIDTH,
  internalHeight: number = INTERNAL_HEIGHT,
): Viewport {
  const fit = Math.min(windowWidth / internalWidth, windowHeight / internalHeight);
  const scale = Math.max(1, Math.floor(fit));
  const width = internalWidth * scale;
  const height = internalHeight * scale;
  return {
    scale,
    width,
    height,
    letterboxX: Math.max(0, windowWidth - width),
    letterboxY: Math.max(0, windowHeight - height),
  };
}

/**
 * Where the scaled game sits inside a full-window canvas.
 *
 * Everything here is in CSS pixels, because that is the space Pixi's stage is
 * in when the renderer is told the display's pixel ratio. The whole-number
 * constraint is applied in *device* pixels and then converted back, which is
 * the only ordering that actually holds: a scale that is a whole number of CSS
 * pixels on a 1.5x display is one and a half device pixels, and the art is
 * being resampled again.
 */
export interface GameLayout {
  /** Scale to apply to the game container, in CSS pixels. */
  readonly scale: number;
  /** Top-left of the game inside the canvas, in CSS pixels. */
  readonly originX: number;
  readonly originY: number;
}

export function computeGameLayout(
  windowWidth: number,
  windowHeight: number,
  pixelRatio = 1,
): GameLayout {
  const ratio = pixelRatio > 0 ? pixelRatio : 1;
  const viewport = computeViewport(windowWidth * ratio, windowHeight * ratio);
  return {
    scale: viewport.scale / ratio,
    originX: Math.round(viewport.letterboxX / 2) / ratio,
    originY: Math.round(viewport.letterboxY / 2) / ratio,
  };
}
