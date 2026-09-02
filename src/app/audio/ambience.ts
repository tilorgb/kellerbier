import { FLOOR_CONFIGS } from '../../content/floors/definition.js';
import {
  bossDerStier,
  bossKellerassel,
  floor1DerKeller,
  floor2DorfUndAcker,
} from '../../content/audio/tracks.js';
import { PROMILLE_AUDIO_TIERS } from '../../content/audio/promille-audio.js';
import type { GameSim } from '../../sim/game/sim.js';
import { MusicPlayer } from './music.js';

/**
 * The seam floor music and room ambience plug into.
 *
 * `SynthAmbienceAudio` (below) is #51's real implementation, backed by
 * `music.ts`'s `MusicPlayer`; `SILENT_AMBIENCE` stays exported for tests and
 * any environment without Web Audio.
 *
 * Two hooks rather than one: a floor's music changes far less often than the
 * room the player is standing in, and `onRoomEnter`'s `isBossRoom` is what
 * lets `SynthAmbienceAudio` swap in a boss theme over the floor track
 * without the floor track itself restarting — leaving the floor's own loop
 * position intact for when the player leaves the boss room again.
 */
export interface AmbienceAudio {
  /** The run entered a new floor — swap the floor's music track. `tick` is `sim.tick`. */
  onFloorStart(floor: number, floorName: string, tick: number): void;
  /** The player is standing in a newly loaded room — swap its ambience loop. `tick` is `sim.tick`. */
  onRoomEnter(roomId: string, floorTag: string, isBossRoom: boolean, tick: number): void;
}

/** The implementation until Web Audio is available. Deliberately silent, deliberately present. */
export const SILENT_AMBIENCE: AmbienceAudio = {
  onFloorStart: () => undefined,
  onRoomEnter: () => undefined,
};

/**
 * Floor number → its theme (`content/audio/tracks.ts`). Floors 3–7 have no
 * authored track yet (their content is parked in M10, same as their rooms
 * — `content/floors/definition.ts`'s own doc comment) so they fall back to
 * Floor 2's track rather than playing silence, the same
 * `docs/DECISIONS.md` #19 "closest authored alternative, not a stall"
 * pattern `sim/room/template.ts`'s `nearestFloorChoice` already uses for
 * room content.
 */
const FLOOR_TRACK = new Map<number, typeof floor1DerKeller>([
  [1, floor1DerKeller],
  [2, floor2DorfUndAcker],
]);

/** Floor number → its boss's theme, same fallback reasoning as `FLOOR_TRACK`. */
const BOSS_TRACK = new Map<number, typeof bossKellerassel>([
  [1, bossKellerassel],
  [2, bossDerStier],
]);

/**
 * Backs `AmbienceAudio` with `music.ts`'s `MusicPlayer` — the floor theme
 * loops until a boss room is entered, at which point the boss theme takes
 * over; leaving the boss room (or clearing it) hands playback back to the
 * floor track. `SfxTriggers` (`sfx-triggers.ts`) is what actually calls
 * `onRoomEnter` with `isBossRoom` set, reading the same room-role check
 * `app/main.ts`'s boss banner already does.
 */
export class SynthAmbienceAudio implements AmbienceAudio {
  private readonly player = new MusicPlayer();
  private currentFloor = 1;
  private inBossRoom = false;

  onFloorStart(floor: number, _floorName: string, tick: number): void {
    this.currentFloor = floor;
    if (!this.inBossRoom) {
      this.playFloorTrack(tick);
    }
  }

  onRoomEnter(_roomId: string, _floorTag: string, isBossRoom: boolean, tick: number): void {
    if (isBossRoom === this.inBossRoom) {
      return;
    }
    this.inBossRoom = isBossRoom;
    if (isBossRoom) {
      const boss = BOSS_TRACK.get(this.currentFloor) ?? bossKellerassel;
      this.player.play(boss, tick);
    } else {
      this.playFloorTrack(tick);
    }
  }

  /** Called once a real tick from `app/main.ts`'s `advanceOneTick`, same gate as `playImpactAudio`. */
  sync(tick: number, live: boolean): void {
    this.player.sync(tick, live);
  }

  /** Silences the floor/boss track — the run just ended (`victory-screen.ts`/`game-over.ts`'s call site). */
  stop(): void {
    this.player.stop();
    this.inBossRoom = false;
  }

  /** `sim.promilleTier` → `content/audio/promille-audio.ts`'s tier content. */
  syncPromilleTier(tier: number): void {
    const content = PROMILLE_AUDIO_TIERS[tier];
    if (content !== undefined) {
      this.player.setPromilleTier(content);
    }
  }

  private playFloorTrack(tick: number): void {
    const track = FLOOR_TRACK.get(this.currentFloor) ?? floor2DorfUndAcker;
    this.player.play(track, tick);
  }
}

/**
 * Tracks the floor/room `sim` is currently on and reports a change to an
 * audio implementation, once per tick after `sim.step`.
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

  sync(sim: GameSim, audio: AmbienceAudio, isBossRoom: boolean): void {
    const config = FLOOR_CONFIGS.find((candidate) => candidate.floor === sim.currentFloor);
    if (sim.currentFloor !== this.lastFloor) {
      this.lastFloor = sim.currentFloor;
      audio.onFloorStart(sim.currentFloor, config?.name ?? '', sim.tick);
    }
    if (sim.roomId !== this.lastRoomId) {
      this.lastRoomId = sim.roomId;
      audio.onRoomEnter(sim.roomId, config?.floorTag ?? '', isBossRoom, sim.tick);
    }
  }
}
