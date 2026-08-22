/**
 * Which button glyphs a prompt should draw.
 *
 * "Press A" is wrong on a DualSense and worse on a Pro Controller, where the
 * bottom face button is B — the standard mapping normalises button *positions*,
 * not the letters printed on them. A prompt that names the wrong button is a
 * prompt the player has to decode.
 */

import {
  ALL_BINDABLE_ACTIONS,
  type BindableAction,
  type BindingDevice,
  type Bindings,
  GamepadButton,
} from './bindings.js';
import type { ActiveDevice } from './sampler.js';

export type GlyphSet = 'keyboard' | 'xbox' | 'playstation' | 'nintendo' | 'generic';

/**
 * Picks a glyph set from the controller's id string.
 *
 * The id is a free-form vendor string, so this is pattern matching rather than
 * a lookup, and `generic` is a first-class answer instead of a fallback that
 * pretends the pad is an Xbox one. Chromium prefixes the USB vendor and product
 * ids, which is why the numeric forms are matched too.
 */
export function detectGlyphSet(device: ActiveDevice, gamepadId: string | null): GlyphSet {
  if (device === 'keyboard' || gamepadId === null) {
    return 'keyboard';
  }
  const id = gamepadId.toLowerCase();
  if (/xbox|xinput|x-box|045e/.test(id)) {
    return 'xbox';
  }
  if (/dualsense|dualshock|playstation|054c|09cc|05c4|0ce6/.test(id)) {
    return 'playstation';
  }
  if (/switch|joy-?con|pro controller|057e/.test(id)) {
    return 'nintendo';
  }
  return 'generic';
}

/** Face-button names by glyph set, in standard-mapping order. */
const FACE_BUTTONS: Record<
  Exclude<GlyphSet, 'keyboard'>,
  readonly [string, string, string, string]
> = {
  // South, East, West, North.
  xbox: ['A', 'B', 'X', 'Y'],
  playstation: ['Cross', 'Circle', 'Square', 'Triangle'],
  // Nintendo prints its face buttons the other way round on both axes, which
  // is exactly the case the standard mapping does not normalise away.
  nintendo: ['B', 'A', 'Y', 'X'],
  generic: ['Button 1', 'Button 2', 'Button 3', 'Button 4'],
};

const SHOULDER_LABELS: Record<
  Exclude<GlyphSet, 'keyboard'>,
  readonly [string, string, string, string]
> = {
  // Left bumper, right bumper, left trigger, right trigger.
  xbox: ['LB', 'RB', 'LT', 'RT'],
  playstation: ['L1', 'R1', 'L2', 'R2'],
  nintendo: ['L', 'R', 'ZL', 'ZR'],
  generic: ['L1', 'R1', 'L2', 'R2'],
};

const MENU_LABELS: Record<Exclude<GlyphSet, 'keyboard'>, readonly [string, string]> = {
  // Select, Start.
  xbox: ['View', 'Menu'],
  playstation: ['Create', 'Options'],
  nintendo: ['Minus', 'Plus'],
  generic: ['Select', 'Start'],
};

/**
 * Fallback for a button index outside the standard mapping.
 *
 * A non-standard pad reports whatever indices it likes, and those still have to
 * be rebindable and still have to render as something.
 */
function unknownButton(button: number): string {
  return `Button ${String(button)}`;
}

/** A readable name for a standard-mapping button index. */
export function gamepadButtonLabel(button: number, set: GlyphSet): string {
  const family = set === 'keyboard' ? 'generic' : set;

  switch (button) {
    case GamepadButton.South:
    case GamepadButton.East:
    case GamepadButton.West:
    case GamepadButton.North:
      return FACE_BUTTONS[family][button];
    case GamepadButton.LeftBumper:
      return SHOULDER_LABELS[family][0];
    case GamepadButton.RightBumper:
      return SHOULDER_LABELS[family][1];
    case GamepadButton.LeftTrigger:
      return SHOULDER_LABELS[family][2];
    case GamepadButton.RightTrigger:
      return SHOULDER_LABELS[family][3];
    case GamepadButton.Select:
      return MENU_LABELS[family][0];
    case GamepadButton.Start:
      return MENU_LABELS[family][1];
    case GamepadButton.LeftStick:
      return 'L3';
    case GamepadButton.RightStick:
      return 'R3';
    case GamepadButton.DpadUp:
      return 'D-Pad Up';
    case GamepadButton.DpadDown:
      return 'D-Pad Down';
    case GamepadButton.DpadLeft:
      return 'D-Pad Left';
    case GamepadButton.DpadRight:
      return 'D-Pad Right';
    default:
      return unknownButton(button);
  }
}

const NAMED_KEYS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  Escape: 'Esc',
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  CapsLock: 'Caps',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl',
  AltLeft: 'L Alt',
  AltRight: 'R Alt',
  MetaLeft: 'L Meta',
  MetaRight: 'R Meta',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/**
 * A readable name for a `KeyboardEvent.code`.
 *
 * `code` is a physical position, so this is deliberately the US-layout name of
 * that position rather than the character the player's layout produces. Showing
 * the real character needs `navigator.keyboard.getLayoutMap()`, which is
 * Chromium-only; the label belongs behind this function for when it lands.
 */
export function keyLabel(code: string): string {
  const named = NAMED_KEYS[code];
  if (named !== undefined) {
    return named;
  }
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad')) {
    return `Num ${code.slice(6)}`;
  }
  // Function keys and anything unrecognised read well enough as their code.
  return code;
}

/** Every label bound to one action on one device, ready to draw in a prompt. */
export function bindingLabels(
  bindings: Bindings,
  action: BindableAction,
  device: BindingDevice,
  set: GlyphSet,
): string[] {
  if (device === 'keyboard') {
    return bindings.keyboard[action].map(keyLabel);
  }
  return bindings.gamepad[action].map((button) => gamepadButtonLabel(button, set));
}

/**
 * A prompt string for one action, or null when nothing is bound.
 *
 * Null rather than an empty string, because "press  to open the map" is a bug
 * that reads as a rendering glitch, and a caller that has to handle null cannot
 * print it by accident.
 */
export function actionPrompt(
  bindings: Bindings,
  action: BindableAction,
  device: BindingDevice,
  set: GlyphSet,
): string | null {
  const labels = bindingLabels(bindings, action, device, set);
  return labels.length === 0 ? null : (labels[0] ?? null);
}

/**
 * Directions the sticks already cover on a gamepad.
 *
 * They have no default gamepad button and do not need one: the left stick moves
 * and the right stick aims. Reporting them as unbound would bury the warnings
 * that matter under eight that never do.
 */
const STICK_COVERED: ReadonlySet<BindableAction> = new Set<BindableAction>([
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'aimUp',
  'aimDown',
  'aimLeft',
  'aimRight',
]);

/** Actions with nothing bound on `device` — what a settings screen warns about. */
export function unboundActions(bindings: Bindings, device: BindingDevice): BindableAction[] {
  return ALL_BINDABLE_ACTIONS.filter((action) => {
    if (device === 'keyboard') {
      return bindings.keyboard[action].length === 0;
    }
    return !STICK_COVERED.has(action) && bindings.gamepad[action].length === 0;
  });
}
