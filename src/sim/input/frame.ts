/**
 * The input frame: everything the simulation is allowed to know about what the
 * player did on one tick.
 *
 * Game code never reads a key code or a stick value. It reads this. That
 * indirection is what makes rebinding possible, what makes keyboard and gamepad
 * interchangeable, and — most importantly — what makes a run reproducible: a
 * replay is a list of these, and nothing else.
 */

/**
 * Steps per axis direction. An axis is an integer in [-127, 127], so a frame
 * fits in signed bytes and a recording is a flat `Int8Array`.
 *
 * 127 steps is far finer than a player can feel — a 640-wide playfield gives
 * about five steps per screen pixel of aim — while being coarse enough that the
 * value is exactly reproducible.
 */
export const AXIS_RESOLUTION = 127;

/** Buttons, as bit positions in the frame's button mask. */
export const InputAction = {
  Fire: 0,
  Bomb: 1,
  Use: 2,
  Map: 3,
  Pause: 4,
} as const;

export type InputActionId = (typeof InputAction)[keyof typeof InputAction];

/** Every action, for iteration. */
export const ALL_INPUT_ACTIONS: readonly InputActionId[] = [
  InputAction.Fire,
  InputAction.Bomb,
  InputAction.Use,
  InputAction.Map,
  InputAction.Pause,
];

/**
 * Bytes one frame occupies in a recording: four axes, a button mask, and the
 * flag saying how aim was produced.
 */
export const INPUT_FRAME_BYTES = 6;

/**
 * One tick of player intent.
 *
 * A mutable struct, reused rather than allocated per tick. Axes are integers in
 * [-127, 127]; anything that produces them must quantise before writing here.
 */
export interface InputFrame {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  /** Bit set of `InputAction` values. */
  buttons: number;
  /**
   * True when aim came from a mouse or a stick rather than from aim keys.
   *
   * The one thing in the frame that is not what the player did, but how they
   * said it — and it is here rather than in the sampler because the simulation
   * acts on it: a shot inherits less of the player's velocity when aim is a
   * point being tracked than when it is one of eight fixed directions. See
   * `analogVelocityInheritance` in tuning.ts for why the two differ.
   *
   * Being in the frame is what keeps that deterministic: a replay carries the
   * device it was played on, so it reproduces the shots it recorded rather than
   * the shots the machine replaying it would have fired.
   */
  analogAim: boolean;
}

export function createInputFrame(): InputFrame {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, buttons: 0, analogAim: false };
}

export function clearInputFrame(frame: InputFrame): void {
  frame.moveX = 0;
  frame.moveY = 0;
  frame.aimX = 0;
  frame.aimY = 0;
  frame.buttons = 0;
  frame.analogAim = false;
}

export function copyInputFrame(from: Readonly<InputFrame>, to: InputFrame): void {
  to.moveX = from.moveX;
  to.moveY = from.moveY;
  to.aimX = from.aimX;
  to.aimY = from.aimY;
  to.buttons = from.buttons;
  to.analogAim = from.analogAim;
}

export function inputFramesEqual(a: Readonly<InputFrame>, b: Readonly<InputFrame>): boolean {
  return (
    a.moveX === b.moveX &&
    a.moveY === b.moveY &&
    a.aimX === b.aimX &&
    a.aimY === b.aimY &&
    a.buttons === b.buttons &&
    a.analogAim === b.analogAim
  );
}

/**
 * Snaps a float axis reading to the integer the simulation will see.
 *
 * This is the boundary the whole determinism story rests on. The Gamepad API
 * reports stick positions as floats, and drivers, browsers and controller
 * firmware do not agree on the exact float a stick produces at a given physical
 * position — the same hardware can differ across machines or after a driver
 * update. Recording raw floats gives replays that reproduce on the machine that
 * made them and drift on every other, which is the worst kind of failure
 * because it looks like it works.
 *
 * Past this function the value comes from a set of 255 known integers, and the
 * recorded frame is exactly what the simulation consumed.
 */
export function quantiseAxis(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  const clamped = value < -1 ? -1 : value > 1 ? 1 : value;
  // Rounded on the magnitude, then re-signed. `Math.round` breaks ties toward
  // +Infinity, so rounding the signed value directly would make -0.5 quantise
  // to -63 while +0.5 gives 64 — the same stick deflection reading stronger
  // one way than the other.
  const magnitude = Math.round(Math.abs(clamped) * AXIS_RESOLUTION);
  // Normalised away from -0: a stick centred from the left rounds to zero with
  // a negative sign, and -0 in a frame compares unequal to 0 under Object.is,
  // so a replay diff would report a difference nobody can see.
  if (magnitude === 0) {
    return 0;
  }
  return clamped < 0 ? -magnitude : magnitude;
}

/** Converts a quantised axis back to a float in [-1, 1], for physics. */
export function axisToUnit(quantised: number): number {
  return quantised / AXIS_RESOLUTION;
}

export function isActionDown(frame: Readonly<InputFrame>, action: InputActionId): boolean {
  return (frame.buttons & (1 << action)) !== 0;
}

export function setActionDown(frame: InputFrame, action: InputActionId, down: boolean): void {
  if (down) {
    frame.buttons |= 1 << action;
  } else {
    frame.buttons &= ~(1 << action);
  }
}

/**
 * True on the tick an action goes down.
 *
 * Systems that need an edge rather than a level compare against the previous
 * frame, which the sampler keeps.
 */
export function isActionPressed(
  frame: Readonly<InputFrame>,
  previous: Readonly<InputFrame>,
  action: InputActionId,
): boolean {
  return isActionDown(frame, action) && !isActionDown(previous, action);
}

/** True on the tick an action goes up. */
export function isActionReleased(
  frame: Readonly<InputFrame>,
  previous: Readonly<InputFrame>,
  action: InputActionId,
): boolean {
  return !isActionDown(frame, action) && isActionDown(previous, action);
}
