import { describe, expect, it } from 'vitest';
import {
  AXIS_RESOLUTION,
  InputAction,
  axisToUnit,
  isActionDown,
  isActionPressed,
  quantiseAxis,
} from '../../src/sim/input/frame.js';
import { GamepadButton, createDefaultBindings } from '../../src/app/input/bindings.js';
import { DEFAULT_DEAD_ZONE, GamepadSource, type GamepadLike } from '../../src/app/input/gamepad.js';
import { KeyboardSource } from '../../src/app/input/keyboard.js';
import { InputSampler } from '../../src/app/input/sampler.js';
import { DEFAULT_TOUCH_DEAD_ZONE, TouchSource } from '../../src/app/input/touch.js';

interface PadState {
  axes: number[];
  pressed: number[];
  connected: boolean;
  id: string;
  mapping: string;
}

function createPadState(): PadState {
  return {
    axes: [0, 0, 0, 0],
    pressed: [],
    connected: true,
    id: 'Test Pad (standard)',
    mapping: 'standard',
  };
}

/** A pad the test drives directly, in place of `navigator.getGamepads()`. */
function padSource(state: PadState): GamepadSource {
  return new GamepadSource(() => {
    if (!state.connected) {
      return [null];
    }
    const pad: GamepadLike = {
      index: 0,
      id: state.id,
      connected: true,
      mapping: state.mapping,
      axes: state.axes,
      buttons: Array.from({ length: 16 }, (_unused, index) => ({
        pressed: state.pressed.includes(index),
        value: state.pressed.includes(index) ? 1 : 0,
      })),
    };
    return [pad];
  });
}

interface Harness {
  sampler: InputSampler;
  keyboard: KeyboardSource;
  gamepad: GamepadSource;
  touch: TouchSource;
  pad: PadState;
}

function harness(): Harness {
  const pad = createPadState();
  const keyboard = new KeyboardSource();
  const gamepad = padSource(pad);
  const touch = new TouchSource();
  const sampler = new InputSampler({ bindings: createDefaultBindings(), keyboard, gamepad, touch });
  return { sampler, keyboard, gamepad, touch, pad };
}

/**
 * Makes the pad the active device.
 *
 * Switching devices takes a deliberate push — resting drift must not steal the
 * on-screen prompts from the keyboard — so a test about small stick values has
 * to get the pad selected with a big one first.
 */
function selectGamepad({ sampler, pad }: Harness): void {
  const axes = pad.axes;
  pad.axes = [1, 0, 0, 0];
  sampler.sample();
  pad.axes = axes;
}

