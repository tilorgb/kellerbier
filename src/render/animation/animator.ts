import {
  AnimationState,
  ClipStateResolver,
  clipFrameAt,
  clipHasEnded,
  type AnimationStateIndex,
  type CompiledAnimationSet,
  type CompiledClip,
} from './definition.js';

/**
 * The frame animator: a render-side table of who is playing which clip, and
 * how far into it.
 *
 * Nothing in here writes to the simulation, and nothing in the simulation
 * knows this exists. Animation state is *derived* from sim state every frame
 * (`render/animation/state.ts`) and the clock it advances on is the render
 * clock, which is what keeps the two independent in both directions:
 *
 * - The simulation stays deterministic. There is no `animationFrame` field on
 *   an entity for a replay to have to reproduce, and no presentation timing
 *   anywhere in a tick.
 * - Animation stays smooth. Clips advance on real elapsed milliseconds, so a
 *   144 Hz display plays a 440 ms walk cycle in 440 ms rather than 2.4× fast,
 *   and a paused simulation (the debug overlay's pause, the single-step) does
 *   not freeze a body halfway through a stride.
 *
 * ## Keyed by entity handle, not by slot
 *
 * `World` recycles entity slots, and a handle packs the slot's generation
 * (`sim/ecs/entity.ts`) precisely so a stale reference is detectable. The
 * table is indexed by slot for speed and *validated* by generation: a slot
 * whose generation has moved on is a different creature, and it starts its
 * clip from zero rather than inheriting the last occupant's stride phase.
 *
 * ## Corpses
 *
 * A death clip has to outlive the thing it belongs to: the simulation frees
 * an enemy's slot on the tick it dies, so by the time a frame could draw a
 * death pose there is no entity left to hang one on. So the animator keeps a
 * small fixed table of corpses — position, radius, facing and clip phase,
 * captured from the last frame the body was alive — and plays the death clip
 * out on those. Fixed and overwriting oldest-first, following `SlotPool`'s
 * overflow policy (`docs/DECISIONS.md` #4): a room-clearing bomb should drop
 * the oldest corpse's last few frames, never grow the table mid-fight.
 *
 * @hot — every method here runs in the frame loop. Nothing in it allocates;
 * see `tests/unit/animator.test.ts`.
 */

/**
 * Longest render delta a clip is advanced by in one frame.
 *
 * A backgrounded tab, a breakpoint, or a long asset decode produces a gap of
 * seconds. Advancing a clip by it does nothing useful — a looping clip lands
 * on an arbitrary frame and a `once` clip skips its entire playback — so the
 * gap is clamped to about four frames' worth and the rest is dropped. Same
 * reasoning as `FixedTimestepLoop`'s step clamp: a stall is spent, not
 * deferred.
 */
export const MAX_FRAME_DELTA_MS = 64;

/** Corpses playable at once. Past this the oldest is overwritten. */
export const CORPSE_CAPACITY = 24;

/**
 * How long a corpse stays after its death clip has played out.
 *
 * Long enough to register as a body on the floor rather than a sprite
 * blinking out, short enough that a busy room does not fill with them. It
 * fades over the last `CORPSE_FADE_MS` of this rather than popping.
 */
export const CORPSE_LINGER_MS = 260;

/** Tail of `CORPSE_LINGER_MS` spent fading out. */
const CORPSE_FADE_MS = 160;

/** Growth step for the per-slot tables. Matched to `World`'s own doubling. */
function grownLength(needed: number, current: number): number {
  let length = Math.max(current, 64);
  while (length < needed) {
    length *= 2;
  }
  return length;
}

export class EntityAnimator {
  /**
   * The entity handle each slot's entry belongs to — slot *and* generation
   * packed together (`sim/ecs/entity.ts`), so a recycled slot never inherits
   * the previous occupant's clip phase. 0 is the null handle, i.e. untracked.
   */
  private handles = new Int32Array(0);
  /** The state the simulation asked for, per slot. */
  private requested = new Int8Array(0);
  /** The state whose clip is actually playing — differs while a fallback or an `onEnd: idle` handoff is in force. */
  private playing = new Int8Array(0);
  private elapsed = new Float64Array(0);
  private facings = new Int8Array(0);
  private frames = new Int16Array(0);
  private stamps = new Int32Array(0);
  private sets: (CompiledAnimationSet | null)[] = [];
  private lastX = new Float32Array(0);
  private lastY = new Float32Array(0);
  private lastRadius = new Float32Array(0);

  /** Slots tracked this frame, in the order `track` saw them, and last frame's. */
  private active = new Int32Array(0);
  private activeCount = 0;
  private previous = new Int32Array(0);
  private previousCount = 0;

