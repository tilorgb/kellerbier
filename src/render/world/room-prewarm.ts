/**
 * Holds one room's `Scenery` built ahead of the actual room switch.
 *
 * ## Why
 *
 * A room switch rebuilds the whole scene graph for the new room — every floor
 * tile, wall box, block, hazard and prop, with their materials and texture
 * clones (`world/scenery.ts`) — inside the one `GameView.sync` call the switch
 * lands on. For a crossroads or a multi-cell room that is enough main-thread
 * work to blow the frame budget, and #96's transition slide (a time-based ease,
 * not a per-frame step) visibly jumps to catch up once the frame resumes — the
 * "a dash too late" a player reports as a freeze.
 *
 * #289 gave the crossing a dwell: `tuning.movement.doorCrossingTicks` ticks of
 * the player pressing into an open door before it actually switches. That dwell
 * is dead time on the render side, and it is exactly long enough to build the
 * next room's scenery in. `app/main.ts` calls {@link request} each dwell tick
 * with the neighbour it is about to hand `sim.transitionTo`; on the crossing it
 * calls {@link GameView.confirmPrewarmedEntry} with that room's id, and
 * `GameView.sync` then {@link take}s it by that id — falling back to a normal
 * build if what is held has since been replaced (a second crossing in the same
 * frame) or was never the room arrived in.
 *
 * This class only owns the scene-graph *construction* off the switch frame.
 * `GameView.prewarmRoom` pairs a `renderer.compileAsync` on the fresh build
 * with it, so the shader/program warm-up is moved off that frame too.
 */
export interface DisposableScenery {
  dispose(): void;
}

export class RoomPrewarm<S extends DisposableScenery> {
  /** Identifies the room currently held, so a per-tick `request` for it is a no-op. */
  private key: string | null = null;
  private scenery: S | null = null;

  /** The key of the room currently held ready, or `null` when nothing is built. */
  get readyKey(): string | null {
    return this.key;
  }

  /**
   * Ensure the room identified by `key` is built and held. Returns the newly
   * built scenery, or `null` when `key` was already the one held (so a caller
   * can do one-time follow-up work — a GPU precompile — only on a fresh build).
   *
   * Safe to call every tick of the dwell. When a *different* room is held (the
   * player brushed one door, then walked into another) that one is disposed
   * first: only ever one room is kept in reserve.
   */
  request(key: string, build: () => S): S | null {
    if (this.key === key) {
      return null;
    }
    this.discard();
    this.key = key;
    this.scenery = build();
    return this.scenery;
  }

  /**
   * Hand over the held scenery when it is the room keyed `key`, transferring
   * ownership to the caller (now responsible for disposing it). Returns `null`
   * when a different room — or nothing — is held, disposing that different room:
   * the caller then builds the room it is actually entering the normal way.
   * Either way the prewarm is left empty.
   */
  take(key: string): S | null {
    if (this.key === key) {
      const held = this.scenery;
      this.key = null;
      this.scenery = null;
      return held;
    }
    this.discard();
    return null;
  }

  /** Drop and dispose anything held. */
  discard(): void {
    this.scenery?.dispose();
    this.key = null;
    this.scenery = null;
  }
}
