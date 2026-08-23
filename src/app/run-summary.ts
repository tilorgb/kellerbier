import { EventKind } from '../sim/events/queue.js';
import type { GameSim } from '../sim/game/sim.js';

/**
 * Tallies the one run statistic nothing else tracks: kills.
 *
 * Ticks survived and the death word both already live on `GameSim`
 * (`playerDeathTick`, `deathWord`) — there is no reason to duplicate them
 * here. Kills are different: nothing in `sim/` counts them, because nothing
 * in the simulation itself needs to. This listens the same way
 * `playImpactAudio` does — reading events after a step, never touching sim
 * internals — so it stays a presentation-adjacent concern rather than
 * something the sim carries for a screen it doesn't know exists.
 */
export class RunSummaryTracker {
  private killCount = 0;

  get kills(): number {
    return this.killCount;
  }

  /** Call once, right after `sim.step()`, before the next step clears the queue. */
  recordTick(sim: GameSim): void {
    const events = sim.events;
    const player = sim.playerIndex;
    events.forEach((slot) => {
      if (events.kind[slot] === EventKind.Death && events.subject[slot] !== player) {
        this.killCount += 1;
      }
    });
  }
}
