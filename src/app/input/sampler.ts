import {
  InputAction,
  type InputActionId,
  type InputFrame,
  clearInputFrame,
  copyInputFrame,
  createInputFrame,
  quantiseAxis,
} from '../../sim/input/frame.js';
import { type BindableAction, type Bindings, createDefaultBindings } from './bindings.js';
import { GamepadAxis, GamepadSource } from './gamepad.js';
import { KeyboardSource } from './keyboard.js';

/** Which family of device the player last touched, for on-screen glyphs. */
export type ActiveDevice = 'keyboard' | 'gamepad';

export interface InputSamplerOptions {
  readonly bindings?: Bindings;
  readonly keyboard?: KeyboardSource;
  readonly gamepad?: GamepadSource;
}

/**
 * Turns device state into one `InputFrame` per tick.
 *
 * Everything device-shaped stops here. Past this point the game — and the
 * recording, and the replay — sees quantised integers and a button mask, which
 * is what makes keyboard and gamepad interchangeable and a run reproducible.
 */
export class InputSampler {
  readonly keyboard: KeyboardSource;
  readonly gamepad: GamepadSource;
  bindings: Bindings;

  private readonly current = createInputFrame();
  private readonly previous = createInputFrame();

  private lastKeyboardActivity = 0;
  private lastGamepadActivity = 0;
  private device: ActiveDevice = 'keyboard';

  constructor(options: InputSamplerOptions = {}) {
    this.bindings = options.bindings ?? createDefaultBindings();
    this.keyboard = options.keyboard ?? new KeyboardSource();
    this.gamepad = options.gamepad ?? new GamepadSource();
  }

  /** The device the player most recently used. */
  get activeDevice(): ActiveDevice {
    return this.device;
  }

  /** The frame produced by the last `sample`. */
  get frame(): Readonly<InputFrame> {
    return this.current;
  }

  /** The frame before that, for edge detection. */
  get previousFrame(): Readonly<InputFrame> {
    return this.previous;
  }

  /**
   * Samples every device into a fresh frame. Call once per simulation tick.
   *
   * Allocation-free: both frames are owned by the sampler and reused.
   */
  sample(): Readonly<InputFrame> {
    copyInputFrame(this.current, this.previous);
    clearInputFrame(this.current);

    this.gamepad.update();
    this.updateActiveDevice();

    if (this.device === 'gamepad') {
      this.sampleGamepad();
    } else {
      this.sampleKeyboard();
    }

    return this.current;
  }

  /**
   * Picks the device to read this tick.
   *
   * Whichever the player touched most recently wins, and an unplugged
   * controller falls straight back to keyboard rather than freezing input.
   */
  private updateActiveDevice(): void {
    const keyboardActivity = this.keyboard.activityCounter;
    const gamepadActivity = this.gamepad.activityCounter;

    if (!this.gamepad.connected) {
      this.device = 'keyboard';
    } else if (gamepadActivity > this.lastGamepadActivity) {
      this.device = 'gamepad';
    } else if (keyboardActivity > this.lastKeyboardActivity) {
      this.device = 'keyboard';
    }

    this.lastKeyboardActivity = keyboardActivity;
    this.lastGamepadActivity = gamepadActivity;
  }

  private isKeyboardActionDown(action: BindableAction): boolean {
    for (const code of this.bindings.keyboard[action]) {
      if (this.keyboard.isKeyDown(code)) {
        return true;
      }
    }
    return false;
  }

  private isGamepadActionDown(action: BindableAction): boolean {
    for (const button of this.bindings.gamepad[action]) {
      if (this.gamepad.isButtonDown(button)) {
        return true;
      }
    }
    return false;
  }

  private setButton(action: InputActionId, bindable: BindableAction, gamepadDevice: boolean): void {
    const down = gamepadDevice
      ? this.isGamepadActionDown(bindable)
      : this.isKeyboardActionDown(bindable);
    if (down) {
      this.current.buttons |= 1 << action;
    }
  }

  private sampleButtons(gamepadDevice: boolean): void {
    this.setButton(InputAction.Fire, 'fire', gamepadDevice);
    this.setButton(InputAction.Bomb, 'bomb', gamepadDevice);
    this.setButton(InputAction.Use, 'use', gamepadDevice);
    this.setButton(InputAction.Map, 'map', gamepadDevice);
    this.setButton(InputAction.Pause, 'pause', gamepadDevice);
  }

