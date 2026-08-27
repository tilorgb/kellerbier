import { describe, expect, it } from 'vitest';
import {
  ALL_INPUT_ACTIONS,
  INPUT_FRAME_BYTES,
  InputAction,
  type InputFrame,
  createInputFrame,
  inputFramesEqual,
  isActionDown,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { InputPlayback, InputRecording } from '../../src/sim/input/recording.js';

function frameOf(
  moveX: number,
  moveY: number,
  aimX: number,
  aimY: number,
  buttons: number,
): InputFrame {
  return { moveX, moveY, aimX, aimY, buttons };
}

describe('input recording', () => {
  it('round-trips every frame it is given', () => {
    const recording = new InputRecording(4);
    const written = [
      frameOf(0, 0, 0, 0, 0),
      frameOf(127, -127, -127, 127, 0b11111),
      frameOf(-1, 1, 64, -64, 0b00101),
    ];
    for (const frame of written) {
      recording.push(frame);
    }

    expect(recording.length).toBe(3);
    const out = createInputFrame();
    for (let index = 0; index < written.length; index++) {
      recording.read(index, out);
      expect(inputFramesEqual(out, written[index] ?? out), `frame ${String(index)}`).toBe(true);
    }
  });

  it('preserves every action bit through a signed byte', () => {
    const recording = new InputRecording(1);
    const frame = createInputFrame();
    for (const action of ALL_INPUT_ACTIONS) {
      setActionDown(frame, action, true);
    }
    recording.push(frame);

    const out = createInputFrame();
    recording.read(0, out);
    for (const action of ALL_INPUT_ACTIONS) {
      expect(isActionDown(out, action), `action ${String(action)}`).toBe(true);
    }
    expect(out.buttons).toBe(frame.buttons);
  });

  it('grows past its initial capacity without losing anything', () => {
    const recording = new InputRecording(2);
    for (let tick = 0; tick < 500; tick++) {
      recording.push(frameOf(tick % 127, -(tick % 127), 0, 0, tick % 32));
    }

    expect(recording.length).toBe(500);
    expect(recording.capacity).toBeGreaterThanOrEqual(500);

    const out = createInputFrame();
    for (let tick = 0; tick < 500; tick++) {
      recording.read(tick, out);
      expect(out.moveX).toBe(tick % 127);
      expect(out.buttons).toBe(tick % 32);
    }
  });

  it('does not grow when capacity is reserved up front', () => {
    const recording = new InputRecording(8);
    recording.reserve(2000);
    const reserved = recording.capacity;
    for (let tick = 0; tick < 2000; tick++) {
      recording.push(frameOf(1, 2, 3, 4, 1));
    }
    // Recording happens inside the frame loop, so growth there is an
    // allocation in exactly the place the budget forbids one.
    expect(recording.capacity).toBe(reserved);
  });

  it('coasts to a stop rather than throwing when read past the end', () => {
    const recording = new InputRecording(2);
    recording.push(frameOf(100, 100, 100, 100, 0b11111));

    const out = createInputFrame();
    recording.read(5, out);
    expect(out).toEqual({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, buttons: 0 });
    recording.read(-1, out);
    expect(out).toEqual({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, buttons: 0 });
  });

  it('survives a trip through bytes', () => {
    const recording = new InputRecording(4);
    for (let tick = 0; tick < 50; tick++) {
      recording.push(frameOf(tick - 25, 25 - tick, tick, -tick, tick % 32));
    }

    const bytes = recording.toBytes();
    expect(bytes.length).toBe(50 * INPUT_FRAME_BYTES);

    const restored = InputRecording.fromBytes(bytes);
    expect(restored.length).toBe(50);

    const a = createInputFrame();
    const b = createInputFrame();
    for (let tick = 0; tick < 50; tick++) {
      recording.read(tick, a);
      restored.read(tick, b);
      expect(inputFramesEqual(a, b), `frame ${String(tick)}`).toBe(true);
    }
  });

  it('rejects bytes that are not a whole number of frames', () => {
    expect(() => InputRecording.fromBytes(new Int8Array(7))).toThrow(/whole number/);
  });

  it('rejects a nonsensical capacity', () => {
    expect(() => new InputRecording(0)).toThrow(RangeError);
    expect(() => new InputRecording(1.5)).toThrow(RangeError);
  });

  it('keeps its buffer when cleared', () => {
    const recording = new InputRecording(64);
    recording.push(frameOf(1, 1, 1, 1, 1));
    const capacity = recording.capacity;
    recording.clear();
    expect(recording.length).toBe(0);
    expect(recording.capacity).toBe(capacity);
  });
});

describe('input playback', () => {
  it('replays a recording frame for frame', () => {
    const recording = new InputRecording(16);
    const script = [
      frameOf(127, 0, 0, 0, 0),
      frameOf(90, 90, -127, 0, 1 << InputAction.Fire),
      frameOf(0, 0, 0, 0, 1 << InputAction.Bomb),
    ];
    for (const frame of script) {
      recording.push(frame);
    }

    const playback = new InputPlayback(recording);
    for (const expected of script) {
      expect(playback.finished).toBe(false);
      expect(inputFramesEqual(playback.next(), expected)).toBe(true);
    }
    expect(playback.finished).toBe(true);
  });

  it('produces empty frames past the end instead of failing', () => {
    const recording = new InputRecording(2);
    recording.push(frameOf(1, 1, 1, 1, 1));

    const playback = new InputPlayback(recording);
    playback.next();
    const after = playback.next();
    expect(after).toEqual({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, buttons: 0 });
  });

  it('rewinds to the start', () => {
    const recording = new InputRecording(4);
    recording.push(frameOf(50, 0, 0, 0, 0));
    recording.push(frameOf(60, 0, 0, 0, 0));

    const playback = new InputPlayback(recording);
    expect(playback.next().moveX).toBe(50);
    expect(playback.next().moveX).toBe(60);
    playback.rewind();
    expect(playback.position).toBe(0);
    expect(playback.next().moveX).toBe(50);
  });
});
