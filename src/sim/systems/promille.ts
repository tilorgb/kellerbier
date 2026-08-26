import type { GameSim } from '../game/sim.js';

/**
 * Time passing, for the Promille meter.
 *
 * Three jobs: age the Kater debuff unconditionally, then — mutually
 * exclusive on any given tick — age the Umgfalln knockdown if one is
 * running, or otherwise let Promille decay. All three live as `GameSim`
 * methods (`tickKater`/`tickUmgfalln`/`decayPromille`) rather than here, the
 * same division `tickPlayerInvulnerability` already draws — this file only
 * decides *when* to call them. Kater runs on its own clock (see
 * `GameSim.startKater`), so it ages every tick regardless of which of the
 * other two ran.
 *
 * Runs first in `GameSim.step()`, so movement and shooting see this tick's
 * Promille rather than last tick's.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepPromille(sim: GameSim): void {
  sim.tickKater();
  if (sim.umgfallnTicks > 0) {
    sim.tickUmgfalln();
    return;
  }
  sim.decayPromille();
}
