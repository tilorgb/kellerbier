import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowedColorsFor, shadeOf } from '../../tools/art/palette.mjs';
import { CATEGORY_SPECS, type SpriteCategory } from '../../tools/art/spec.mjs';
import { sizePresetsFor } from '../../src/pixel-editor/size-presets.js';
import { PixelEditorState, canvasSizeFor } from '../../src/pixel-editor/state.js';

const CATEGORIES: SpriteCategory[] = ['tile', 'character', 'boss', 'projectile'];

describe('canvasSizeFor', () => {
  it.each(CATEGORIES)('resolves every %s preset to a size inside its legal range', (category) => {
    const spec = CATEGORY_SPECS[category];
    for (const preset of sizePresetsFor(category)) {
      const size = canvasSizeFor(category, preset.id);
      expect(size).toEqual({ width: preset.width, height: preset.height });
      expect(size.width).toBeGreaterThanOrEqual(spec.minWidth);
      expect(size.width).toBeLessThanOrEqual(spec.maxWidth);
      expect(size.height).toBeGreaterThanOrEqual(spec.minHeight);
      expect(size.height).toBeLessThanOrEqual(spec.maxHeight);
    }
  });
});

describe('PixelEditorState', () => {
  it('starts with one blank, fully transparent frame at the category size', () => {
    const state = new PixelEditorState('floor-1-cellar', 'tile');
    expect(state.frames).toHaveLength(1);
    expect(state.activeFrame).toHaveLength(state.width * state.height * 4);
    expect(state.activeFrame.every((byte) => byte === 0)).toBe(true);
  });

  it('defaults the selected colour to one already on the bucket palette', () => {
    const state = new PixelEditorState('floor-1-cellar', 'tile');
    expect(state.selectedColor).not.toBeNull();
    expect(allowedColorsFor('floor-1-cellar').has(state.selectedColor ?? -1)).toBe(true);
  });

  it('paintPixel with the pen tool writes the selected colour, fully opaque', () => {
    const state = new PixelEditorState('floor-1-cellar', 'tile');
    state.selectedColor = 0x3c3e40;
    state.tool = 'pen';
    state.paintPixel(1, 2);
    const index = (2 * state.width + 1) * 4;
    expect([...state.activeFrame.slice(index, index + 4)]).toEqual([0x3c, 0x3e, 0x40, 255]);
  });

  it('paintPixel with the eraser tool clears the pixel to transparent', () => {
    const state = new PixelEditorState('floor-1-cellar', 'tile');
    state.paintPixel(0, 0);
    state.tool = 'eraser';
    state.paintPixel(0, 0);
    expect([...state.activeFrame.slice(0, 4)]).toEqual([0, 0, 0, 0]);
  });

  it('paintPixel ignores out-of-bounds coordinates rather than throwing', () => {
    const state = new PixelEditorState('floor-1-cellar', 'tile');
    expect(() => {
      state.paintPixel(-1, 0);
      state.paintPixel(state.width, 0);
    }).not.toThrow();
  });

  it('notify marks the state dirty and runs subscribers; markClean resets it', () => {
    const state = new PixelEditorState('floor-1-cellar', 'tile');
    let calls = 0;
    state.subscribe(() => {
      calls += 1;
    });
    state.paintPixel(0, 0);
    expect(state.dirty).toBe(true);
    expect(calls).toBe(1);
    state.markClean();
    expect(state.dirty).toBe(false);
  });

  it('addFrame inserts a blank frame after the active one and selects it', () => {
    const state = new PixelEditorState('floor-1-cellar', 'character');
    state.addFrame();
    expect(state.frames).toHaveLength(2);
    expect(state.activeFrameIndex).toBe(1);
  });

  it('duplicateFrame copies the active frame rather than a blank one', () => {
    const state = new PixelEditorState('floor-1-cellar', 'character');
    state.paintPixel(0, 0);
    state.duplicateFrame();
    expect(state.frames).toHaveLength(2);
    const [original, duplicate] = state.frames;
    expect([...(duplicate?.slice(0, 4) ?? [])]).toEqual([...(original?.slice(0, 4) ?? [])]);
  });

  it('removeFrame never drops below one frame', () => {
    const state = new PixelEditorState('floor-1-cellar', 'character');
    state.removeFrame(0);
    expect(state.frames).toHaveLength(1);
  });

  it('removeFrame clamps activeFrameIndex after removing the last frame', () => {
    const state = new PixelEditorState('floor-1-cellar', 'character');
    state.addFrame();
    state.addFrame();
    state.setActiveFrameIndex(2);
    state.removeFrame(2);
    expect(state.activeFrameIndex).toBe(1);
  });

  it('onionSkinFrame is null on the first frame even with onion skin on', () => {
    const state = new PixelEditorState('floor-1-cellar', 'character');
    expect(state.onionSkinFrame).toBeNull();
  });

  it('onionSkinFrame is the previous frame once past the first, and null when toggled off', () => {
    const state = new PixelEditorState('floor-1-cellar', 'character');
    state.addFrame();
    expect(state.onionSkinFrame).toBe(state.frames[0]);
    state.onionSkin = false;
    expect(state.onionSkinFrame).toBeNull();
  });

  it('reset switches bucket/category, resizes the canvas to the default preset size and re-defaults the palette colour', () => {
    const state = new PixelEditorState('floor-1-cellar', 'tile');
    state.paintPixel(0, 0);
    state.reset('floor-2-rural', 'boss');
    const normalBossPreset = sizePresetsFor('boss').find((preset) => preset.id === 'normal');
    expect(normalBossPreset).toBeDefined();
    expect(state.width).toBe(normalBossPreset?.width);
    expect(state.height).toBe(normalBossPreset?.height);
    expect(state.frames).toHaveLength(1);
    expect(state.dirty).toBe(false);
    expect(allowedColorsFor('floor-2-rural').has(state.selectedColor ?? -1)).toBe(true);
  });

  it('reset accepts an explicit width and height, independent of any named preset', () => {
    const state = new PixelEditorState('floor-1-cellar', 'tile');
    state.reset('floor-1-cellar', 'character', 32, 20);
    expect(state.width).toBe(32);
    expect(state.height).toBe(20);
  });
});

