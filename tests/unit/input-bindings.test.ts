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
    copy.keyboard.fire.push('KeyF');
    copy.gamepad.fire.push(GamepadButton.North);
    expect(original.keyboard.fire).toEqual(['Space']);
    expect(original.gamepad.fire).toEqual([GamepadButton.RightTrigger]);
  });
});

describe('editing bindings', () => {
  it('adds a second binding for one action', () => {
    const bindings = createDefaultBindings();
    addBinding(bindings, 'fire', 'keyboard', 'KeyF');
    expect(bindings.keyboard.fire).toEqual(['Space', 'KeyF']);
  });

  it('ignores a binding the action already has', () => {
    const bindings = createDefaultBindings();
    addBinding(bindings, 'fire', 'keyboard', 'Space');
    expect(bindings.keyboard.fire).toEqual(['Space']);
  });

  it('applies a conflicting binding and reports the conflict', () => {
    // A player who deliberately puts two actions on one key is allowed to.
    // They get told; they do not get overruled.
    const bindings = createDefaultBindings();
    const result = addBinding(bindings, 'bomb', 'keyboard', 'Space');
    expect(result.conflicts).toEqual(['fire']);
    expect(bindings.keyboard.bomb).toContain('Space');
    expect(bindings.keyboard.fire).toContain('Space');
  });

  it('does not report an action conflicting with itself', () => {
    const bindings = createDefaultBindings();
    expect(findConflicts(bindings, 'keyboard', 'Space', 'fire')).toEqual([]);
    expect(findConflicts(bindings, 'keyboard', 'Space')).toEqual(['fire']);
  });

  it('lists every shared input across both devices', () => {
    const bindings = createDefaultBindings();
    addBinding(bindings, 'bomb', 'keyboard', 'Space');
    addBinding(bindings, 'use', 'gamepad', GamepadButton.Start);

    const conflicts = listConflicts(bindings);
    expect(conflicts).toHaveLength(2);
    expect(conflicts).toContainEqual({
      device: 'keyboard',
      input: 'Space',
      actions: ['fire', 'bomb'],
    });
    expect(conflicts).toContainEqual({
      device: 'gamepad',
      input: GamepadButton.Start,
      actions: ['use', 'pause'],
    });
  });

  it('removes and clears bindings', () => {
    const bindings = createDefaultBindings();
    expect(removeBinding(bindings, 'fire', 'keyboard', 'Space')).toBe(true);
    expect(removeBinding(bindings, 'fire', 'keyboard', 'Space')).toBe(false);
    expect(bindings.keyboard.fire).toEqual([]);

    clearBindings(bindings, 'bomb', 'gamepad');
    expect(bindings.gamepad.bomb).toEqual([]);
  });

  it('rejects an input of the wrong shape for the device', () => {
    const bindings = createDefaultBindings();
    expect(() => addBinding(bindings, 'fire', 'keyboard', 3)).toThrow(TypeError);
    expect(() => addBinding(bindings, 'fire', 'gamepad', 'KeyF')).toThrow(TypeError);
    expect(() => addBinding(bindings, 'fire', 'gamepad', -1)).toThrow(TypeError);
    expect(() => addBinding(bindings, 'fire', 'gamepad', 1.5)).toThrow(TypeError);
  });
});

describe('rebinding capture', () => {
  it('replaces the existing binding by default', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('fire', 'keyboard');
    expect(capture.capturing).toBe(true);
    const result = capture.captureKey('KeyF');

    expect(result?.input).toBe('KeyF');
    expect(bindings.keyboard.fire).toEqual(['KeyF']);
    expect(capture.capturing).toBe(false);
  });

  it('adds an alternate binding in add mode', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('fire', 'keyboard', 'add');
    capture.captureKey('KeyF');

    expect(bindings.keyboard.fire).toEqual(['Space', 'KeyF']);
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

    capture.begin('fire', 'keyboard');
    expect(capture.captureKey('Escape')?.input).toBe('Escape');
    expect(bindings.keyboard.fire).toEqual(['Escape']);
  });

  it('ignores input for the other device', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('fire', 'gamepad');
    expect(capture.captureKey('KeyF')).toBeNull();
    expect(capture.capturing).toBe(true);
    expect(bindings.keyboard.fire).toEqual(['Space']);
  });

  it('ignores input when nothing is armed', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);
    expect(capture.captureKey('KeyF')).toBeNull();
    expect(bindings.keyboard.fire).toEqual(['Space']);
  });

  it('moves the capture when a second row is armed', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('fire', 'keyboard');
    capture.begin('bomb', 'keyboard');
    capture.captureKey('KeyF');

    expect(bindings.keyboard.fire).toEqual(['Space']);
    expect(bindings.keyboard.bomb).toEqual(['KeyF']);
  });

  it('cancels without changing anything', () => {
    const bindings = createDefaultBindings();
    const capture = new BindingCapture(bindings);

    capture.begin('fire', 'keyboard');
    capture.cancel();

    expect(capture.capturing).toBe(false);
    expect(capture.captureKey('KeyF')).toBeNull();
    expect(bindings.keyboard.fire).toEqual(['Space']);
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
