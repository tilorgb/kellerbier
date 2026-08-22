import { describe, expect, it } from 'vitest';
import {
  GamepadButton,
  clearBindings,
  createDefaultBindings,
} from '../../src/app/input/bindings.js';
import {
  actionPrompt,
  bindingLabels,
  detectGlyphSet,
  gamepadButtonLabel,
  keyLabel,
  unboundActions,
} from '../../src/app/input/glyphs.js';

describe('glyph set detection', () => {
  it('uses keyboard glyphs while the keyboard is the active device', () => {
    expect(detectGlyphSet('keyboard', 'Xbox Wireless Controller')).toBe('keyboard');
  });

  it('recognises the three families by id', () => {
    expect(detectGlyphSet('gamepad', 'Xbox Wireless Controller (STANDARD GAMEPAD)')).toBe('xbox');
    expect(detectGlyphSet('gamepad', 'Wireless Controller (DualSense)')).toBe('playstation');
    expect(detectGlyphSet('gamepad', 'Pro Controller (STANDARD GAMEPAD)')).toBe('nintendo');
  });

  it('recognises the vendor ids Chromium prefixes', () => {
    expect(detectGlyphSet('gamepad', '045e-02fd-Bluetooth Gamepad')).toBe('xbox');
    expect(detectGlyphSet('gamepad', '054c-0ce6-Wireless Controller')).toBe('playstation');
    expect(detectGlyphSet('gamepad', '057e-2009-Gamepad')).toBe('nintendo');
  });

  it('answers generic rather than guessing', () => {
    expect(detectGlyphSet('gamepad', 'Some Arcade Stick')).toBe('generic');
  });

  it('falls back to keyboard glyphs when no pad is connected', () => {
    expect(detectGlyphSet('gamepad', null)).toBe('keyboard');
  });
});

describe('gamepad button labels', () => {
  it('names the bottom face button by what is printed on it', () => {
    // The standard mapping normalises positions, not letters. Index 0 is the
    // bottom face button, which is A on an Xbox pad and B on a Nintendo one.
    expect(gamepadButtonLabel(GamepadButton.South, 'xbox')).toBe('A');
    expect(gamepadButtonLabel(GamepadButton.South, 'playstation')).toBe('Cross');
    expect(gamepadButtonLabel(GamepadButton.South, 'nintendo')).toBe('B');
    expect(gamepadButtonLabel(GamepadButton.South, 'generic')).toBe('Button 1');
  });

  it('names the right face button, which Nintendo swaps too', () => {
    expect(gamepadButtonLabel(GamepadButton.East, 'xbox')).toBe('B');
    expect(gamepadButtonLabel(GamepadButton.East, 'nintendo')).toBe('A');
  });

  it('names shoulders and triggers per family', () => {
    expect(gamepadButtonLabel(GamepadButton.RightTrigger, 'xbox')).toBe('RT');
    expect(gamepadButtonLabel(GamepadButton.RightTrigger, 'playstation')).toBe('R2');
    expect(gamepadButtonLabel(GamepadButton.RightTrigger, 'nintendo')).toBe('ZR');
  });

  it('names the menu buttons per family', () => {
    expect(gamepadButtonLabel(GamepadButton.Start, 'xbox')).toBe('Menu');
    expect(gamepadButtonLabel(GamepadButton.Start, 'playstation')).toBe('Options');
    expect(gamepadButtonLabel(GamepadButton.Start, 'nintendo')).toBe('Plus');
  });

  it('labels a button outside the standard mapping', () => {
    // A non-standard pad reports whatever indices it likes, and those still
    // have to be rebindable and still have to render as something.
    expect(gamepadButtonLabel(21, 'xbox')).toBe('Button 21');
  });
});

describe('key labels', () => {
  it('reads the letter and digit codes as themselves', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit4')).toBe('4');
  });

  it('draws the arrow keys as arrows', () => {
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('ArrowRight')).toBe('→');
  });

  it('shortens the long names', () => {
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keyLabel('ShiftLeft')).toBe('L Shift');
    expect(keyLabel('NumpadAdd')).toBe('Num Add');
  });

  it('spells out the punctuation codes', () => {
    expect(keyLabel('BracketLeft')).toBe('[');
    expect(keyLabel('Backslash')).toBe('\\');
    expect(keyLabel('Quote')).toBe("'");
  });

  it('falls back to the code for anything unrecognised', () => {
    expect(keyLabel('F5')).toBe('F5');
    expect(keyLabel('IntlBackslash')).toBe('IntlBackslash');
  });
});

describe('prompts', () => {
  it('labels every binding on an action', () => {
    const bindings = createDefaultBindings();
    expect(bindingLabels(bindings, 'fire', 'keyboard', 'keyboard')).toEqual(['Space']);
    expect(bindingLabels(bindings, 'bomb', 'gamepad', 'playstation')).toEqual(['L2', 'Square']);
  });

  it('prompts with the first binding', () => {
    const bindings = createDefaultBindings();
    expect(actionPrompt(bindings, 'map', 'keyboard', 'keyboard')).toBe('Tab');
    expect(actionPrompt(bindings, 'map', 'gamepad', 'xbox')).toBe('View');
  });

  it('returns null rather than an empty prompt', () => {
    // "Press  to open the map" reads as a rendering glitch, so a caller has to
    // handle the absence explicitly instead of printing it by accident.
    const bindings = createDefaultBindings();
    clearBindings(bindings, 'map', 'keyboard');
    expect(actionPrompt(bindings, 'map', 'keyboard', 'keyboard')).toBeNull();
  });

  it('reports actions a player has left unbound', () => {
    const bindings = createDefaultBindings();
    expect(unboundActions(bindings, 'keyboard')).toEqual([]);

    clearBindings(bindings, 'bomb', 'keyboard');
    expect(unboundActions(bindings, 'keyboard')).toEqual(['bomb']);
  });

  it('does not report the directions the sticks cover', () => {
    // Aim has no default gamepad button and needs none: the right stick aims.
    const bindings = createDefaultBindings();
    expect(unboundActions(bindings, 'gamepad')).toEqual([]);
  });
});
