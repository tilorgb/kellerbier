import { InputAction, type InputFrame } from '../input/frame.js';
import type { GameSim } from '../game/sim.js';
import { pickupGlint } from '../particle/effects.js';
import { attemptShopPurchase } from './pickup.js';

/**
 * The `use` button near a pedestal — or a priced pickup, or a charged active
 * item (#28).
 *
 * One button, edge-detected the same way `stepBombPlacement` reads `bomb` —
 * `GameSim.previousButtons` from the tick before is the only state this
 * needs to fire once per press rather than once per tick held. A pedestal
 * within range always wins over a shop purchase, which always wins over the
 * held active item: standing next to one with a charged active item in hand,
 * or on a shop's stock, is a rare, low-stakes coincidence, and "which of
 * several things `use` does" has to resolve the same way every time for a
 * replay to reproduce it.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepPedestal(sim: GameSim, input: Readonly<InputFrame>): void {
  const useBit = 1 << InputAction.Use;
  const pressed = (input.buttons & useBit) !== 0 && (sim.previousButtons & useBit) === 0;
  if (!pressed) {
    return;
  }

  const pedestal = sim.nearestAvailablePedestal();
  if (pedestal >= 0) {
    const taken = sim.activePedestals[pedestal];
    sim.takePedestalItem(pedestal);
    // The item leaving the plinth is the signal; this is the flourish on top
    // of it (#153). Read before the take, because after it the pedestal no
    // longer holds anything to read a position from.
    if (taken !== undefined) {
      pickupGlint(sim, taken.x, taken.y);
    }
    return;
  }

  if (sim.nearbyShopPickup >= 0) {
    attemptShopPurchase(sim);
    return;
  }

  const held = sim.heldActiveItemId();
  if (held !== null) {
    sim.useActiveItem(held);
  }
}
