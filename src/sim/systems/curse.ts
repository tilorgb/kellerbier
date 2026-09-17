import type { GameSim } from '../game/sim.js';
import type { ProjectileStore } from '../projectile/store.js';

/**
 * Wind-push scratch state for `applyWind`'s per-projectile callback — a
 * module-level variable rather than a closure captured over `windX`/`windY`,
 * the same "hoisted function, not an arrow at the call site" pattern
 * `sim/systems/shooting.ts`'s `stepProjectiles`/`advanceProjectile` (and
 * `flightSim`) already use: an arrow allocated fresh every tick is exactly
 * what the `no-hot-allocation` lint rule exists to catch, since this walks
 * every live projectile in the room.
 */
let windProjectiles: ProjectileStore | null = null;
/** `[windX, windY]` — a typed array rather than two bare module bindings, so a store here is a slot write, not a boxed `HeapNumber`. */
const windScratch = new Float64Array(2);
const WIND_X = 0;
const WIND_Y = 1;

function pushProjectile(slot: number): void {
  const projectiles = windProjectiles;
  if (projectiles === null) {
    return;
  }
  projectiles.velocityX[slot] = (projectiles.velocityX[slot] ?? 0) + (windScratch[WIND_X] ?? 0);
  projectiles.velocityY[slot] = (projectiles.velocityY[slot] ?? 0) + (windScratch[WIND_Y] ?? 0);
}

/**
 * Föhn's wind: a slowly rotating direction that pushes every live projectile
 * a little every tick. Shared between the Föhn *item* (`content/items/foehn.ts`,
 * which only pushes while held) and the Föhn *curse* (unconditional for the
 * whole floor, `stepCurse` below) rather than the curse re-deriving the same
 * math — both are the literal same wind, just with a different reason it's
 * blowing.
 *
 * `angle` is the caller's own scratch angle (radians); returns the next one,
 * wrapped to `[0, 2π)`. The item stores its angle on its own
 * `ItemRuntimeState.charge` the way every other item hook does; the curse
 * stores it on `GameSim.curseFoehnAngle` since it has no per-item state to
 * borrow.
 */
export function applyWind(
  sim: GameSim,
  angle: number,
  rotationPerTick: number,
  strength: number,
): number {
  const nextAngle = (angle + rotationPerTick) % (Math.PI * 2);
  windProjectiles = sim.projectiles;
  windScratch[WIND_X] = Math.cos(nextAngle) * strength;
  windScratch[WIND_Y] = Math.sin(nextAngle) * strength;
  sim.projectiles.forEachLive(pushProjectile);
  windProjectiles = null;
  return nextAngle;
}

/**
 * The per-tick half of the active floor curse (#49) — the roll itself and
 * the floor-entry announcement happen once, at floor start
 * (`GameSim.rollFloorCurse`, called from `applyCompiledRoom`); this is what
 * Föhn needs every tick after that. Nebel, Kater and Blaue Stunde need
 * nothing here: Nebel and Blaue Stunde are read directly by the
 * renderer off `sim.curse`, and Kater's debuff is the same `katerTicksValue`
 * timer `stepPromille` already ages every tick regardless of why it started.
 *
 * No curse deals damage on its own. Sperrstunde used to — a poison tick from
 * Ordner the player never saw — and was removed for exactly that: damage
 * with no visible source and nothing to do about it is not a floor modifier,
 * it is an unfair death.
 *
 * @hot — runs in the frame loop whenever a curse is active. Nothing here may
 * allocate; see the `no-hot-allocation` rule in `tools/eslint/`.
 */
export function stepCurse(sim: GameSim): void {
  const tuning = sim.tuning.curse;
  if (sim.curse === 'foehn') {
    sim.curseFoehnAngle = applyWind(
      sim,
      sim.curseFoehnAngle,
      tuning.foehnRotationRadiansPerTick,
      tuning.foehnWindStrength,
    );
  }
}
