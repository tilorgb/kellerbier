import type { FireRotatingRingBehaviour } from './definition.js';

/**
 * The geometry of `fireRotatingRing` (#413, Das Waldradl), pure and shared by
 * the system that fires it, the registry that validates it and the tests that
 * prove it fair — so the three can never disagree about where a gap is.
 */

/**
 * The player's drawn radius (`PLAYER_RADIUS` in `game/sim.ts`, which a test
 * holds this equal to). The registry cannot import it — `sim.ts` imports the
 * registry — and the *drawn* radius is the conservative choice: an enemy shot
 * only has to cross the smaller footprint (`docs/DECISIONS.md` #73), so a
 * corridor wide enough for seven is wide enough for five.
 */
export const GAP_PLAYER_RADIUS = 7;
/** The shot radius a firing behaviour with none authored uses (`tuning.shooting.shotRadius`'s default). */
export const GAP_DEFAULT_SHOT_RADIUS = 3;
/** Room units of slack beyond the player and a shot's own radii that a corridor must still have. */
export const GAP_SAFE_MARGIN = 4;

/** Radians between two neighbouring slots of a ring of `shots`. */
export function slotStep(shots: number): number {
  return (Math.PI * 2) / shots;
}

/**
 * Whether `slot` is one of the slots a gap leaves unfired. A gap is `width`
 * consecutive slots centred on the slot nearest `at` — a whole number of slots
 * whatever the rotation, which is what keeps every gap the same size.
 */
export function slotInGap(
  shots: number,
  slot: number,
  gaps: readonly { readonly at: number; readonly width: number }[],
): boolean {
  const step = slotStep(shots);
  for (const gap of gaps) {
    const first = Math.round(gap.at / step - (gap.width - 1) / 2);
    const offset = (((slot - first) % shots) + shots) % shots;
    if (offset < gap.width) {
      return true;
    }
  }
  return false;
}

/** The angle slot `slot` leaves at on volley number `volley` (counted from the state's entry). */
export function slotAngle(
  ring: Pick<FireRotatingRingBehaviour, 'shots' | 'rotationPerVolley'>,
  slot: number,
  volley: number,
): number {
  return slotStep(ring.shots) * slot + ring.rotationPerVolley * volley;
}

/**
 * The widest straight corridor a gap of `width` slots leaves at `distance` room
 * units from the body's centre: the chord between the two shots flanking it,
 * `width + 1` slot steps apart. What a player has to fit between.
 */
export function gapCorridorWidth(shots: number, width: number, distance: number): number {
  return 2 * distance * Math.sin(((width + 1) * slotStep(shots)) / 2);
}

/** The narrowest corridor, in room units, a shot of `shotRadius` may leave for the player. */
export function requiredCorridor(shotRadius: number): number {
  return 2 * (GAP_PLAYER_RADIUS + shotRadius) + GAP_SAFE_MARGIN;
}

/**
 * Throws when `ring` is not a pattern a player can survive: a broken one must
 * fail the build, not a run (`docs/DECISIONS.md` #7). Checked: it has shots and
 * gaps, every gap leaves at least one shot flanking it on each side, and the
 * narrowest gap is still a corridor the player fits through at
 * `minSafeDistance`.
 */
export function validateRotatingRing(ring: FireRotatingRingBehaviour, where: string): void {
  if (ring.aimCardinal === true) {
    throw new Error(
      `${where}: "fireRotatingRing" fires a full ring at nothing in particular — ` +
        `"aimCardinal" has nothing to snap`,
    );
  }
  if (!Number.isInteger(ring.shots) || ring.shots < 3) {
    throw new Error(`${where}: "fireRotatingRing" needs a whole number of at least 3 shots`);
  }
  if (!Number.isFinite(ring.rotationPerVolley)) {
    throw new Error(`${where}: "fireRotatingRing" needs a rotationPerVolley`);
  }
  if (ring.gaps.length === 0) {
    throw new Error(`${where}: "fireRotatingRing" needs at least one gap to be survivable`);
  }
  if (!(ring.minSafeDistance > 0)) {
    throw new Error(`${where}: "fireRotatingRing" needs a minSafeDistance above zero`);
  }
  for (const gap of ring.gaps) {
    if (!Number.isInteger(gap.width) || gap.width < 1 || !Number.isFinite(gap.at)) {
      throw new Error(
        `${where}: "fireRotatingRing" gaps need a whole width of at least 1 and an angle`,
      );
    }
  }
  let open = 0;
  for (let slot = 0; slot < ring.shots; slot++) {
    if (!slotInGap(ring.shots, slot, ring.gaps)) {
      open += 1;
    }
  }
  if (open < 1) {
    throw new Error(`${where}: "fireRotatingRing" gaps leave no shot at all`);
  }
  const shotRadius = ring.radius ?? GAP_DEFAULT_SHOT_RADIUS;
  const need = requiredCorridor(shotRadius);
  for (const gap of ring.gaps) {
    const corridor = gapCorridorWidth(ring.shots, gap.width, ring.minSafeDistance);
    if (corridor < need) {
      throw new Error(
        `${where}: "fireRotatingRing" gap of ${String(gap.width)} slot(s) leaves a corridor of ` +
          `${corridor.toFixed(1)} units at ${String(ring.minSafeDistance)} from the body, narrower ` +
          `than the ${need.toFixed(1)} the player needs (diameter, the shot's own width and a margin)`,
      );
    }
  }
}
