import { InputAction, type InputFrame } from '../input/frame.js';
import type { GameSim } from '../game/sim.js';

/**
 * Placing a Bierfassl from inventory.
 *
 * One button, and the keg is always set down at the player's feet and stays
 * there — it used to roll off in the direction the player was moving, which
 * read as the keg drifting away after it had been placed. Fires once per
 * press — `GameSim` keeps `previousButtons` from the tick before for exactly
 * this edge check, the same reason `isActionPressed` exists in
 * `input/frame.ts`, just done by hand here since there is no previous *frame*
 * kept, only its button mask.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepBombPlacement(sim: GameSim, input: Readonly<InputFrame>): void {
  const bombBit = 1 << InputAction.Bomb;
  const pressed = (input.buttons & bombBit) !== 0 && (sim.previousButtons & bombBit) === 0;
  // The Losbrunnen's dialog (#238's UX redesign) freezes the player for as
  // long as it's open — same reasoning as `movement.ts`/`shooting.ts`.
  if (!pressed || sim.bombs <= 0 || sim.isMachineDialogOpen) {
    return;
  }

  const index = sim.playerIndex;
  const x = sim.positionX(index);
  const y = sim.positionY(index);

  // Guarded by the `sim.bombs <= 0` check above — nothing else spends a bomb
  // between there and here, so this always succeeds.
  sim.spendBomb();
  sim.spawnBierfassl(x, y, 0, 0, false);
}
