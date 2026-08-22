/** Scalar helpers shared by the simulation and by render-side interpolation. */

/** Linear interpolation. `t` is not clamped; callers pass an alpha in [0, 1). */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Length of a 2D vector.
 *
 * `Math.hypot` rather than this would be the obvious choice, and is the wrong
 * one here: it is variadic, so V8 builds an arguments object for every call,
 * and the frame loop calls it once per projectile per tick. It also does
 * overflow-safe scaling that costs several times the arithmetic — protection
 * against magnitudes this game does not have, since everything measured here is
 * a pixel distance inside a 640x360 room.
 */
export function vectorLength(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Constrains `value` to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