  private frameStamp = 0;
  private lastNowMs: number | null = null;
  private deltaMs = 0;

  private readonly corpseSets: (CompiledAnimationSet | null)[] =
    new Array<CompiledAnimationSet | null>(CORPSE_CAPACITY).fill(null);
  private readonly corpseElapsed = new Float64Array(CORPSE_CAPACITY);
  private readonly corpseX = new Float32Array(CORPSE_CAPACITY);
  private readonly corpseY = new Float32Array(CORPSE_CAPACITY);
  private readonly corpseRadius = new Float32Array(CORPSE_CAPACITY);
  private readonly corpseFacing = new Int8Array(CORPSE_CAPACITY);
  private readonly corpseFrame = new Int16Array(CORPSE_CAPACITY);
  /** Live corpse slots, compacted, so drawing them is a walk of `corpseCount`. */
  private readonly corpseSlots = new Int32Array(CORPSE_CAPACITY);
  private corpseLive = 0;
  private corpseCursor = 0;
  private corpseOverflowCount = 0;

  /** The #19 clip fallback, shared with `render/player-view.ts`. */
  private readonly clipStates = new ClipStateResolver();

  /** Milliseconds the last `beginFrame` advanced clips by. Reported by the debug overlay. */
  get lastDeltaMs(): number {
    return this.deltaMs;
  }

  /** Bodies tracked this frame. Valid after `endFrame`. */
  get trackedCount(): number {
    return this.previousCount;
  }

  /** Corpses currently playing out a death clip. */
  get corpseCount(): number {
    return this.corpseLive;
  }

  /** Corpses dropped because the table was full. Non-zero means `CORPSE_CAPACITY` is too small for how the game actually plays. */
  get corpseOverflows(): number {
    return this.corpseOverflowCount;
  }

