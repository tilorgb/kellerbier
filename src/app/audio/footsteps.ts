import type { GameSim } from '../../sim/game/sim.js';
import { playSfx } from './sfx-player.js';

/** Pixels of travel between footstep cues — a plain stride length, not tuned against a walk-cycle frame count. */
const STRIDE_DISTANCE = 26;

/**
 * A footstep every `STRIDE_DISTANCE` pixels the player covers, from raw
 * position deltas — there is no "the player is walking" signal anywhere in
 * `sim/` to hook (`grep -ri footstep src/` finds nothing upstream of this
 * file), so this is presentation state built the same way `AmbienceTracker`
 * builds "the room changed": read `sim` every tick and diff.
 *
 * Distance-driven rather than tick-driven — a player standing still and
 * mashing a stationary input produces no distance and so no footsteps,
 * which a tick-count timer would get wrong.
 */
export class FootstepTracker {
  private lastX = 0;
  private lastY = 0;
  private distanceSinceStep = 0;
  private initialised = false;

  sync(sim: GameSim, live: boolean): void {
    const x = sim.positionX(sim.playerIndex);
    const y = sim.positionY(sim.playerIndex);
    if (!this.initialised) {
      this.initialised = true;
      this.lastX = x;
      this.lastY = y;
      return;
    }
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    this.lastX = x;
    this.lastY = y;
    const distance = Math.hypot(dx, dy);
    // A room transition or a replay-resume's catch-up jump, not a stride —
    // don't let it read as a burst of footsteps.
    if (!live || distance > 200) {
      return;
    }
    this.distanceSinceStep += distance;
    if (this.distanceSinceStep >= STRIDE_DISTANCE) {
      this.distanceSinceStep %= STRIDE_DISTANCE;
      playSfx('footstep');
    }
  }
}
