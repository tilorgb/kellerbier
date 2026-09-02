import type { GameSim } from '../game/sim.js';
import { PromilleTier } from '../game/promille.js';

/**
 * The per-tick half of Blutwurz (#84) — reaching the corpse, and the clock
 * that runs out if you don't. `GameSim.startBlutwurz`/`recoverFromBlutwurz`/
 * `failBlutwurz` are the state transitions; this is what decides, once a
 * tick, whether either has just happened.
 *
 * Promille is the timer, in a run that has it — raised every tick, capped
 * and tiered by the exact same `addPromille` an item or a beer pickup would
 * use, so reaching Umgfalln ends the attempt the way the issue asks for at
 * no new mechanism. A sober run has no meter to raise at all (#85's own
 * invariant), so it gets `blutwurzSpiritTicks` instead — a plain hidden
 * countdown with the same rough runway, never surfaced anywhere a sober
 * run's "no meter, full stop" rule would have to account for it.
 *
 * @hot — runs in the frame loop whenever the spirit walk is on. Nothing
 * here may allocate; see the `no-hot-allocation` rule in `tools/eslint/`.
 */
export function stepBlutwurz(sim: GameSim): void {
  if (!sim.blutwurzActive) {
    return;
  }
  const corpse = sim.corpsePosition;
  if (corpse !== null && corpse.roomId === sim.roomId) {
    const dx = sim.positionX(sim.playerIndex) - corpse.x;
    const dy = sim.positionY(sim.playerIndex) - corpse.y;
    const radius = sim.tuning.blutwurz.corpseTouchRadius;
    if (dx * dx + dy * dy <= radius * radius) {
      sim.recoverFromBlutwurz();
      return;
    }
  }

  const tuning = sim.tuning.blutwurz;
  if (sim.promilleUnlocked) {
    sim.addPromille(tuning.promilleRisePerTick);
    if (sim.promilleTier === PromilleTier.Umgfalln) {
      sim.failBlutwurz();
    }
  } else {
    sim.blutwurzSpiritTicks += 1;
    if (sim.blutwurzSpiritTicks >= tuning.soberFailTicks) {
      sim.failBlutwurz();
    }
  }
}
