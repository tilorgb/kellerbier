import { FLOOR_CONFIGS } from '../../content/floors/definition.js';
import type { GameSim } from '../../sim/game/sim.js';

/**
 * The seam floor music and room ambience plug into.
 *
 * There is no audio yet — the sound pass is #51, in M8, same as
 * `impact.ts`'s hit/death SFX seam. This is the point at which Floor 1's own
 * track (`docs/CONTENT_BIBLE.md`'s "the lone accordion version of the main
 * theme") and its ambience (dripping, distant cellar noise) attach, wired up
 * and being called, so that adding sound later is writing an implementation
 * rather than finding every place a floor or a room changed.
 *
 * Two hooks rather than one: a floor's music changes far less often than the
 * room the player is standing in, and a future implementation will want to
 * crossfade the two independently — swapping the ambience loop on every room
 * without restarting the floor track underneath it.
 */
export interface AmbienceAudio {
  /** The run entered a new floor — swap the floor's music track. */
  onFloorStart(floor: number, floorName: string): void;
  /** The player is standing in a newly loaded room — swap its ambience loop. */
  onRoomEnter(roomId: string, floorTag: string): void;
}

/** The implementation until #51. Deliberately silent, deliberately present. */
export const SILENT_AMBIENCE: AmbienceAudio = {
  onFloorStart: () => undefined,
  onRoomEnter: () => undefined,
};

/**
 * Tracks the floor/room `sim` is currently on and reports a change to an
 * audio implementation — the ambience counterpart of `impact.ts`'s
 * `playImpactAudio`, called the same way from the same place in the frame
 * loop (`app/main.ts`), once per tick after `sim.step`.
 *
 * `sim` has no event for "a room loaded" (`sim/events/queue.ts`'s
 * `EventKind` is about hits and deaths, not presentation), so this reads
 * `sim.currentFloor`/`sim.roomId` directly and diffs against what it last
 * saw — the same "cheap comparison, not a new engine signal" shape
 * `app/main.ts` already uses elsewhere for per-tick UI state.
 */
export class AmbienceTracker {
  private lastFloor = -1;
  private lastRoomId = '';

  sync(sim: GameSim, audio: AmbienceAudio): void {
    const config = FLOOR_CONFIGS.find((candidate) => candidate.floor === sim.currentFloor);
    if (sim.currentFloor !== this.lastFloor) {
      this.lastFloor = sim.currentFloor;
      audio.onFloorStart(sim.currentFloor, config?.name ?? '');
    }
    if (sim.roomId !== this.lastRoomId) {
      this.lastRoomId = sim.roomId;
      audio.onRoomEnter(sim.roomId, config?.floorTag ?? '');
    }
  }
}