describe('keyboard sampling', () => {
  it('starts idle', () => {
    const { sampler } = harness();
    const frame = sampler.sample();
    expect(frame).toEqual({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, buttons: 0 });
  });

  it('moves on WASD, with screen-space signs', () => {
    const { sampler, keyboard } = harness();

    keyboard.keyDown('KeyD');
    expect(sampler.sample().moveX).toBe(AXIS_RESOLUTION);

    keyboard.keyUp('KeyD');
    keyboard.keyDown('KeyW');
    // Up the screen is negative y, matching the renderer's coordinates.
    expect(sampler.sample().moveY).toBe(-AXIS_RESOLUTION);
  });

  it('cancels opposing keys', () => {
    const { sampler, keyboard } = harness();
    keyboard.keyDown('KeyA');
    keyboard.keyDown('KeyD');
    expect(sampler.sample().moveX).toBe(0);
  });

  it('normalises diagonal movement to unit length', () => {
    // Without this the player moves 41% faster diagonally, the oldest bug in
    // top-down movement.
    const { sampler, keyboard } = harness();
    keyboard.keyDown('KeyW');
    keyboard.keyDown('KeyD');

    const frame = sampler.sample();
    const magnitude = Math.hypot(axisToUnit(frame.moveX), axisToUnit(frame.moveY));
    expect(magnitude).toBeGreaterThan(0.99);
    expect(magnitude).toBeLessThan(1.01);
  });

  it('aims with the arrow keys, independently of movement', () => {
    const { sampler, keyboard } = harness();
    keyboard.keyDown('KeyA');
    keyboard.keyDown('ArrowRight');

    const frame = sampler.sample();
    expect(frame.moveX).toBe(-AXIS_RESOLUTION);
    expect(frame.aimX).toBe(AXIS_RESOLUTION);
    expect(frame.moveY).toBe(0);
    expect(frame.aimY).toBe(0);
  });

  it('treats an arrow key as fire', () => {
    const { sampler, keyboard } = harness();
    keyboard.keyDown('ArrowUp');
    expect(isActionDown(sampler.sample(), InputAction.Fire)).toBe(true);
  });

  it('reads the bound buttons', () => {
    const { sampler, keyboard } = harness();
    keyboard.keyDown('KeyE');
    keyboard.keyDown('Tab');

    const frame = sampler.sample();
    expect(isActionDown(frame, InputAction.Bomb)).toBe(true);
    expect(isActionDown(frame, InputAction.Map)).toBe(true);
    expect(isActionDown(frame, InputAction.Use)).toBe(false);
  });

  it('follows a rebound key and forgets the old one', () => {
    const { sampler, keyboard } = harness();
    sampler.bindings.keyboard.moveRight = ['KeyL'];

    keyboard.keyDown('KeyD');
    expect(sampler.sample().moveX).toBe(0);

    keyboard.keyDown('KeyL');
    expect(sampler.sample().moveX).toBe(AXIS_RESOLUTION);
  });

  it('releases everything held when the window loses focus', () => {
    // A key held while the window blurs never sends its keyup, and the player
    // comes back to a character walking into a wall.
    const { sampler, keyboard } = harness();
    keyboard.keyDown('KeyD');
    expect(sampler.sample().moveX).toBe(AXIS_RESOLUTION);

    keyboard.clear();
    expect(sampler.sample().moveX).toBe(0);
  });
});

