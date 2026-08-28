import {
  ANIMATION_STATES,
  CLIP_END_ACTIONS,
  CLIP_MODES,
  type AnimationStateId,
  type ClipEndAction,
  type ClipMode,
} from '../../../tools/art/spec.mjs';
import { validateAnimation } from '../../../tools/art/validate.mjs';

/**
 * Animation clips: what an `*.anim.json` sidecar says, compiled into what the
 * animator plays.
 *
 * ## Why this lives in `render/` and nowhere else
 *
 * A frame index is presentation. The moment an `animationFrame` field appears
 * on an entity in `sim/`, the simulation's determinism depends on presentation
 * timing — a 144 Hz display and a 60 Hz one stop agreeing about what tick a
 * body was on, and replays, seeded runs and headless tests go with it. So the
 * animator keeps its own render-side table (`animator.ts`) keyed by entity
 * handle, exactly the way `render/entities.ts` already keys sprites, and reads
 * simulation state without ever writing to it. `docs/DECISIONS.md` #37 and the
 * `sim/`-layering lint rule in `tools/eslint/architecture.js` are the two
 * halves of keeping it that way.
 *
 * ## Where the authoring lives
 *
 * Next to the art, in the sidecar the art build already reads and validates
 * (`assets/sprites/README.md`'s "Clips"). Not in `src/content/`: a clip is a
 * frame list over one specific strip, so authoring it anywhere other than
 * beside that strip means two files that have to agree about a frame count and
 * a build that can only check one of them. Adding an animated creature is
 * dropping `name.strip.png` and `name.anim.json` into the right folder — no
 * engine change, which is the same bar `CONTRIBUTING.md`'s content
 * definition-of-done sets for enemies and items.
 *
 * ## Two places validate, and they share one implementation
 *
 * `validateAnimation` (`tools/art/validate.mjs`) is what the art build runs,
 * so a clip naming a state nothing plays, or a frame the strip does not have,
 * fails CI. `compileAnimationSet` below runs the *same function* again at load
 * time and then adds the one check the build cannot make — that the frame
 * count the sidecar declares is the frame count the loaded texture actually
 * divides into — and throws on either. That is `docs/DECISIONS.md` #7's rule
 * for content shape: thrown at construction, never silently tolerated.
 */

/** The animation states, in the numeric order the animator's tables use. */
export const AnimationState = {
  Idle: 0,
  Move: 1,
  Telegraph: 2,
  Hurt: 3,
  Death: 4,
} as const;

export type AnimationStateIndex = (typeof AnimationState)[keyof typeof AnimationState];

/**
 * `AnimationState` as ids, index-aligned — so a numeric state can be named in
 * a warning or a debug panel, and a sidecar's clip key can be turned into an
 * index. Sourced from `tools/art/spec.mjs` rather than re-listed here: the
 * build's idea of a legal clip name and the animator's must agree, and one
 * constant makes that true rather than merely checkable.
 */
export const ANIMATION_STATE_IDS: readonly AnimationStateId[] = ANIMATION_STATES;

/** Number of distinct animation states — the width of the animator's per-state tables. */
export const ANIMATION_STATE_COUNT = ANIMATION_STATE_IDS.length;

/** The state index for an id, or `-1` for a string that is not one. */
export function animationStateIndex(id: string): number {
  return ANIMATION_STATE_IDS.indexOf(id as AnimationStateId);
}

/** One clip, as authored. */
export interface AnimationClipSpec {
  readonly frames: readonly number[];
  readonly frameDurationMs: number | readonly number[];
  readonly mode: ClipMode;
  readonly onEnd?: ClipEndAction;
}

/** An `*.anim.json` sidecar, as authored. */
export interface AnimationSidecar {
  readonly frames: number;
  readonly frameDurationMs: number | readonly number[];
  readonly loop: boolean;
  readonly clips?: Readonly<Partial<Record<AnimationStateId, AnimationClipSpec>>>;
}

/**
 * A clip, compiled for playback.
 *
 * `sequence`/`durations` are the *expanded* playback order: a `pingPong` clip
 * is unrolled at compile time into the frames it actually visits, so playback
 * never has to know which direction it is travelling in — it walks one array
 * forwards and either wraps or stops. Typed arrays rather than `number[]`
 * because this is read every frame for every visible body, and because the
 * animator is allocation-free by contract.
 */
