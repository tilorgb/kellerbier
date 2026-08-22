import { EventKind } from '../../sim/events/queue.js';
import type { GameSim } from '../../sim/game/sim.js';

/**
 * The seam audio plugs into.
 *
 * There is no audio yet — the sound pass is #51, in M8. What exists now is the
 * point at which it will attach, wired up and being called, so that adding
 * sound later is writing an implementation rather than finding every place a
 * hit happens.
 *
 * It reads the event queue after a step rather than being called from the
 * simulation, for the same reason everything else does: `sim/` has no idea an
 * audio system exists, and a headless test runs the same code path.
 */
export interface ImpactAudio {
  onHit(x: number, y: number, damage: number): void;
  onDeath(x: number, y: number): void;
}

/** The implementation until #51. Deliberately silent, deliberately present. */
export const SILENT_AUDIO: ImpactAudio = {
  onHit: () => undefined,
  onDeath: () => undefined,
};

/**
 * Reports this tick's impacts to an audio implementation.
 *
 * Call once after each `sim.step`, before the next one clears the queue.
 */
export function playImpactAudio(sim: GameSim, audio: ImpactAudio): void {
  const events = sim.events;
  events.forEach((slot) => {
    const x = events.x[slot] ?? 0;
    const y = events.y[slot] ?? 0;
    switch (events.kind[slot]) {
      case EventKind.ProjectileHit:
        audio.onHit(x, y, events.value[slot] ?? 0);
        break;
      case EventKind.Death:
        audio.onDeath(x, y);
        break;
      default:
        break;
    }
  });
}