describe('gamepad sampling', () => {
  it('stays on the keyboard until the pad is touched', () => {
    const { sampler } = harness();
    sampler.sample();
    expect(sampler.activeDevice).toBe('keyboard');
  });

  it('switches to the pad when a stick moves', () => {
    const { sampler, pad } = harness();
    pad.axes = [1, 0, 0, 0];
    sampler.sample();
    expect(sampler.activeDevice).toBe('gamepad');
    expect(sampler.frame.moveX).toBe(AXIS_RESOLUTION);
  });

  it('moves and aims on separate sticks', () => {
    const { sampler, pad } = harness();
    pad.axes = [-1, 0, 0, 1];

    const frame = sampler.sample();
    expect(frame.moveX).toBe(-AXIS_RESOLUTION);
    expect(frame.moveY).toBe(0);
    expect(frame.aimX).toBe(0);
    expect(frame.aimY).toBe(AXIS_RESOLUTION);
  });

  it('applies a radial dead zone', () => {
    const rig = harness();
    const { sampler, pad } = rig;
    selectGamepad(rig);
    // Inside the dead zone on both axes: resting drift, not intent.
    pad.axes = [DEFAULT_DEAD_ZONE * 0.5, DEFAULT_DEAD_ZONE * 0.5, 0, 0];

    const frame = sampler.sample();
    expect(frame.moveX).toBe(0);
    expect(frame.moveY).toBe(0);
  });

  it('treats a diagonal push the same as an axial one', () => {
    // A per-axis dead zone leaves a square hole at the centre, so a gentle
    // diagonal push registers while the same push along an axis does not.
    // Players feel that as the stick sticking to the diagonals.
    const rig = harness();
    const { sampler, pad } = rig;
    selectGamepad(rig);
    const nudge = DEFAULT_DEAD_ZONE + 0.15;

    pad.axes = [nudge, 0, 0, 0];
    const axial = Math.abs(sampler.sample().moveX);

    pad.axes = [nudge * Math.SQRT1_2, nudge * Math.SQRT1_2, 0, 0];
    const diagonalFrame = sampler.sample();
    const diagonal = Math.hypot(diagonalFrame.moveX, diagonalFrame.moveY);

    expect(axial).toBeGreaterThan(0);
    expect(diagonal).toBeGreaterThan(0);
    expect(Math.abs(diagonal - axial)).toBeLessThanOrEqual(2);
  });

  it('rescales from the dead-zone edge rather than jumping', () => {
    const rig = harness();
    const { sampler, pad } = rig;
    selectGamepad(rig);

    pad.axes = [DEFAULT_DEAD_ZONE + 0.001, 0, 0, 0];
    expect(Math.abs(sampler.sample().moveX)).toBeLessThanOrEqual(1);

    pad.axes = [1, 0, 0, 0];
    expect(sampler.sample().moveX).toBe(AXIS_RESOLUTION);
  });

  it('falls back to the d-pad when the stick is centred', () => {
    const { sampler, pad } = harness();
    pad.pressed = [GamepadButton.DpadLeft];

    const frame = sampler.sample();
    expect(sampler.activeDevice).toBe('gamepad');
    expect(frame.moveX).toBe(-AXIS_RESOLUTION);
  });

  it('reads the bound pad buttons, including analog triggers', () => {
    const { sampler, pad } = harness();
    pad.pressed = [GamepadButton.RightTrigger, GamepadButton.Start];

    const frame = sampler.sample();
    expect(isActionDown(frame, InputAction.Fire)).toBe(true);
    expect(isActionDown(frame, InputAction.Pause)).toBe(true);
  });

  it('fires from the aim stick alone', () => {
    // Twin-stick convention: pushing the right stick is the fire command.
    const { sampler, pad } = harness();
    pad.axes = [0, 0, 1, 0];
    expect(isActionDown(sampler.sample(), InputAction.Fire)).toBe(true);
  });

  it('snaps the aim stick to the nearest of eight directions rather than a free angle', () => {
    // A shallow angle off due east snaps to due east — the same eight-way aim
    // arrow keys produce (docs/DECISIONS.md #20), not the free angle a stick
    // can otherwise report.
    const { sampler, pad } = harness();
    pad.axes = [0, 0, 0.9, 0.3];

    const frame = sampler.sample();
    expect(frame.aimX).toBe(AXIS_RESOLUTION);
    expect(frame.aimY).toBe(0);
  });

  it('snaps to a diagonal when the angle sits between two cardinals', () => {
    const { sampler, pad } = harness();
    pad.axes = [0, 0, 0.7, 0.9];

    const frame = sampler.sample();
    expect(frame.aimX).toBe(frame.aimY);
    expect(frame.aimX).toBeGreaterThan(0);
    const magnitude = Math.hypot(axisToUnit(frame.aimX), axisToUnit(frame.aimY));
    expect(magnitude).toBeGreaterThan(0.99);
    expect(magnitude).toBeLessThan(1.01);
  });

  it('leaves aim at rest inside the dead zone rather than snapping to a direction', () => {
    const rig = harness();
    const { sampler, pad } = rig;
    selectGamepad(rig);
    pad.axes = [0, 0, DEFAULT_DEAD_ZONE * 0.5, DEFAULT_DEAD_ZONE * 0.5];

    const frame = sampler.sample();
    expect(frame.aimX).toBe(0);
    expect(frame.aimY).toBe(0);
  });

  it('reports the pad id for glyph selection', () => {
    const { sampler, pad } = harness();
    pad.axes = [1, 0, 0, 0];
    sampler.sample();
    expect(sampler.gamepad.id).toBe('Test Pad (standard)');
    expect(sampler.gamepad.isStandardMapping).toBe(true);
  });
});

