/**
 * Bindings: which physical input produces which abstract action.
 *
 * Game code never sees a key code. It sees an `InputFrame`. Everything between
 * the two lives here, which is what makes rebinding a data change rather than a
 * code change — and rebinding is listed under accessibility rather than polish
 * for a reason: a fixed key layout excludes people.
 */

/**
 * Everything a player can bind.
 *
 * Directions are separate bindable actions rather than an axis, because on a
 * keyboard they *are* separate keys. Analog sticks bypass this list and feed
 * the axes directly.
 */
export const Bindable = {
  MoveUp: 'moveUp',
  MoveDown: 'moveDown',
  MoveLeft: 'moveLeft',
  MoveRight: 'moveRight',
  AimUp: 'aimUp',
  AimDown: 'aimDown',
  AimLeft: 'aimLeft',
  AimRight: 'aimRight',
  Fire: 'fire',
  Bomb: 'bomb',
  Use: 'use',
  Map: 'map',
  Pause: 'pause',
} as const;

export type BindableAction = (typeof Bindable)[keyof typeof Bindable];

export const ALL_BINDABLE_ACTIONS: readonly BindableAction[] = Object.values(Bindable);

export type BindingDevice = 'keyboard' | 'gamepad';

/**
 * Standard-mapping gamepad button indices.
 *
 * `gamepad.mapping === 'standard'` normalises Xbox, DualSense and Switch Pro
 * controllers onto these positions, so there is no per-device lookup table.
 */
export const GamepadButton = {
  South: 0,
  East: 1,
  West: 2,
  North: 3,
  LeftBumper: 4,
  RightBumper: 5,
  LeftTrigger: 6,
  RightTrigger: 7,
  Select: 8,
  Start: 9,
  LeftStick: 10,
  RightStick: 11,
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
} as const;

export interface Bindings {
  /** `KeyboardEvent.code` values — physical positions, not typed characters. */
  readonly keyboard: Record<BindableAction, string[]>;
  readonly gamepad: Record<BindableAction, number[]>;
}

/**
 * The default layout: WASD to move, arrow keys to shoot.
 *
 * `KeyboardEvent.code` rather than `key`, so the movement keys stay in the same
 * physical position on an AZERTY or Dvorak keyboard instead of scattering.
 */
export function createDefaultBindings(): Bindings {
  return {
    keyboard: {
      moveUp: ['KeyW'],
      moveDown: ['KeyS'],
      moveLeft: ['KeyA'],
      moveRight: ['KeyD'],
      aimUp: ['ArrowUp'],
      aimDown: ['ArrowDown'],
      aimLeft: ['ArrowLeft'],
      aimRight: ['ArrowRight'],
      fire: ['Space'],
      bomb: ['KeyE'],
      use: ['KeyQ'],
      map: ['Tab'],
      pause: ['Escape'],
    },
    gamepad: {
      moveUp: [GamepadButton.DpadUp],
      moveDown: [GamepadButton.DpadDown],
      moveLeft: [GamepadButton.DpadLeft],
      moveRight: [GamepadButton.DpadRight],
      aimUp: [],
      aimDown: [],
      aimLeft: [],
      aimRight: [],
      fire: [GamepadButton.RightTrigger],
      bomb: [GamepadButton.LeftTrigger, GamepadButton.West],
      use: [GamepadButton.South],
      map: [GamepadButton.Select],
      pause: [GamepadButton.Start],
    },
  };
}

export function cloneBindings(bindings: Bindings): Bindings {
  const keyboard = {} as Record<BindableAction, string[]>;
  const gamepad = {} as Record<BindableAction, number[]>;
  for (const action of ALL_BINDABLE_ACTIONS) {
    keyboard[action] = [...bindings.keyboard[action]];
    gamepad[action] = [...bindings.gamepad[action]];
  }
  return { keyboard, gamepad };
}

/**
 * Overwrites `bindings` in place with the default layout — #53's "reset all
 * bindings" button. In place rather than handing back a fresh object,
 * because a live `Bindings` has other things already holding a reference to
 * it (`InputSampler.bindings`, a `BindingCapture` mid-flow); replacing the
 * object out from under them would leave whichever one holds the old
 * reference reading/writing bindings nothing else agrees are current.
 */
export function resetBindings(bindings: Bindings): void {
  const defaults = createDefaultBindings();
  for (const action of ALL_BINDABLE_ACTIONS) {
    bindings.keyboard[action] = [...defaults.keyboard[action]];
    bindings.gamepad[action] = [...defaults.gamepad[action]];
  }
}

function sanitizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const strings = value.filter((entry): entry is string => typeof entry === 'string');
  return strings.length === value.length ? strings : null;
}

function sanitizeButtonArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const buttons = value.filter(
    (entry): entry is number => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0,
  );
  return buttons.length === value.length ? buttons : null;
}

