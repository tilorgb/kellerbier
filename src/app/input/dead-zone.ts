/**
 * Radial dead zone, shared by every analog input source.
 *
 * A per-axis dead zone leaves a square hole at the centre, so a stick pushed
 * gently along a diagonal registers while the same push along an axis does
 * not — players feel that as the stick "sticking" to the diagonals. Output is
 * rescaled so it starts at zero at the dead-zone edge rather than jumping
 * straight to the dead-zone magnitude, which is what makes small movements
 * possible instead of the input feeling like a switch.
 */

export interface DeadZoneResult {
  x: number;
  y: number;
}

/** Mutable scratch, so applying a dead zone never allocates. */
const scratch: DeadZoneResult = { x: 0, y: 0 };

export function applyRadialDeadZone(rawX: number, rawY: number, deadZone: number): DeadZoneResult {
  const magnitude = Math.hypot(rawX, rawY);

  if (magnitude <= deadZone || magnitude === 0) {
    scratch.x = 0;
    scratch.y = 0;
    return scratch;
  }

  const rescaled = Math.min((magnitude - deadZone) / (1 - deadZone), 1);
  scratch.x = (rawX / magnitude) * rescaled;
  scratch.y = (rawY / magnitude) * rescaled;
  return scratch;
}
