import { describe, expect, it } from 'vitest';
import {
  ALL_BINDABLE_ACTIONS,
  GamepadButton,
  addBinding,
  clearBindings,
  cloneBindings,
  createDefaultBindings,
  findConflicts,
  listConflicts,
  removeBinding,
  resetBindings,
  sanitizeBindings,
} from '../../src/app/input/bindings.js';
import { BindingCapture } from '../../src/app/input/rebind.js';
import { GamepadSource, type GamepadLike } from '../../src/app/input/gamepad.js';

function fakePad(pressed: readonly number[]): GamepadLike {
  return {
    index: 0,
    id: 'Test Pad',
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, (_unused, index) => ({
      pressed: pressed.includes(index),
      value: pressed.includes(index) ? 1 : 0,
    })),
  };
}

describe('default bindings', () => {
  it('binds every action on the keyboard', () => {
    const bindings = createDefaultBindings();
    for (const action of ALL_BINDABLE_ACTIONS) {
      expect(bindings.keyboard[action].length, action).toBeGreaterThan(0);
    }
  });

  it('moves with WASD and shoots with the arrow keys', () => {
    const bindings = createDefaultBindings();
    expect(bindings.keyboard.moveUp).toEqual(['KeyW']);
    expect(bindings.keyboard.moveLeft).toEqual(['KeyA']);
    expect(bindings.keyboard.moveDown).toEqual(['KeyS']);
    expect(bindings.keyboard.moveRight).toEqual(['KeyD']);
    expect(bindings.keyboard.aimUp).toEqual(['ArrowUp']);
    expect(bindings.keyboard.aimLeft).toEqual(['ArrowLeft']);
  });

  it('uses physical key codes rather than typed characters', () => {
    // KeyW rather than 'w', so the movement keys stay in the same physical
    // place on an AZERTY board instead of scattering to Z, Q, S, D.
    const bindings = createDefaultBindings();
    for (const codes of Object.values(bindings.keyboard)) {
      for (const code of codes) {
        expect(code).toMatch(/^[A-Z]/);
      }
    }
  });

  it('starts with no conflicts', () => {
    expect(listConflicts(createDefaultBindings())).toEqual([]);
  });

  it('leaves gamepad aim to the right stick', () => {
    const bindings = createDefaultBindings();
    expect(bindings.gamepad.aimUp).toEqual([]);
    expect(bindings.gamepad.aimLeft).toEqual([]);
  });
});

describe('cloning', () => {
  it('copies the arrays rather than sharing them', () => {
    const original = createDefaultBindings();
    const copy = cloneBindings(original);
    copy.keyboard.bomb.push('KeyF');
    copy.gamepad.bomb.push(GamepadButton.North);
    expect(original.keyboard.bomb).toEqual(['KeyE']);
    expect(original.gamepad.bomb).toEqual([GamepadButton.LeftTrigger, GamepadButton.West]);
  });
});

describe('editing bindings', () => {
  it('adds a second binding for one action', () => {
    const bindings = createDefaultBindings();
    addBinding(bindings, 'bomb', 'keyboard', 'KeyF');
    expect(bindings.keyboard.bomb).toEqual(['KeyE', 'KeyF']);
  });

  it('ignores a binding the action already has', () => {
    const bindings = createDefaultBindings();
    addBinding(bindings, 'bomb', 'keyboard', 'KeyE');
    expect(bindings.keyboard.bomb).toEqual(['KeyE']);
  });

  it('applies a conflicting binding and reports the conflict', () => {
    // A player who deliberately puts two actions on one key is allowed to.
    // They get told; they do not get overruled.
    const bindings = createDefaultBindings();
    const result = addBinding(bindings, 'use', 'keyboard', 'KeyE');
    expect(result.conflicts).toEqual(['bomb']);
    expect(bindings.keyboard.use).toContain('KeyE');
    expect(bindings.keyboard.bomb).toContain('KeyE');
  });

  it('does not report an action conflicting with itself', () => {
    const bindings = createDefaultBindings();
    expect(findConflicts(bindings, 'keyboard', 'KeyE', 'bomb')).toEqual([]);
    expect(findConflicts(bindings, 'keyboard', 'KeyE')).toEqual(['bomb']);
  });

  it('lists every shared input across both devices', () => {
    const bindings = createDefaultBindings();
    addBinding(bindings, 'map', 'keyboard', 'KeyE');
    addBinding(bindings, 'use', 'gamepad', GamepadButton.Start);

    const conflicts = listConflicts(bindings);
    expect(conflicts).toHaveLength(2);
    expect(conflicts).toContainEqual({
      device: 'keyboard',
      input: 'KeyE',
      actions: ['bomb', 'map'],
    });
    expect(conflicts).toContainEqual({
      device: 'gamepad',
      input: GamepadButton.Start,
      actions: ['use', 'pause'],
    });
  });

  it('removes and clears bindings', () => {
    const bindings = createDefaultBindings();
    expect(removeBinding(bindings, 'bomb', 'keyboard', 'KeyE')).toBe(true);
    expect(removeBinding(bindings, 'bomb', 'keyboard', 'KeyE')).toBe(false);
    expect(bindings.keyboard.bomb).toEqual([]);

    clearBindings(bindings, 'bomb', 'gamepad');
    expect(bindings.gamepad.bomb).toEqual([]);
  });

  it('rejects an input of the wrong shape for the device', () => {
    const bindings = createDefaultBindings();
    expect(() => addBinding(bindings, 'use', 'keyboard', 3)).toThrow(TypeError);
    expect(() => addBinding(bindings, 'use', 'gamepad', 'KeyF')).toThrow(TypeError);
    expect(() => addBinding(bindings, 'use', 'gamepad', -1)).toThrow(TypeError);
    expect(() => addBinding(bindings, 'use', 'gamepad', 1.5)).toThrow(TypeError);
  });
});

