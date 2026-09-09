import type { GameSim } from '../game/sim.js';

/**
 * Time passing, for the Promille meter.
 *
 * Four jobs: age the Kater debuff and resize the player's hurtbox to the
 * meter unconditionally, then — mutually exclusive on any given tick — age
 * the Umgfalln knockdown if one is running, or otherwise let Promille decay.
 * All four live as `GameSim` methods
 * (`tickKater`/`syncPromilleHurtbox`/`tickUmgfalln`/`decayPromille`) rather
 * than here, the same division `tickPlayerInvulnerability` already draws —
 * this file only decides *when* to call them. Kater runs on its own clock
 * (see `GameSim.startKater`), so it ages every tick regardless of which of
 * the other two ran.
 *
 * The hurtbox is unconditional for a blunter reason: a knocked-down player is
 * invulnerable, so his hurtbox does not matter *during* Umgfalln — but the
 * early return below would leave it at whatever size the last decaying tick
 * set, and `umgfallnWakePromille` drops the meter on the way out. Syncing
 * before the branch means the size the room hits is always the size the meter
 * says, with no state to get stale.
 *
 * Runs first in `GameSim.step()`, so movement, shooting and every collision
 * this tick see this tick's Promille rather than last tick's.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepPromille(sim: GameSim): void {
  sim.tickKater();
  sim.syncPromilleHurtbox();
  if (sim.umgfallnTicks > 0) {
    sim.tickUmgfalln();
    return;
  }
  sim.decayPromille();
}
