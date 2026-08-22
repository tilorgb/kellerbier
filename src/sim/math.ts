/** Scalar helpers shared by the simulation and by render-side interpolation. */

/** Linear interpolation. `t` is not clamped; callers pass an alpha in [0, 1). */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Constrains `value` to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