describe('rebinding capture', () => {
  it('replaces the existing binding by default', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('use', 'keyboard');
    expect(capture.capturing).toBe(true);
    const result = capture.captureKey('KeyF');

    expect(result?.input).toBe('KeyF');
    expect(bindings.keyboard.use).toEqual(['KeyF']);
    expect(capture.capturing).toBe(false);
  });

  it('adds an alternate binding in add mode', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('use', 'keyboard', 'add');
    capture.captureKey('KeyF');

    expect(bindings.keyboard.use).toEqual(['KeyQ', 'KeyF']);
  });

  it('rebinds every action, including onto a key another action uses', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    for (const action of ALL_BINDABLE_ACTIONS) {
      capture.begin(action, 'keyboard');
      const result = capture.captureKey('KeyJ');
      expect(result, action).not.toBeNull();
      expect(bindings.keyboard[action]).toEqual(['KeyJ']);
    }

    // Every action now shares one key, which is legal and which each capture
    // after the first reported.
    const conflicts = listConflicts(bindings);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.actions).toEqual(ALL_BINDABLE_ACTIONS);
  });

  it('can bind Escape, which is not reserved for cancelling', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('use', 'keyboard');
    expect(capture.captureKey('Escape')?.input).toBe('Escape');
    expect(bindings.keyboard.use).toEqual(['Escape']);
  });

  it('ignores input for the other device', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('use', 'gamepad');
    expect(capture.captureKey('KeyF')).toBeNull();
    expect(capture.capturing).toBe(true);
    expect(bindings.keyboard.use).toEqual(['KeyQ']);
  });

  it('ignores input when nothing is armed', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);
    expect(capture.captureKey('KeyF')).toBeNull();
    expect(bindings.keyboard.use).toEqual(['KeyQ']);
  });

  it('moves the capture when a second row is armed', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('use', 'keyboard');
    capture.begin('bomb', 'keyboard');
    capture.captureKey('KeyF');

    expect(bindings.keyboard.use).toEqual(['KeyQ']);
    expect(bindings.keyboard.bomb).toEqual(['KeyF']);
  });

  it('cancels without changing anything', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('use', 'keyboard');
    capture.cancel();

    expect(capture.capturing).toBe(false);
    expect(capture.captureKey('KeyF')).toBeNull();
    expect(bindings.keyboard.use).toEqual(['KeyQ']);
  });

  it('does not bind the button that was held when the capture opened', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);
    let pressed: readonly number[] = [GamepadButton.South];
    const source = new GamepadSource(() => [fakePad(pressed)]);

    source.update();
    capture.begin('bomb', 'gamepad');

    // Still held from opening the row: nothing binds.
    expect(capture.pollGamepad(source)).toBeNull();
    expect(capture.pollGamepad(source)).toBeNull();

    // Released, then pressed again: now it counts.
    pressed = [];
    source.update();
    expect(capture.pollGamepad(source)).toBeNull();
    pressed = [GamepadButton.South];
    source.update();

    const result = capture.pollGamepad(source);
    expect(result?.input).toBe(GamepadButton.South);
    expect(result?.conflicts).toEqual(['use']);
    expect(bindings.gamepad.bomb).toEqual([GamepadButton.South]);
  });

  it('captures a fresh button press', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);
    let pressed: readonly number[] = [];
    const source = new GamepadSource(() => [fakePad(pressed)]);

    source.update();
    capture.begin('map', 'gamepad');
    expect(capture.pollGamepad(source)).toBeNull();

    pressed = [GamepadButton.North];
    source.update();
    expect(capture.pollGamepad(source)?.input).toBe(GamepadButton.North);
    expect(bindings.gamepad.map).toEqual([GamepadButton.North]);
  });
});