describe('touch sampling', () => {
  it('stays on the keyboard until a stick is dragged', () => {
    const { sampler } = harness();
    sampler.sample();
    expect(sampler.activeDevice).toBe('keyboard');
  });

  it('switches to touch when the move stick is dragged', () => {
    const { sampler, touch } = harness();
    touch.setMoveStick(1, 0);
    expect(sampler.sample().moveX).toBe(AXIS_RESOLUTION);
    expect(sampler.activeDevice).toBe('touch');
  });

  it('moves and aims on separate sticks', () => {
    const { sampler, touch } = harness();
    touch.setMoveStick(-1, 0);
    touch.setAimStick(0, 1);

    const frame = sampler.sample();
    expect(frame.moveX).toBe(-AXIS_RESOLUTION);
    expect(frame.moveY).toBe(0);
    expect(frame.aimX).toBe(0);
    expect(frame.aimY).toBe(AXIS_RESOLUTION);
  });

  it('applies a radial dead zone', () => {
    const { sampler, touch } = harness();
    touch.setMoveStick(1, 0);
    sampler.sample();

    touch.setMoveStick(DEFAULT_TOUCH_DEAD_ZONE * 0.5, DEFAULT_TOUCH_DEAD_ZONE * 0.5);
    const frame = sampler.sample();
    expect(frame.moveX).toBe(0);
    expect(frame.moveY).toBe(0);
  });

  it('reads the four touch buttons', () => {
    const { sampler, touch } = harness();
    touch.setButtonDown('bomb', true);
    touch.setButtonDown('map', true);

    const frame = sampler.sample();
    expect(isActionDown(frame, InputAction.Bomb)).toBe(true);
    expect(isActionDown(frame, InputAction.Map)).toBe(true);
    expect(isActionDown(frame, InputAction.Use)).toBe(false);
    expect(isActionDown(frame, InputAction.Pause)).toBe(false);
  });

  it('fires from the aim stick alone, the same twin-stick convention as the gamepad', () => {
    const { sampler, touch } = harness();
    touch.setAimStick(0, -1);
    expect(isActionDown(sampler.sample(), InputAction.Fire)).toBe(true);
  });

  it('snaps the aim stick to the nearest of eight directions rather than a free angle', () => {
    // docs/DECISIONS.md #20: eight-way aim on every device, touch included.
    const { sampler, touch } = harness();
    touch.setAimStick(0.9, 0.3);

    const frame = sampler.sample();
    expect(frame.aimX).toBe(AXIS_RESOLUTION);
    expect(frame.aimY).toBe(0);
  });

  it('leaves the move stick at rest inside the dead zone rather than drifting', () => {
    const { sampler, touch } = harness();
    touch.setMoveStick(1, 0);
    sampler.sample();

    touch.setMoveStick(0, 0);
    const frame = sampler.sample();
    expect(frame.moveX).toBe(0);
    expect(frame.moveY).toBe(0);
    // Once a stick is released the widget reports exactly (0, 0), not a
    // magnitude below the dead zone — this pins that the sampler still reads
    // it as fully at rest either way.
  });

  it('clears every stick and button on blur, the same as the keyboard', () => {
    const { sampler, touch } = harness();
    touch.setMoveStick(1, 0);
    touch.setButtonDown('bomb', true);
    sampler.sample();

    touch.clear();
    const frame = sampler.sample();
    expect(frame.moveX).toBe(0);
    expect(isActionDown(frame, InputAction.Bomb)).toBe(false);
  });
});

describe('hot-plug', () => {
  it('falls back to the keyboard when the pad disappears mid-run', () => {
    const { sampler, keyboard, pad } = harness();
    pad.axes = [1, 0, 0, 0];
    expect(sampler.sample().moveX).toBe(AXIS_RESOLUTION);
    expect(sampler.activeDevice).toBe('gamepad');

    pad.connected = false;
    keyboard.keyDown('KeyA');

    const frame = sampler.sample();
    expect(sampler.activeDevice).toBe('keyboard');
    expect(sampler.gamepad.connected).toBe(false);
    expect(sampler.gamepad.id).toBeNull();
    expect(frame.moveX).toBe(-AXIS_RESOLUTION);
  });

  it('produces an empty frame when the pad vanishes with nothing held', () => {
    const { sampler, pad } = harness();
    pad.axes = [1, 0, 0, 0];
    sampler.sample();

    pad.connected = false;
    const frame = sampler.sample();
    expect(frame).toEqual({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, buttons: 0 });
  });

  it('picks the pad up again when it comes back', () => {
    const { sampler, pad } = harness();
    pad.connected = false;
    sampler.sample();

    pad.connected = true;
    pad.axes = [0, 1, 0, 0];
    expect(sampler.sample().moveY).toBe(AXIS_RESOLUTION);
    expect(sampler.activeDevice).toBe('gamepad');
  });

  it('survives a pad list of nulls', () => {
    // Chromium pads the list to four entries, most of them null.
    const source = new GamepadSource(() => [null, null, null, null]);
    const sampler = new InputSampler({ keyboard: new KeyboardSource(), gamepad: source });
    expect(() => sampler.sample()).not.toThrow();
    expect(sampler.activeDevice).toBe('keyboard');
  });
});

