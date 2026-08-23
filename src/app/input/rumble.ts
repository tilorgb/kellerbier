import { EventKind } from '../../sim/events/queue.js';
import type { GameSim } from '../../sim/game/sim.js';
import type { GamepadSource } from './gamepad.js';

/** Ticks a hit rumbles for. Short — the point is felt, not a buzz. */
const HIT_RUMBLE_MS = 120;
/** Longer and stronger: the one rumble in the run that has to read as final. */
const DEATH_RUMBLE_MS = 400;

/**
 * Reports this tick's player-hit and player-death events to the controller.
 *
 * Same shape as `playImpactAudio` — reads the event queue after a step,
 * never touches sim internals beyond that — because rumble is exactly the
 * same kind of concern audio is: a presentation reaction to something the
 * simulation already decided happened, kept out of `sim/` for the same
 * architectural reason (issue #7).
 *
 * Call once after each `sim.step`, before the next one clears the queue.
 */
export function playRumble(sim: GameSim, gamepad: GamepadSource): void {
  const scale = sim.rumbleScale;
  if (scale <= 0) {
    return;
  }

  const events = sim.events;
  const player = sim.playerIndex;
  events.forEach((slot) => {
    switch (events.kind[slot]) {
      case EventKind.Damage: {
        // Only ever pushed for the player — see `applyContact`/`applyHit`.
        const damage = events.value[slot] ?? 0;
        const strong = Math.min(1, 0.35 + damage * 0.15) * scale;
        const weak = Math.min(1, 0.5 + damage * 0.1) * scale;
        gamepad.rumble(strong, weak, HIT_RUMBLE_MS);
        break;
      }
      case EventKind.Death:
        if (events.subject[slot] === player) {
          gamepad.rumble(1 * scale, 0.6 * scale, DEATH_RUMBLE_MS);
        }
        break;
      default:
        break;
    }
  });
}