/**
 * Coerces an arbitrary parsed value into a full `Bindings`, action by
 * action — the same field-by-field fallback `settings.ts`'s
 * `sanitizeAccessibilitySettings` uses, so a save from before an action
 * existed, or one hand-edited into a bad shape, falls back to that one
 * action's default rather than discarding every rebind the player made.
 */
export function sanitizeBindings(candidate: unknown): Bindings {
  const defaults = createDefaultBindings();
  if (typeof candidate !== 'object' || candidate === null) {
    return defaults;
  }
  const source = candidate as Partial<Record<'keyboard' | 'gamepad', unknown>>;
  const rawKeyboard =
    typeof source.keyboard === 'object' && source.keyboard !== null
      ? (source.keyboard as Partial<Record<BindableAction, unknown>>)
      : {};
  const rawGamepad =
    typeof source.gamepad === 'object' && source.gamepad !== null
      ? (source.gamepad as Partial<Record<BindableAction, unknown>>)
      : {};

  const keyboard = {} as Record<BindableAction, string[]>;
  const gamepad = {} as Record<BindableAction, number[]>;
  for (const action of ALL_BINDABLE_ACTIONS) {
    keyboard[action] = sanitizeStringArray(rawKeyboard[action]) ?? defaults.keyboard[action];
    gamepad[action] = sanitizeButtonArray(rawGamepad[action]) ?? defaults.gamepad[action];
  }
  return { keyboard, gamepad };
}

/** A binding that two or more actions share. */
export interface BindingConflict {
  readonly device: BindingDevice;
  /** A `KeyboardEvent.code` or a gamepad button index. */
  readonly input: string | number;
  readonly actions: readonly BindableAction[];
}

/** Actions already bound to `input`, ignoring `except`. */
export function findConflicts(
  bindings: Bindings,
  device: BindingDevice,
  input: string | number,
  except?: BindableAction,
): BindableAction[] {
  const conflicting: BindableAction[] = [];
  for (const action of ALL_BINDABLE_ACTIONS) {
    if (action === except) {
      continue;
    }
    const bound: readonly (string | number)[] =
      device === 'keyboard' ? bindings.keyboard[action] : bindings.gamepad[action];
    if (bound.includes(input)) {
      conflicting.push(action);
    }
  }
  return conflicting;
}

/** Every input bound to more than one action. */
export function listConflicts(bindings: Bindings): BindingConflict[] {
  const conflicts: BindingConflict[] = [];

  for (const device of ['keyboard', 'gamepad'] as const) {
    const owners = new Map<string | number, BindableAction[]>();
    for (const action of ALL_BINDABLE_ACTIONS) {
      const bound: readonly (string | number)[] =
        device === 'keyboard' ? bindings.keyboard[action] : bindings.gamepad[action];
      for (const input of bound) {
        const existing = owners.get(input);
        if (existing === undefined) {
          owners.set(input, [action]);
        } else {
          existing.push(action);
        }
      }
    }
    for (const [input, actions] of owners) {
      if (actions.length > 1) {
        conflicts.push({ device, input, actions });
      }
    }
  }

  return conflicts;
}

export interface BindResult {
  /**
   * Actions that already used this input.
   *
   * The binding is applied regardless. A player who deliberately puts two
   * actions on one button is allowed to; they just get told.
   */
  readonly conflicts: readonly BindableAction[];
}

/** Adds a binding, reporting any action that already used the same input. */
export function addBinding(
  bindings: Bindings,
  action: BindableAction,
  device: BindingDevice,
  input: string | number,
): BindResult {
  const conflicts = findConflicts(bindings, device, input, action);

  if (device === 'keyboard') {
    if (typeof input !== 'string') {
      throw new TypeError(
        `A keyboard binding is a KeyboardEvent.code string, got ${String(input)}`,
      );
    }
    if (!bindings.keyboard[action].includes(input)) {
      bindings.keyboard[action].push(input);
    }
  } else {
    if (typeof input !== 'number' || !Number.isInteger(input) || input < 0) {
      throw new TypeError(`A gamepad binding is a button index, got ${String(input)}`);
    }
    if (!bindings.gamepad[action].includes(input)) {
      bindings.gamepad[action].push(input);
    }
  }

  return { conflicts };
}

/** Removes one binding. Returns whether anything was bound in the first place. */
export function removeBinding(
  bindings: Bindings,
  action: BindableAction,
  device: BindingDevice,
  input: string | number,
): boolean {
  const bound: (string | number)[] =
    device === 'keyboard' ? bindings.keyboard[action] : bindings.gamepad[action];
  const index = bound.indexOf(input);
  if (index === -1) {
    return false;
  }
  bound.splice(index, 1);
  return true;
}

/** Drops every binding for one action on one device. */
export function clearBindings(
  bindings: Bindings,
  action: BindableAction,
  device: BindingDevice,
): void {
  if (device === 'keyboard') {
    bindings.keyboard[action].length = 0;
  } else {
    bindings.gamepad[action].length = 0;
  }
}