describe('shadeArea', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('nudges an already-painted pixel one step darker, and leaves transparent pixels alone', () => {
    const state = new PixelEditorState('floor-1-cellar', 'character');
    const [base] = [...allowedColorsFor('floor-1-cellar')];
    if (base === undefined) {
      throw new Error('floor-1-cellar has no allowed colours');
    }
    state.selectedColor = base;
    state.tool = 'pen';
    state.paintPixel(2, 2);
    // Deterministic: always "hits" (0 > 0.35 is false) and always picks the darker direction (0 < 0.5 is true).
    vi.spyOn(Math, 'random').mockReturnValue(0);
    state.tool = 'shade';
    state.shadeArea(2, 2);
    const index = (2 * state.width + 2) * 4;
    const painted =
      ((state.activeFrame[index] ?? 0) << 16) |
      ((state.activeFrame[index + 1] ?? 0) << 8) |
      (state.activeFrame[index + 2] ?? 0);
    expect(painted).toBe(shadeOf(base, -1));
    // A transparent neighbour within the same brush radius must stay fully transparent.
    const emptyIndex = (2 * state.width + 1) * 4;
    expect([...state.activeFrame.slice(emptyIndex, emptyIndex + 4)]).toEqual([0, 0, 0, 0]);
  });

  it('clamps at the ramp end rather than drifting past it after repeated passes', () => {
    const state = new PixelEditorState('floor-1-cellar', 'character');
    const [base] = [...allowedColorsFor('floor-1-cellar')];
    if (base === undefined) {
      throw new Error('floor-1-cellar has no allowed colours');
    }
    state.selectedColor = base;
    state.tool = 'pen';
    state.paintPixel(2, 2);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    state.tool = 'shade';
    for (let i = 0; i < 5; i++) {
      state.shadeArea(2, 2);
    }
    const index = (2 * state.width + 2) * 4;
    const painted =
      ((state.activeFrame[index] ?? 0) << 16) |
      ((state.activeFrame[index + 1] ?? 0) << 8) |
      (state.activeFrame[index + 2] ?? 0);
    expect(painted).toBe(shadeOf(base, -2));
  });
});