  /**
   * Starts a frame: works out how much time has passed, retires bodies that
   * vanished, and advances every corpse.
   *
   * `nowMs` is a render-clock reading (`performance.now()`), passed in rather
   * than read here so tests can drive the animator at an exact 60 Hz and an
   * exact 144 Hz and compare.
   */
  beginFrame(nowMs: number): void {
    const last = this.lastNowMs;
    this.deltaMs = last === null ? 0 : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, nowMs - last));
    this.lastNowMs = nowMs;
    this.frameStamp += 1;
    this.advanceCorpses(this.deltaMs);
  }

  /**
   * Records one visible body and returns the strip frame to draw it at.
   *
   * `handle` is `World.entityAt(slot)` — the packed slot-and-generation
   * handle, which is what makes a recycled slot a new creature rather than one
   * that inherited a stride. `facing` is `-1`/`1`, or `0` to keep whatever the
   * body was facing.
   */
  track(
    slot: number,
    handle: number,
    set: CompiledAnimationSet,
    state: AnimationStateIndex,
    facing: number,
    x: number,
    y: number,
    radius: number,
  ): number {
    this.ensureCapacity(slot + 1);

    const fresh = this.handles[slot] !== handle || this.sets[slot] !== set;
    if (fresh) {
      this.handles[slot] = handle;
      this.sets[slot] = set;
      this.requested[slot] = state;
      this.playing[slot] = this.clipStateFor(set, state);
      this.elapsed[slot] = 0;
      this.facings[slot] = facing === 0 ? -1 : facing;
    } else {
      if (this.requested[slot] !== state) {
        this.requested[slot] = state;
        this.playing[slot] = this.clipStateFor(set, state);
        this.elapsed[slot] = 0;
      } else {
        this.elapsed[slot] = (this.elapsed[slot] ?? 0) + this.deltaMs;
      }
      if (facing !== 0) {
        this.facings[slot] = facing;
      }
    }

    let playing = this.playing[slot] ?? AnimationState.Idle;
    let clip = set.clips[playing] ?? set.idle;
    // A `once` clip authored to hand back — a hurt flinch — does so the
    // moment it plays out, carrying the overshoot into the idle clip so the
    // handoff does not restart idle's phase from a frame boundary that has
    // nothing to do with it.
    if (!clip.holds && clipHasEnded(clip, this.elapsed[slot] ?? 0)) {
      this.elapsed[slot] = (this.elapsed[slot] ?? 0) - clip.totalMs;
      playing = AnimationState.Idle;
      this.playing[slot] = playing;
      clip = set.idle;
    }

    const frame = clipFrameAt(clip, this.elapsed[slot] ?? 0);
    this.frames[slot] = frame;
    this.stamps[slot] = this.frameStamp;
    this.lastX[slot] = x;
    this.lastY[slot] = y;
    this.lastRadius[slot] = radius;

    if (this.activeCount < this.active.length) {
      this.active[this.activeCount] = slot;
      this.activeCount += 1;
    }
    return frame;
  }

  /**
   * Closes a frame: anything tracked last frame and not this one has left the
   * world, and starts a corpse if its set has a death clip to play.
   *
   * A body can leave for reasons that are not death — a room unloading takes
   * every enemy in it — which is what `reset` is for: `render/view.ts` calls
   * it on a room change, before this could mistake a whole room's worth of
   * departures for a whole room's worth of deaths.
   */
  endFrame(): void {
    for (let entry = 0; entry < this.previousCount; entry++) {
      const slot = this.previous[entry] ?? 0;
      if (this.stamps[slot] === this.frameStamp) {
        continue;
      }
      this.startCorpse(slot);
      this.handles[slot] = 0;
      this.sets[slot] = null;
    }

    // Swap the two lists rather than copying: this frame's becomes the one
    // the next frame compares against.
    const retired = this.previous;
    this.previous = this.active;
    this.previousCount = this.activeCount;
    this.active = retired;
    this.activeCount = 0;
  }

  /** Which frame slot `slot` is drawing, for the debug overlay. */
  frameOf(slot: number): number {
    return this.frames[slot] ?? 0;
  }

  /** Which way slot `slot` is facing: `-1` or `1`. */
  facingOf(slot: number): number {
    return this.facings[slot] ?? -1;
  }

  /** The clip actually playing on `slot` — the fallback, when one is in force. */
  playingStateOf(slot: number): AnimationStateIndex {
    return (this.playing[slot] ?? AnimationState.Idle) as AnimationStateIndex;
  }

  /** The state the simulation asked for on `slot`, fallback or not. */
  requestedStateOf(slot: number): AnimationStateIndex {
    return (this.requested[slot] ?? AnimationState.Idle) as AnimationStateIndex;
  }

  /** The animation set `slot` is playing, or `null` if it is not tracked. */
  setOf(slot: number): CompiledAnimationSet | null {
    return this.sets[slot] ?? null;
  }

  /** The `n`th slot tracked last frame, for the debug overlay's per-entity list. */
  trackedSlotAt(entry: number): number {
    return this.previous[entry] ?? 0;
  }

  /** The `n`th live corpse's slot in the corpse table. */
  corpseSlotAt(entry: number): number {
    return this.corpseSlots[entry] ?? 0;
  }

  corpseSetAt(corpse: number): CompiledAnimationSet | null {
    return this.corpseSets[corpse] ?? null;
  }

  corpseFrameAt(corpse: number): number {
    return this.corpseFrame[corpse] ?? 0;
  }

  corpseXAt(corpse: number): number {
    return this.corpseX[corpse] ?? 0;
  }

  corpseYAt(corpse: number): number {
    return this.corpseY[corpse] ?? 0;
  }

  corpseRadiusAt(corpse: number): number {
    return this.corpseRadius[corpse] ?? 1;
  }

  corpseFacingAt(corpse: number): number {
    return this.corpseFacing[corpse] ?? -1;
  }

  /** A corpse's opacity — 1 until it starts fading out, then down to 0. */
  corpseAlphaAt(corpse: number): number {
    const set = this.corpseSets[corpse];
    if (set === null || set === undefined) {
      return 0;
    }
    const clip = set.clips[AnimationState.Death] ?? set.idle;
    const lifetime = clip.totalMs + CORPSE_LINGER_MS;
    const left = lifetime - (this.corpseElapsed[corpse] ?? 0);
    if (left >= CORPSE_FADE_MS) {
      return 1;
    }
    return Math.max(0, left / CORPSE_FADE_MS);
  }

  /**
   * Forgets everything: every tracked body, every corpse, and the clock
   * origin. Called on a room change, and when a run restarts — a corpse
   * belongs to the room it died in, and the room it died in is gone.
   */
  reset(): void {
    for (let entry = 0; entry < this.previousCount; entry++) {
      const slot = this.previous[entry] ?? 0;
      this.handles[slot] = 0;
      this.sets[slot] = null;
    }
    for (let entry = 0; entry < this.activeCount; entry++) {
      const slot = this.active[entry] ?? 0;
      this.handles[slot] = 0;
      this.sets[slot] = null;
    }
    this.previousCount = 0;
    this.activeCount = 0;
    for (let corpse = 0; corpse < CORPSE_CAPACITY; corpse++) {
      this.corpseSets[corpse] = null;
    }
    this.corpseLive = 0;
    this.corpseCursor = 0;
    this.lastNowMs = null;
    this.deltaMs = 0;
  }

  /**
   * The clip to actually play for `state` — `state` itself when it has one,
   * `idle` when it does not. `ClipStateResolver` is the whole of it; this
   * stays as a name because every call site inside this class reads better
   * for it.
   */
  private clipStateFor(set: CompiledAnimationSet, state: AnimationStateIndex): AnimationStateIndex {
    return this.clipStates.resolve(set, state);
  }

  private startCorpse(slot: number): void {
    const set = this.sets[slot];
    if (set === null || set === undefined) {
      return;
    }
    const death = set.clips[AnimationState.Death];
    if (death === null || death === undefined) {
      // Nothing authored to play. Not a warning: the fallback for "this
      // creature has no death clip" is the behaviour every enemy in the game
      // had before this existed — it disappears — and `clipStateFor` has
      // already said so once for every other state that goes unauthored.
      return;
    }
    const corpse = this.claimCorpse();
    this.corpseSets[corpse] = set;
    this.corpseElapsed[corpse] = 0;
    this.corpseX[corpse] = this.lastX[slot] ?? 0;
    this.corpseY[corpse] = this.lastY[slot] ?? 0;
    this.corpseRadius[corpse] = this.lastRadius[slot] ?? 1;
    this.corpseFacing[corpse] = this.facings[slot] ?? -1;
    this.corpseFrame[corpse] = clipFrameAt(death, 0);
  }

  /** The next corpse slot, overwriting the oldest when the table is full. */
  private claimCorpse(): number {
    for (let probe = 0; probe < CORPSE_CAPACITY; probe++) {
      const candidate = (this.corpseCursor + probe) % CORPSE_CAPACITY;
      if (this.corpseSets[candidate] === null) {
        this.corpseCursor = (candidate + 1) % CORPSE_CAPACITY;
        return candidate;
      }
    }
    this.corpseOverflowCount += 1;
    const oldest = this.corpseCursor;
    this.corpseCursor = (oldest + 1) % CORPSE_CAPACITY;
    return oldest;
  }

  private advanceCorpses(deltaMs: number): void {
    let live = 0;
    for (let corpse = 0; corpse < CORPSE_CAPACITY; corpse++) {
      const set = this.corpseSets[corpse];
      if (set === null || set === undefined) {
        continue;
      }
      const clip: CompiledClip = set.clips[AnimationState.Death] ?? set.idle;
      const elapsed = (this.corpseElapsed[corpse] ?? 0) + deltaMs;
      this.corpseElapsed[corpse] = elapsed;
      if (elapsed >= clip.totalMs + CORPSE_LINGER_MS) {
        this.corpseSets[corpse] = null;
        continue;
      }
      this.corpseFrame[corpse] = clipFrameAt(clip, elapsed);
      this.corpseSlots[live] = corpse;
      live += 1;
    }
    this.corpseLive = live;
  }

  private ensureCapacity(needed: number): void {
    if (needed <= this.handles.length) {
      return;
    }
    const length = grownLength(needed, this.handles.length);
    this.handles = growInt32(this.handles, length);
    this.requested = growInt8(this.requested, length);
    this.playing = growInt8(this.playing, length);
    this.elapsed = growFloat64(this.elapsed, length);
    this.facings = growInt8(this.facings, length);
    this.frames = growInt16(this.frames, length);
    this.stamps = growInt32(this.stamps, length);
    this.lastX = growFloat32(this.lastX, length);
    this.lastY = growFloat32(this.lastY, length);
    this.lastRadius = growFloat32(this.lastRadius, length);
    this.active = growInt32(this.active, length);
    this.previous = growInt32(this.previous, length);
    while (this.sets.length < length) {
      this.sets.push(null);
    }
  }
}

function growInt8(source: Int8Array, length: number): Int8Array<ArrayBuffer> {
  const grown = new Int8Array(length);
  grown.set(source);
  return grown;
}

function growInt16(source: Int16Array, length: number): Int16Array<ArrayBuffer> {
  const grown = new Int16Array(length);
  grown.set(source);
  return grown;
}

function growInt32(source: Int32Array, length: number): Int32Array<ArrayBuffer> {
  const grown = new Int32Array(length);
  grown.set(source);
  return grown;
}

function growFloat32(source: Float32Array, length: number): Float32Array<ArrayBuffer> {
  const grown = new Float32Array(length);
  grown.set(source);
  return grown;
}

function growFloat64(source: Float64Array, length: number): Float64Array<ArrayBuffer> {
  const grown = new Float64Array(length);
  grown.set(source);
  return grown;
}
