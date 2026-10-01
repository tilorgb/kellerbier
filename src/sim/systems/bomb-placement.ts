import { axisToUnit, InputAction, type InputFrame } from '../input/frame.js';
import type { GameSim } from '../game/sim.js';

/**
 * Placing a Bierfassl from inventory.
 *
 * One button, and the player's own movement decides "set down" from
 * "rolled": standing still drops it at their feet, moving sends it off in the
 * direction they were already heading. Fires once per press — `GameSim`
 * keeps `previousButtons` from the tick before for exactly this edge check,
 * the same reason `isActionPressed` exists in `input/frame.ts`, just done by
 * hand here since there is no previous *frame* kept, only its button mask.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Below this, a move axis reads as "not moving" rather than as a direction to roll in. */
const ROLL_DEADZONE = 0.05;

export function stepBombPlacement(sim: GameSim, input: Readonly<InputFrame>): void {
  const bombBit = 1 << InputAction.Bomb;
  const pressed = (input.buttons & bombBit) !== 0 && (sim.previousButtons & bombBit) === 0;
  // The Losbrunnen's dialog (#238's UX redesign) freezes the player for as
  // long as it's open — same reasoning as `movement.ts`/`shooting.ts`.
  if (!pressed || sim.bombs <= 0 || sim.isMachineDialogOpen) {
    return;
  }

  const moveX = axisToUnit(input.moveX);
  const moveY = axisToUnit(input.moveY);
  const length = Math.sqrt(moveX * moveX + moveY * moveY);
  const rolling = length > ROLL_DEADZONE;
  const dirX = rolling ? moveX / length : 0;
  const dirY = rolling ? moveY / length : 0;

  const index = sim.playerIndex;
  const x = sim.positionX(index);
  const y = sim.positionY(index);

  // Guarded by the `sim.bombs <= 0` check above — nothing else spends a bomb
  // between there and here, so this always succeeds.
  sim.spendBomb();
  sim.spawnBierfassl(x, y, dirX, dirY, rolling);
}
