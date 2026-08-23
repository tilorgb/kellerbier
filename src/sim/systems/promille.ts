import type { GameSim } from '../game/sim.js';

/**
 * Time passing, for the Promille meter.
 *
 * Two jobs, mutually exclusive on any given tick: age the Umgfalln knockdown
 * if one is running, or otherwise let Promille decay. Both live as `GameSim`
 * methods (`tickUmgfalln`/`decayPromille`) rather than here, the same
 * division `tickPlayerInvulnerability` already draws — this file only
 * decides *when* to call them.
 *
 * Runs first in `GameSim.step()`, so movement and shooting see this tick's
 * Promille rather than last tick's.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepPromille(sim: GameSim): void {
  if (sim.umgfallnTicks > 0) {
    sim.tickUmgfalln();
    return;
  }
  sim.decayPromille();
}
