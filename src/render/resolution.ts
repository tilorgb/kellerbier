/**
 * Internal resolution and integer scaling.
 *
 * The simulation and every sprite live in a fixed 640x360 pixel space. The window
 * is whatever the window is. The canvas backing store stays at the internal size,
 * and the *element* is scaled by a whole number, so one game pixel is always an
 * exact NxN block of screen pixels. Non-integer scaling on 32px tiles produces
 * uneven pixel widths and the art direction falls apart, so this is a hard rule
 * rather than a preference.
 */

export const INTERNAL_WIDTH = 640;
export const INTERNAL_HEIGHT = 360;

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
