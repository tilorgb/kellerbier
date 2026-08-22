import { INPUT_FRAME_BYTES, type InputFrame, clearInputFrame, createInputFrame } from './frame.js';

/**
 * A recorded input log.
 *
 * One of these plus a seed is a complete run. It is what makes a bug report
 * reproducible, and it is the input to the determinism test: replay the log,
 * hash the end state, compare.
 *
 * Frames are stored packed in an `Int8Array` — four axes and a button mask per
 * tick — so a half-hour run is a few hundred kilobytes and can be written to a
 * save file or attached to a crash report without further encoding.
 */
export class InputRecording {
  private buffer: Int8Array;
  private frameCount = 0;

  constructor(initialCapacityFrames = 4096) {
    if (!Number.isInteger(initialCapacityFrames) || initialCapacityFrames < 1) {
      throw new RangeError(
        `Recording capacity must be a positive integer, got ${String(initialCapacityFrames)}`,
      );
    }
    this.buffer = new Int8Array(initialCapacityFrames * INPUT_FRAME_BYTES);
  }

  /** Ticks recorded so far. */
  get length(): number {
    return this.frameCount;
  }

  /** Frames the buffer can hold before it has to grow. */
  get capacity(): number {
    return this.buffer.length / INPUT_FRAME_BYTES;
  }

  /**
   * Reserves space for `frames` ticks.
   *
   * Recording happens once per tick, so growth would otherwise land inside the
   * frame loop. Reserving the expected run length up front keeps it out.
   */
  reserve(frames: number): void {
    const needed = frames * INPUT_FRAME_BYTES;
    if (needed <= this.buffer.length) {
      return;
    }
    const grown = new Int8Array(needed);
    grown.set(this.buffer);
    this.buffer = grown;
  }

  /** Appends one tick. */
  push(frame: Readonly<InputFrame>): void {
    if ((this.frameCount + 1) * INPUT_FRAME_BYTES > this.buffer.length) {
      this.reserve(Math.max(1, this.capacity * 2));
    }
    const offset = this.frameCount * INPUT_FRAME_BYTES;
    this.buffer[offset] = frame.moveX;
    this.buffer[offset + 1] = frame.moveY;
    this.buffer[offset + 2] = frame.aimX;
    this.buffer[offset + 3] = frame.aimY;
    this.buffer[offset + 4] = frame.buttons;
    this.frameCount += 1;
  }

  /**
   * Reads tick `index` into `out`.
   *
   * Reading past the end clears the frame rather than throwing: a replay that
   * outlives its log should coast to a stop with no input, not crash.
   */
  read(index: number, out: InputFrame): void {
    if (index < 0 || index >= this.frameCount) {
      clearInputFrame(out);
      return;
    }
    const offset = index * INPUT_FRAME_BYTES;
    out.moveX = this.buffer[offset] ?? 0;
    out.moveY = this.buffer[offset + 1] ?? 0;
    out.aimX = this.buffer[offset + 2] ?? 0;
    out.aimY = this.buffer[offset + 3] ?? 0;
    // The button mask is stored in a signed byte; mask it back to unsigned.
    out.buttons = (this.buffer[offset + 4] ?? 0) & 0xff;
  }

  /** Discards everything recorded, keeping the buffer for reuse. */
  clear(): void {
    this.frameCount = 0;
  }

  /** A copy of the recorded bytes, for a save file or a bug report. */
  toBytes(): Int8Array {
    return this.buffer.slice(0, this.frameCount * INPUT_FRAME_BYTES);
  }

  /** Rebuilds a recording from bytes produced by `toBytes`. */
  static fromBytes(bytes: Int8Array): InputRecording {
    if (bytes.length % INPUT_FRAME_BYTES !== 0) {
      throw new RangeError(
        `A recording is a whole number of ${String(INPUT_FRAME_BYTES)}-byte frames, got ${String(bytes.length)} bytes`,
      );
    }
    const frames = bytes.length / INPUT_FRAME_BYTES;
    const recording = new InputRecording(Math.max(1, frames));
    recording.buffer.set(bytes);
    recording.frameCount = frames;
    return recording;
  }
}

/**
 * Plays a recording back as if it were a live input source.
 *
 * The simulation cannot tell the difference, which is the point — a replay runs
 * the same code path as a live run, so it reproduces the same bugs.
 */
export class InputPlayback {
  private readonly frame = createInputFrame();
  private cursor = 0;

  constructor(private readonly recording: InputRecording) {}

  /** Ticks played so far. */
  get position(): number {
    return this.cursor;
  }

  /** True once every recorded tick has been consumed. */
  get finished(): boolean {
    return this.cursor >= this.recording.length;
  }

  /** The next tick's input. The returned frame is reused between calls. */
  next(): Readonly<InputFrame> {
    this.recording.read(this.cursor, this.frame);
    this.cursor += 1;
    return this.frame;
  }

  rewind(): void {
    this.cursor = 0;
  }
}