export interface CompiledClip {
  /** Which state this clip is authored for. */
  readonly state: AnimationStateIndex;
  /** Frame indices into the strip, in playback order. */
  readonly sequence: Int16Array;
  /** Milliseconds each entry of `sequence` is held for. */
  readonly durations: Float32Array;
  /** Sum of `durations` — one full pass of `sequence`. Never zero. */
  readonly totalMs: number;
  /** Whether a pass that reaches the end starts over. */
  readonly repeats: boolean;
  /** A finished `once` clip that holds its last frame rather than handing back to idle. */
  readonly holds: boolean;
}

/** Every clip authored for one strip, indexed by animation state. */
export interface CompiledAnimationSet {
  /** The sprite name the strip was authored under (`kellerassel`), for warnings and the debug overlay. */
  readonly name: string;
  /** Frames in the strip. Every `sequence` entry is inside `[0, frameCount)`. */
  readonly frameCount: number;
  /** Clip per `AnimationState`, or `null` where nothing has been authored yet. */
  readonly clips: readonly (CompiledClip | null)[];
  /** The idle clip. Always present — everything else falls back to it. */
  readonly idle: CompiledClip;
}

/**
 * Compiles one sidecar against the strip that was actually loaded.
 *
 * `frameCount` is measured off the texture (strip width / frame width), not
 * taken from the sidecar, so the two disagreeing is caught here rather than
 * becoming an out-of-bounds frame rectangle later. Throws on anything wrong,
 * naming `source` — a sprite whose animation data does not make sense is a
 * bug, and a bug that throws at load is one somebody fixes today.
 */
export function compileAnimationSet(
  source: string,
  sidecar: AnimationSidecar,
  frameCount: number,
): CompiledAnimationSet {
  const shapeError = validateAnimation(sidecar as unknown as Record<string, unknown>);
  if (shapeError !== null) {
    throw new Error(`${source}.anim.json: ${shapeError}`);
  }
  if (sidecar.frames !== frameCount) {
    throw new Error(
      `${source}.anim.json declares ${String(sidecar.frames)} frame(s), but ${source}.strip.png ` +
        `divides into ${String(frameCount)}`,
    );
  }

  const clips: (CompiledClip | null)[] = new Array<CompiledClip | null>(ANIMATION_STATE_COUNT).fill(
    null,
  );

  const authored = sidecar.clips;
  if (authored === undefined) {
    // A sidecar from before clips existed — every one the pixel editor has
    // written so far. The strip is one looping clip, and it is the idle one,
    // so a creature drawn as a single cycle still animates and every other
    // state falls back to it. Deliberately not "the strip is the move clip":
    // idle is the state the fallback chain terminates in, and a set whose
    // only clip were `move` would have nothing to fall back *to*.
    clips[AnimationState.Idle] = compileClip(
      source,
      AnimationState.Idle,
      {
        frames: wholeStrip(frameCount),
        frameDurationMs: sidecar.frameDurationMs,
        mode: sidecar.loop ? 'loop' : 'once',
        ...(sidecar.loop ? {} : { onEnd: 'hold' as const }),
      },
      frameCount,
    );
  } else {
    for (const [id, spec] of Object.entries(authored)) {
      const state = animationStateIndex(id);
      if (state < 0) {
        // Unreachable: `validateAnimation` above rejects an unknown clip name
        // outright. Kept as a throw rather than a skip so that a future
        // divergence between the two surfaces as an error and not as a clip
        // that quietly never plays.
        throw new Error(`${source}.anim.json: "clips.${id}" is not an animation state`);
      }
      clips[state] = compileClip(source, state as AnimationStateIndex, spec, frameCount);
    }
  }

  const idle = clips[AnimationState.Idle];
  if (idle === undefined || idle === null) {
    throw new Error(`${source}.anim.json: no "idle" clip, which every other state falls back to`);
  }

  return { name: source, frameCount, clips, idle };
}

function wholeStrip(frameCount: number): number[] {
  const frames: number[] = [];
  for (let frame = 0; frame < frameCount; frame++) {
    frames.push(frame);
  }
  return frames;
}

