import { describe, expect, it } from 'vitest';
import {
  INPUT_FRAME_BYTES,
  InputAction,
  type InputFrame,
  axisToUnit,
  createInputFrame,
  inputFramesEqual,
  isActionDown,
} from '../../src/sim/input/frame.js';
import { InputPlayback, InputRecording } from '../../src/sim/input/recording.js';
import { RngStream, createStreamRng } from '../../src/sim/rng/streams.js';
import { createDefaultBindings } from '../../src/app/input/bindings.js';
import { GamepadSource, type GamepadLike } from '../../src/app/input/gamepad.js';
import { KeyboardMouseSource } from '../../src/app/input/keyboard.js';
import { InputSampler } from '../../src/app/input/sampler.js';

/**
 * The determinism claim in one file: a run is its seed plus its input log.
 *
 * A stand-in simulation, small enough to read and containing the two things
 * that break reproducibility if the boundary leaks — it integrates the axes as
 * floats, and it draws from a seeded stream on a button press, so a single
 * differing input shifts every later random number as well as the position.
 */
const TICKS = 600;
/** The pad is unplugged part-way through the scripted run. */
const UNPLUG_TICK = 400;
const RUN_SEED = 0xbee2_2026;

interface SimState {
  x: number;
  y: number;
  shots: number;
  scatter: number;
}

function stepSim(
  state: SimState,
  frame: Readonly<InputFrame>,
  rng: ReturnType<typeof createStreamRng>,
): void {
  state.x += axisToUnit(frame.moveX) * 2.5;
  state.y += axisToUnit(frame.moveY) * 2.5;
  if (isActionDown(frame, InputAction.Fire)) {
    state.shots += 1;
    // Spread drawn from the seeded stream: one extra draw shifts every random
    // number after it, so a replay that diverges by one tick cannot match.
    state.scatter += rng.nextFloat() * (axisToUnit(frame.aimX) + axisToUnit(frame.aimY));
  }
}

/** A hash of the end state, which is what a determinism test actually compares. */
function hashState(state: SimState): string {
  return [state.x, state.y, state.shots, state.scatter]
    .map((value) => value.toString(16))
    .join(':');
}

function runSim(frames: Iterable<Readonly<InputFrame>>): SimState {
  const state: SimState = { x: 320, y: 180, shots: 0, scatter: 0 };
  const rng = createStreamRng(RUN_SEED, RngStream.Enemies);
  for (const frame of frames) {
    stepSim(state, frame, rng);
  }
  return state;
}

interface PadState {
  axes: number[];
  pressed: number[];
  connected: boolean;
}

/**
 * A scripted run: sticks sweeping, buttons pressed on a rhythm, the pad
 * unplugged part-way through and the keyboard taking over.
 *
 * `jitter` stands in for a second machine — a different driver, browser or
 * controller firmware reporting fractionally different floats for the same
 * physical stick position.
 */
function scriptPad(tick: number, pad: PadState, jitter: number): void {
  if (tick >= UNPLUG_TICK) {
    pad.connected = false;
    return;
  }
  pad.axes = [
    Math.sin(tick / 23) + jitter,
    Math.cos(tick / 31) + jitter,
    Math.sin(tick / 17) + jitter,
    Math.cos(tick / 13) + jitter,
  ];
  pad.pressed = tick % 7 === 0 ? [7] : tick % 11 === 0 ? [6, 9] : [];
}

function scriptKeyboard(tick: number, keyboard: KeyboardMouseSource): void {
  if (tick < UNPLUG_TICK) {
    return;
  }
  // Movement keys on a rhythm, plus mouse aim, once the pad is gone.
  keyboard.keyUp('KeyW');
  keyboard.keyUp('KeyA');
  keyboard.keyDown(tick % 5 < 3 ? 'KeyW' : 'KeyA');
  keyboard.movePointer(320 + Math.sin(tick / 9) * 100, 180 + Math.cos(tick / 9) * 100);
  if (tick % 3 === 0) {
    keyboard.mouseDown(0);
  } else {
    keyboard.mouseUp(0);
  }
}

/** Plays the scripted run through the real sampler and records every frame. */
function recordScriptedRun(jitter = 0): { recording: InputRecording; state: SimState } {
  const pad: PadState = { axes: [0, 0, 0, 0], pressed: [], connected: true };
  const keyboard = new KeyboardMouseSource();
  const gamepad = new GamepadSource(() => {
    if (!pad.connected) {
      return [null, null];
    }
    const device: GamepadLike = {
      index: 0,
      id: 'Scripted Pad (STANDARD GAMEPAD)',
      connected: true,
      mapping: 'standard',
      axes: pad.axes,
      buttons: Array.from({ length: 16 }, (_unused, index) => ({
        pressed: pad.pressed.includes(index),
        value: pad.pressed.includes(index) ? 1 : 0,
      })),
    };
    return [device, null];
  });

  const sampler = new InputSampler({ bindings: createDefaultBindings(), keyboard, gamepad });
  const recording = new InputRecording(TICKS);
  const state: SimState = { x: 320, y: 180, shots: 0, scatter: 0 };
  const rng = createStreamRng(RUN_SEED, RngStream.Enemies);

  for (let tick = 0; tick < TICKS; tick++) {
    scriptPad(tick, pad, jitter);
    scriptKeyboard(tick, keyboard);
    sampler.setAimOrigin(state.x, state.y);

    const frame = sampler.sample();
    recording.push(frame);
    stepSim(state, frame, rng);
  }

  return { recording, state };
}

