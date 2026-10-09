import type { GameSim } from '../game/sim.js';

/**
 * The Obazda's puddles: each tick a puddle ages, and every enemy standing in
 * it is slowed (`STATUS_SLOW`, via `GameSim.slowEnemiesNear` — the same
 * half-speed any slow gives). A puddle spreads out over its first few ticks
 * so the drop reads as a splat, not a decal appearing.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Ticks a puddle takes to reach full radius after landing. */
export const CHEESE_SPREAD_TICKS = 12;
/** Ticks of slow granted each tick an enemy is in a puddle — refreshed while it stays. */
const SLOW_TICKS = 12;

let activeSim: GameSim | null = null;

/** The radius a puddle has right now: 0 → full over `CHEESE_SPREAD_TICKS`. */
export function cheeseRadius(sim: GameSim, index: number): number {
  const full = sim.cheese.radius[index] ?? 0;
  return full * Math.min(1, (sim.cheese.age[index] ?? 0) / CHEESE_SPREAD_TICKS);
}

export function stepCheese(sim: GameSim): void {
  const cheese = sim.cheese;
  if (cheese.count === 0) {
    return;
  }
  activeSim = sim;
  cheese.forEachLive(stepPuddle);
  activeSim = null;
}

function stepPuddle(index: number): void {
  const sim = activeSim;
  if (sim === null) {
    return;
  }
  const cheese = sim.cheese;
  const age = (cheese.age[index] ?? 0) + 1;
  if (age >= (cheese.lifetimeTicks[index] ?? 0)) {
    cheese.despawn(index);
    return;
  }
  cheese.age[index] = age;
  const radius = cheeseRadius(sim, index);
  if (radius > 0) {
    sim.slowEnemiesNear(cheese.x[index] ?? 0, cheese.y[index] ?? 0, radius, SLOW_TICKS);
  }
}