describe('device switching', () => {
  it('follows whichever device the player touched last', () => {
    const { sampler, keyboard, pad } = harness();

    pad.axes = [1, 0, 0, 0];
    sampler.sample();
    expect(sampler.activeDevice).toBe('gamepad');

    // A held stick keeps counting as gamepad activity, so the player lets go
    // before reaching for the keyboard — as they would in practice.
    pad.axes = [0, 0, 0, 0];
    sampler.sample();
    keyboard.keyDown('KeyA');
    sampler.sample();
    expect(sampler.activeDevice).toBe('keyboard');

    pad.pressed = [GamepadButton.South];
    sampler.sample();
    expect(sampler.activeDevice).toBe('gamepad');
  });

  it('ignores stick drift below the activity threshold', () => {
    const { sampler, pad } = harness();
    pad.axes = [0.1, 0.1, 0, 0];
    sampler.sample();
    expect(sampler.activeDevice).toBe('keyboard');
  });

  it('moves between all three devices as each is touched in turn', () => {
    const { sampler, keyboard, pad, touch } = harness();

    keyboard.keyDown('KeyD');
    sampler.sample();
    expect(sampler.activeDevice).toBe('keyboard');

    pad.axes = [1, 0, 0, 0];
    sampler.sample();
    expect(sampler.activeDevice).toBe('gamepad');

    pad.axes = [0, 0, 0, 0];
    touch.setMoveStick(1, 0);
    sampler.sample();
    expect(sampler.activeDevice).toBe('touch');

    keyboard.keyUp('KeyD');
    keyboard.keyDown('KeyA');
    sampler.sample();
    expect(sampler.activeDevice).toBe('keyboard');
  });
});

describe('frame history', () => {
  it('keeps the previous frame for edge detection', () => {
    const { sampler, keyboard } = harness();

    keyboard.keyDown('KeyE');
    sampler.sample();
    expect(isActionPressed(sampler.frame, sampler.previousFrame, InputAction.Bomb)).toBe(true);

    sampler.sample();
    expect(isActionDown(sampler.frame, InputAction.Bomb)).toBe(true);
    expect(isActionPressed(sampler.frame, sampler.previousFrame, InputAction.Bomb)).toBe(false);
  });

  it('reuses its frames rather than allocating per tick', () => {
    const { sampler } = harness();
    expect(sampler.sample()).toBe(sampler.sample());
  });
});

describe('quantisation at the boundary', () => {
  it('never lets a raw float reach the frame', () => {
    const rig = harness();
    const { sampler, pad } = rig;
    selectGamepad(rig);
    // Values no quantised step lands on exactly.
    pad.axes = [0.6180339887, -0.3141592653, 0.7071067811, 0.5772156649];

    const frame = sampler.sample();
    expect(frame.moveX).not.toBe(0);
    expect(frame.aimX).not.toBe(0);
    for (const axis of [frame.moveX, frame.moveY, frame.aimX, frame.aimY]) {
      expect(Number.isInteger(axis)).toBe(true);
      expect(Math.abs(axis)).toBeLessThanOrEqual(AXIS_RESOLUTION);
    }
  });

  it('gives the same frame for stick values that differ below one step', () => {
    // The whole determinism argument: two machines reporting fractionally
    // different floats for the same physical stick position hand the
    // simulation the same integer.
    const rig = harness();
    const { sampler, pad } = rig;
    selectGamepad(rig);

    pad.axes = [0.5, 0, 0, 0];
    const first = sampler.sample().moveX;

    pad.axes = [0.5 + 1e-9, 0, 0, 0];
    expect(sampler.sample().moveX).toBe(first);
    expect(first).toBe(quantiseAxis((0.5 - DEFAULT_DEAD_ZONE) / (1 - DEFAULT_DEAD_ZONE)));
  });
});