function* replayFrames(recording: InputRecording): Generator<Readonly<InputFrame>> {
  const playback = new InputPlayback(recording);
  while (!playback.finished) {
    yield playback.next();
  }
}

describe('replaying a recorded run', () => {
  it('reproduces the run exactly', () => {
    const { recording, state } = recordScriptedRun();
    expect(recording.length).toBe(TICKS);

    const replayed = runSim(replayFrames(recording));

    expect(hashState(replayed)).toBe(hashState(state));
    expect(replayed.shots).toBeGreaterThan(0);
    expect(replayed.scatter).not.toBe(0);
  });

  it('reproduces it again from the serialised bytes', () => {
    // What a bug report or a save file actually carries.
    const { recording, state } = recordScriptedRun();
    const restored = InputRecording.fromBytes(recording.toBytes());

    expect(restored.length).toBe(TICKS);
    expect(hashState(runSim(replayFrames(restored)))).toBe(hashState(state));
  });

  it('replays the same log identically however often it is run', () => {
    const { recording } = recordScriptedRun();
    const first = hashState(runSim(replayFrames(recording)));
    const second = hashState(runSim(replayFrames(recording)));
    expect(second).toBe(first);
  });

  it('reads back every frame byte for byte', () => {
    const { recording } = recordScriptedRun();
    const restored = InputRecording.fromBytes(recording.toBytes());

    const original = createInputFrame();
    const copy = createInputFrame();
    for (let tick = 0; tick < TICKS; tick++) {
      recording.read(tick, original);
      restored.read(tick, copy);
      expect(inputFramesEqual(original, copy), `tick ${String(tick)}`).toBe(true);
    }
  });

  it('replays a log recorded on hardware that reports different floats', () => {
    // The point of quantising at the boundary, stated precisely.
    //
    // It does not claim two machines produce the same log: a stick reading a
    // whisker high still crosses a rounding boundary now and then, so the logs
    // differ by at most one step on an axis. What it claims is that whatever a
    // machine records is exactly what its simulation consumed — integers, not
    // floats re-derived at playback — so either log replays exactly, anywhere.
    // Recording raw floats gives the opposite: a log that reproduces only on
    // the machine that made it, which is the worst kind of failure because it
    // looks like it works.
    const original = recordScriptedRun();
    const elsewhere = recordScriptedRun(0.0005);

    const here = original.recording.toBytes();
    const there = elsewhere.recording.toBytes();
    expect(there.length).toBe(here.length);
    // Only the gamepad half of the run: past the unplug, aim is measured from
    // the player's position, so the two runs feed their own drift back in and
    // the bound stops being about quantisation at all.
    const gamepadBytes = UNPLUG_TICK * INPUT_FRAME_BYTES;
    for (let index = 0; index < gamepadBytes; index++) {
      const drift = Math.abs((there[index] ?? 0) - (here[index] ?? 0));
      expect(drift, `byte ${String(index)}`).toBeLessThanOrEqual(1);
    }

    expect(hashState(runSim(replayFrames(elsewhere.recording)))).toBe(hashState(elsewhere.state));
    expect(hashState(runSim(replayFrames(original.recording)))).toBe(hashState(original.state));
  });

  it('records the unplug and the fallback to the keyboard', () => {
    // The run continues across a mid-run disconnect, and the log carries what
    // the keyboard produced afterwards.
    const { recording } = recordScriptedRun();

    const frame = createInputFrame();
    let framesAfterUnplug = 0;
    for (let tick = UNPLUG_TICK + 20; tick < TICKS; tick++) {
      recording.read(tick, frame);
      if (frame.moveX !== 0 || frame.moveY !== 0) {
        framesAfterUnplug += 1;
      }
    }
    expect(framesAfterUnplug).toBeGreaterThan(0);
  });

  it('coasts to a stop when the replay outlives the log', () => {
    // A replay running past its last recorded tick has to stop, not crash.
    const { recording } = recordScriptedRun();
    const playback = new InputPlayback(recording);
    for (let tick = 0; tick < TICKS; tick++) {
      playback.next();
    }

    expect(playback.finished).toBe(true);
    expect(playback.next()).toEqual({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, buttons: 0 });
  });
});