function compileClip(
  source: string,
  state: AnimationStateIndex,
  spec: AnimationClipSpec,
  frameCount: number,
): CompiledClip {
  const authoredFrames = spec.frames;
  if (authoredFrames.length === 0) {
    throw new Error(
      `${source}.anim.json: "clips.${ANIMATION_STATE_IDS[state] ?? '?'}" has no frames`,
    );
  }
  for (const frame of authoredFrames) {
    if (!Number.isInteger(frame) || frame < 0 || frame >= frameCount) {
      throw new Error(
        `${source}.anim.json: "clips.${ANIMATION_STATE_IDS[state] ?? '?'}" plays frame ` +
          `${String(frame)}, which the strip does not have (it has ${String(frameCount)})`,
      );
    }
  }
  if (!CLIP_MODES.includes(spec.mode)) {
    throw new Error(
      `${source}.anim.json: "clips.${ANIMATION_STATE_IDS[state] ?? '?'}" has mode ` +
        `"${spec.mode}", expected one of ${CLIP_MODES.join(', ')}`,
    );
  }
  if (spec.onEnd !== undefined && !CLIP_END_ACTIONS.includes(spec.onEnd)) {
    throw new Error(
      `${source}.anim.json: "clips.${ANIMATION_STATE_IDS[state] ?? '?'}" has onEnd ` +
        `"${spec.onEnd}", expected one of ${CLIP_END_ACTIONS.join(', ')}`,
    );
  }

  const durationOf = (entry: number): number => {
    const authored = spec.frameDurationMs;
    const duration = typeof authored === 'number' ? authored : (authored[entry] ?? 0);
    if (!(duration > 0)) {
      throw new Error(
        `${source}.anim.json: "clips.${ANIMATION_STATE_IDS[state] ?? '?'}" frame ` +
          `${String(entry)} has a non-positive duration`,
      );
    }
    return duration;
  };

  // Ping-pong unrolls to the frames it visits, both endpoints played once:
  // [0,1,2,3] becomes [0,1,2,3,2,1], a six-entry cycle. Playing the endpoints
  // twice is the classic ping-pong stutter — the pose the eye lingers on is
  // the one at the turn, so holding it for two frame durations reads as a
  // hitch rather than as a turn.
  const order: number[] = [];
  for (let entry = 0; entry < authoredFrames.length; entry++) {
    order.push(entry);
  }
  if (spec.mode === 'pingPong') {
    for (let entry = authoredFrames.length - 2; entry >= 1; entry--) {
      order.push(entry);
    }
  }

  const sequence = new Int16Array(order.length);
  const durations = new Float32Array(order.length);
  let totalMs = 0;
  for (let slot = 0; slot < order.length; slot++) {
    const entry = order[slot] ?? 0;
    sequence[slot] = authoredFrames[entry] ?? 0;
    const duration = durationOf(entry);
    durations[slot] = duration;
    totalMs += duration;
  }

  return {
    state,
    sequence,
    durations,
    totalMs,
    repeats: spec.mode !== 'once',
    // A `once` clip with no `onEnd` holds: the death clip is the case that
    // matters, and a corpse that pops back to its idle pose is worse than one
    // that stays down. `onEnd: 'idle'` is the opt-in for a flinch.
    holds: spec.mode === 'once' && spec.onEnd !== 'idle',
  };
}

/**
 * Which frame of `clip` is showing `elapsedMs` into it, and whether the clip
 * has finished.
 *
 * Returns the frame index into the strip. A finished non-repeating clip
 * returns its last frame, which is what a held death pose is.
 *
 * @hot — called once per animated body per frame. No allocation: the linear
 * scan is over at most a handful of entries, which is cheaper than the
 * cumulative-offset array it would otherwise need to keep in step.
 */
export function clipFrameAt(clip: CompiledClip, elapsedMs: number): number {
  const last = clip.sequence.length - 1;
  let remaining = elapsedMs;
  if (clip.repeats) {
    remaining = elapsedMs % clip.totalMs;
  } else if (elapsedMs >= clip.totalMs) {
    return clip.sequence[last] ?? 0;
  }
  for (let slot = 0; slot <= last; slot++) {
    remaining -= clip.durations[slot] ?? 0;
    if (remaining < 0) {
      return clip.sequence[slot] ?? 0;
    }
  }
  return clip.sequence[last] ?? 0;
}

/** Whether a non-repeating clip has played out. Always `false` for a repeating one. */
export function clipHasEnded(clip: CompiledClip, elapsedMs: number): boolean {
  return !clip.repeats && elapsedMs >= clip.totalMs;
}