  private sampleGamepad(): void {
    this.gamepad.readStick(GamepadAxis.LeftStickX, GamepadAxis.LeftStickY);
    let moveX = this.gamepad.lastStickX;
    let moveY = this.gamepad.lastStickY;

    // The d-pad is bound to the movement actions, so it works as a digital
    // fallback for players who prefer it.
    if (moveX === 0 && moveY === 0) {
      moveX = digitalAxis(
        this.isGamepadActionDown('moveLeft'),
        this.isGamepadActionDown('moveRight'),
      );
      moveY = digitalAxis(this.isGamepadActionDown('moveUp'), this.isGamepadActionDown('moveDown'));
      normaliseDiagonal(moveX, moveY);
      moveX = scratchX;
      moveY = scratchY;
    }

    this.current.moveX = quantiseAxis(moveX);
    this.current.moveY = quantiseAxis(moveY);

    this.gamepad.readStick(GamepadAxis.RightStickX, GamepadAxis.RightStickY);
    // Snapped to the same eight directions as aim keys, rather than a free
    // angle — docs/DECISIONS.md #20.
    snapToOctant(this.gamepad.lastStickX, this.gamepad.lastStickY);
    this.current.aimX = quantiseAxis(scratchX);
    this.current.aimY = quantiseAxis(scratchY);

    this.sampleButtons(true);

    // A right stick pushed off centre is a fire command, the way twin-stick
    // shooters have always worked. The bound fire button still works too.
    if (this.current.aimX !== 0 || this.current.aimY !== 0) {
      this.current.buttons |= 1 << InputAction.Fire;
    }
  }

  private sampleKeyboard(): void {
    const moveX = digitalAxis(
      this.isKeyboardActionDown('moveLeft'),
      this.isKeyboardActionDown('moveRight'),
    );
    const moveY = digitalAxis(
      this.isKeyboardActionDown('moveUp'),
      this.isKeyboardActionDown('moveDown'),
    );
    normaliseDiagonal(moveX, moveY);
    this.current.moveX = quantiseAxis(scratchX);
    this.current.moveY = quantiseAxis(scratchY);

    const aimX = digitalAxis(
      this.isKeyboardActionDown('aimLeft'),
      this.isKeyboardActionDown('aimRight'),
    );
    const aimY = digitalAxis(
      this.isKeyboardActionDown('aimUp'),
      this.isKeyboardActionDown('aimDown'),
    );

    this.sampleButtons(false);

    if (aimX === 0 && aimY === 0) {
      return;
    }

    // Arrow keys aim, and aiming fires — the Isaac convention.
    normaliseDiagonal(aimX, aimY);
    this.current.aimX = quantiseAxis(scratchX);
    this.current.aimY = quantiseAxis(scratchY);
    this.current.buttons |= 1 << InputAction.Fire;
  }
}

/** Two opposing digital inputs as -1, 0 or 1. Both held cancels out. */
function digitalAxis(negative: boolean, positive: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

// Module-level scratch, so normalising a vector never allocates one.
let scratchX = 0;
let scratchY = 0;

/**
 * Scales a digital direction vector to unit length.
 *
 * Without this, holding two directions moves the player 41% faster diagonally
 * than along an axis — the oldest bug in top-down movement.
 */
function normaliseDiagonal(x: number, y: number): void {
  if (x !== 0 && y !== 0) {
    const inverse = Math.SQRT1_2;
    scratchX = x * inverse;
    scratchY = y * inverse;
    return;
  }
  scratchX = x;
  scratchY = y;
}

/** The eight aim directions a key press can produce, by octant index. */
const OCTANT_X = [1, Math.SQRT1_2, 0, -Math.SQRT1_2, -1, -Math.SQRT1_2, 0, Math.SQRT1_2];
const OCTANT_Y = [0, Math.SQRT1_2, 1, Math.SQRT1_2, 0, -Math.SQRT1_2, -1, -Math.SQRT1_2];

/**
 * Snaps a stick deflection to the nearest of the same eight directions aim
 * keys produce, so a controller's right stick reads as an eight-way input
 * rather than a free angle (`docs/DECISIONS.md` #20). Zero deflection stays
 * zero rather than snapping to an arbitrary direction.
 */
function snapToOctant(x: number, y: number): void {
  if (x === 0 && y === 0) {
    scratchX = 0;
    scratchY = 0;
    return;
  }
  const octant = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
  scratchX = OCTANT_X[octant] ?? 0;
  scratchY = OCTANT_Y[octant] ?? 0;
}