describe('sanitizeBindings (#53)', () => {
  it('falls back to the full default layout for a non-object', () => {
    expect(sanitizeBindings(null)).toEqual(createDefaultBindings());
    expect(sanitizeBindings(undefined)).toEqual(createDefaultBindings());
    expect(sanitizeBindings('nope')).toEqual(createDefaultBindings());
  });

  it('falls back to the full default layout for an empty object', () => {
    expect(sanitizeBindings({})).toEqual(createDefaultBindings());
  });

  it('keeps a valid custom binding', () => {
    const bindings = createDefaultBindings();
    addBinding(bindings, 'use', 'keyboard', 'KeyF');
    expect(sanitizeBindings(bindings)).toEqual(bindings);
  });

  it('has no Fire action, and loads a save that still carries one (#460)', () => {
    expect(ALL_BINDABLE_ACTIONS).not.toContain('fire');
    const defaults = createDefaultBindings();
    const raw = {
      keyboard: { ...defaults.keyboard, fire: ['KeyF'], bomb: ['KeyB'] },
      gamepad: { ...defaults.gamepad, fire: [3] },
    };
    const sanitized = sanitizeBindings(raw);
    expect(sanitized.keyboard).not.toHaveProperty('fire');
    expect(sanitized.gamepad).not.toHaveProperty('fire');
    // The rest of the save is untouched.
    expect(sanitized.keyboard.bomb).toEqual(['KeyB']);
  });

  it('falls back only the one malformed action, action by action', () => {
    const raw = {
      keyboard: { ...createDefaultBindings().keyboard, use: 'not-an-array' },
      gamepad: createDefaultBindings().gamepad,
    };
    const sanitized = sanitizeBindings(raw);
    expect(sanitized.keyboard.use).toEqual(createDefaultBindings().keyboard.use);
    expect(sanitized.keyboard.bomb).toEqual(createDefaultBindings().keyboard.bomb);
  });

  it('drops a keyboard array containing a non-string entry entirely, falling back to default', () => {
    const raw = {
      keyboard: { ...createDefaultBindings().keyboard, use: ['KeyF', 42] },
      gamepad: createDefaultBindings().gamepad,
    };
    expect(sanitizeBindings(raw).keyboard.use).toEqual(createDefaultBindings().keyboard.use);
  });

  it('drops a gamepad array containing a negative or fractional entry, falling back to default', () => {
    const raw = {
      keyboard: createDefaultBindings().keyboard,
      gamepad: { ...createDefaultBindings().gamepad, bomb: [-1] },
    };
    expect(sanitizeBindings(raw).gamepad.bomb).toEqual(createDefaultBindings().gamepad.bomb);
    const rawFraction = {
      keyboard: createDefaultBindings().keyboard,
      gamepad: { ...createDefaultBindings().gamepad, bomb: [1.5] },
    };
    expect(sanitizeBindings(rawFraction).gamepad.bomb).toEqual(
      createDefaultBindings().gamepad.bomb,
    );
  });
});

describe('resetBindings (#53)', () => {
  it('overwrites a rebound layout back to the default, in place', () => {
    const bindings = createDefaultBindings();
    addBinding(bindings, 'use', 'keyboard', 'KeyF');
    clearBindings(bindings, 'bomb', 'keyboard');
    resetBindings(bindings);
    expect(bindings).toEqual(createDefaultBindings());
  });

  it('mutates the same object rather than replacing it', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);
    capture.begin('use', 'keyboard');
    capture.captureKey('KeyF');

    resetBindings(bindings);

    // The capture (and anything else holding `bindings`) still reads the
    // reset values, since the object identity never changed.
    capture.begin('bomb', 'keyboard');
    capture.captureKey('KeyG');
    expect(bindings.keyboard.bomb).toEqual(['KeyG']);
    expect(bindings.keyboard.use).toEqual(createDefaultBindings().keyboard.use);
  });
});
