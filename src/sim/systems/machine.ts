import type { InputFrame } from '../input/frame.js';
import type { GameSim } from '../game/sim.js';

/**
 * The Losbrunnen's per-tick upkeep (#218): closing its picker the moment the
 * player steps out of range, and reading the move axis for a left/right tap
 * to cycle it while it's open.
 *
 * Deliberately not gated on any button — `use` (`sim/systems/pedestal.ts`'s
 * priority chain, `GameSim.useMachine`) is the machine's only *button*
 * interaction, opening and confirming its picker. This system exists
 * because closing the picker on distance and reading an axis tap both need
 * to happen every tick regardless of whether `use` was pressed this tick —
 * an edge-detected button chain has nowhere to run continuous per-tick
 * upkeep like that.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepMachine(sim: GameSim, input: Readonly<InputFrame>): void {
  if (!sim.isNearMachine()) {
    sim.closeMachinePicker();
    return;
  }
  // The anticipation beat and its resolution (break check, then either the
  // bad-luck candidate or a 3-option board) are decided here, deterministically
  // off the tick counter alone — see `GameSim.advanceMachineRoll`'s own doc
  // comment for why this can't be tied to wall-clock animation time.
  sim.advanceMachineRoll();
  sim.cycleMachineFromAxis(input.moveX);
}
