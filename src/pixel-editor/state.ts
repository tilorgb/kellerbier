import type { SpriteCategory } from '../../tools/art/spec.mjs';
import type { SpriteTier } from '../../tools/art/palette.mjs';
import { nudgeShade, pickableColorsFor } from '../../tools/art/palette.mjs';
import { DEFAULT_SIZE_PRESET_ID, sizePresetFor } from './size-presets.js';

/**
 * One drawn frame: RGBA bytes, `width * height * 4` long. `Uint8ClampedArray`
 * because that is what `CanvasRenderingContext2D`'s `ImageData` already uses
 * — the grid (`canvas.ts`) reads and writes these in place via `ImageData`,
 * no conversion at the paint boundary.
 */
export type FrameData = Uint8ClampedArray;

export type Tool = 'pen' | 'eraser' | 'shade';

/** How wide a `shade` stroke's brush is, in pixels of radius — `1` touches only the pixel under the pointer. */
export const MIN_BRUSH_RADIUS = 1;
export const MAX_BRUSH_RADIUS = 6;
export const DEFAULT_BRUSH_RADIUS = 2;

/**
 * Chance any one pixel under a `shade` brush actually moves on a given
 * pointer-move sample, rather than every covered pixel shifting every time:
 * a drag samples many times a second, so shading at 100% would saturate a
 * whole area to the ramp's end in an instant and there would be no dial
 * between "touched it once" and "touched it for a while" — the brush would
 * only ever paint a flat darkest/lightest fill, never the mixed grain a
 * shading pass is actually for.
 */
const SHADE_HIT_CHANCE = 0.35;

/**
 * A named size preset's `(width, height)` — `size-presets.ts`'s curated
 * tiers are a one-click starting point for "New" (and the numbers
 * `tests/unit/pixel-editor-size-presets.test.ts` checks against
 * `CATEGORY_SPECS`), not the canvas's only legal size: `docs/DECISIONS.md`
 * #26 replaced "pick one of five tiers" with two independently editable
 * width/height fields, since walking width and height up together in
 * lockstep can never land on a wide-and-short canvas. `PixelEditorState`
 * itself just takes whatever `(width, height)` the caller hands it, checked
 * against `isWithinCategorySpec` — this is only for computing a tier's
 * numbers to seed those fields.
 */
export function canvasSizeFor(
  category: SpriteCategory,
  sizePresetId: string,
): { width: number; height: number } {
  const preset = sizePresetFor(category, sizePresetId);
  return { width: preset.width, height: preset.height };
}

export function blankFrame(width: number, height: number): FrameData {
  return new Uint8ClampedArray(width * height * 4);
}

/**
 * The pixel editor's whole mutable state: one bucket/category/name target,
 * a fixed-size canvas, and one or more frames (multiple frames become an
 * animation strip on save). There is one of these per boot — the palette
 * panel, canvas, frame strip and legibility panel all read and write it, and
 * a change from any one of them has to reach every other on the next paint.
 */
export class PixelEditorState {
  bucketId: string;
  category: SpriteCategory;
  name = '';
  width: number;
  height: number;
  frames: FrameData[];
  activeFrameIndex = 0;
  frameDurationMs = 120;
  loop = true;
  onionSkin = true;
  tool: Tool = 'pen';
  /**
   * Which palette tier this sprite is drawn on (#214). Drives the swatch set
   * the palette panel offers and the `shade` tool's ramp — a background sprite
   * only ever sees the quiet derived colours, so `docs/DECISIONS.md` #25's "no
   * off-palette pixel to lint for" holds for it too. Set from `spriteTier` on
   * Load; chosen in the "New" controls otherwise.
   */
  tier: SpriteTier = 'foreground';
  /** `null` only when the palette has not painted a first selection yet — the picker always defaults one in. */
  selectedColor: number | null = null;
  /** Radius of the `shade` tool's brush, in pixels — irrelevant to `pen`/`eraser`, which always touch exactly one. */
  brushRadius = DEFAULT_BRUSH_RADIUS;
  dirty = false;

  private readonly listeners = new Set<() => void>();

  constructor(
    bucketId: string,
    category: SpriteCategory,
    width?: number,
    height?: number,
    tier: SpriteTier = 'foreground',
  ) {
    this.bucketId = bucketId;
    this.category = category;
    this.tier = tier;
    const size =
      width !== undefined && height !== undefined
        ? { width, height }
        : canvasSizeFor(category, DEFAULT_SIZE_PRESET_ID);
    this.width = size.width;
    this.height = size.height;
    this.frames = [blankFrame(this.width, this.height)];
    const [firstColor] = [...pickableColorsFor(bucketId, tier)];
    this.selectedColor = firstColor ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(): void {
    this.dirty = true;
    for (const listener of this.listeners) {
      listener();
    }
  }

  markClean(): void {
    this.dirty = false;
  }

  get activeFrame(): FrameData {
    const frame = this.frames[this.activeFrameIndex];
    if (frame === undefined) {
      throw new Error(`activeFrameIndex ${String(this.activeFrameIndex)} is out of range`);
    }
    return frame;
  }

  get onionSkinFrame(): FrameData | null {
    if (!this.onionSkin || this.activeFrameIndex === 0) {
      return null;
    }
    return this.frames[this.activeFrameIndex - 1] ?? null;
  }

  /** Resets to a fresh single-frame blank canvas for `bucketId`/`category`/`tier`/`(width, height)`, keeping the current name. */
  reset(
    bucketId: string,
    category: SpriteCategory,
    width?: number,
    height?: number,
    tier: SpriteTier = 'foreground',
  ): void {
    this.bucketId = bucketId;
    this.category = category;
    this.tier = tier;
    const size =
      width !== undefined && height !== undefined
        ? { width, height }
        : canvasSizeFor(category, DEFAULT_SIZE_PRESET_ID);
    this.width = size.width;
    this.height = size.height;
    this.frames = [blankFrame(this.width, this.height)];
    this.activeFrameIndex = 0;
    const [firstColor] = [...pickableColorsFor(bucketId, tier)];
    this.selectedColor = firstColor ?? null;
    this.dirty = false;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Loads decoded frames (from the server, or a fresh `reset`) verbatim — used by the browse panel's Load action. */
  loadFrames(
    frames: FrameData[],
    width: number,
    height: number,
    frameDurationMs: number,
    loop: boolean,
  ): void {
    this.frames = frames;
    this.width = width;
    this.height = height;
    this.activeFrameIndex = 0;
    this.frameDurationMs = frameDurationMs;
    this.loop = loop;
    this.dirty = false;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Resizes the canvas in place, top-left anchored: every frame's existing
   * pixels stay exactly where they were drawn, new area (growing) comes in
   * blank, and area that no longer fits (shrinking) is simply cut off — the
   * "New" button already covers "start over at a different size," this is
   * "the sprite I'm partway through drawing is the wrong size."
   */
  resizeCanvas(width: number, height: number): void {
    this.frames = this.frames.map((frame) => {
      const resized = blankFrame(width, height);
      const copyWidth = Math.min(this.width, width);
      const copyHeight = Math.min(this.height, height);
      for (let row = 0; row < copyHeight; row++) {
        const sourceStart = row * this.width * 4;
        const destStart = row * width * 4;
        resized.set(frame.subarray(sourceStart, sourceStart + copyWidth * 4), destStart);
      }
      return resized;
    });
    this.width = width;
    this.height = height;
    this.notify();
  }

  addFrame(): void {
    this.frames.splice(this.activeFrameIndex + 1, 0, blankFrame(this.width, this.height));
    this.activeFrameIndex += 1;
    this.notify();
  }

  duplicateFrame(): void {
    const copy = new Uint8ClampedArray(this.activeFrame);
    this.frames.splice(this.activeFrameIndex + 1, 0, copy);
    this.activeFrameIndex += 1;
    this.notify();
  }

  removeFrame(index: number): void {
    if (this.frames.length <= 1) {
      return;
    }
    this.frames.splice(index, 1);
    this.activeFrameIndex = Math.min(this.activeFrameIndex, this.frames.length - 1);
    this.notify();
  }

  setActiveFrameIndex(index: number): void {
    this.activeFrameIndex = index;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Paints one pixel of the active frame with `selectedColor` (pen) or clears it (eraser). Alpha-0 clears "off-palette" checks too — see `validate.mjs`'s `findOffPalettePixel`. */
  paintPixel(x: number, y: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }
    const index = (y * this.width + x) * 4;
    const frame = this.activeFrame;
    if (this.tool === 'eraser' || this.selectedColor === null) {
      frame[index] = 0;
      frame[index + 1] = 0;
      frame[index + 2] = 0;
      frame[index + 3] = 0;
    } else {
      frame[index] = (this.selectedColor >> 16) & 0xff;
      frame[index + 1] = (this.selectedColor >> 8) & 0xff;
      frame[index + 2] = this.selectedColor & 0xff;
      frame[index + 3] = 255;
    }
    this.notify();
  }

  /**
   * Nudges pixels within `brushRadius` of `(centerX, centerY)` a step lighter
   * or darker, each independently and at random — some of an already-painted
   * area reading brighter, some darker, is the actual shading effect; every
   * covered pixel moving the same direction would just be a flat recolour.
   * Only touches pixels that are already opaque and already on `bucketId`'s
   * ramp (`palette.mjs`'s `nudgeShade` returns an untouched colour otherwise,
   * which includes every fully-transparent pixel): shading paints over
   * existing art, it does not fill blank canvas.
   */
  shadeArea(centerX: number, centerY: number): void {
    const frame = this.activeFrame;
    const radius = this.brushRadius;
    const radiusSquared = radius * radius;
    let changed = false;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radiusSquared) {
          continue;
        }
        const x = centerX + dx;
        const y = centerY + dy;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
          continue;
        }
        const index = (y * this.width + x) * 4;
        if (frame[index + 3] === 0) {
          continue;
        }
        if (Math.random() > SHADE_HIT_CHANCE) {
          continue;
        }
        const color =
          (((frame[index] ?? 0) << 16) |
            ((frame[index + 1] ?? 0) << 8) |
            (frame[index + 2] ?? 0)) >>>
          0;
        const direction = Math.random() < 0.5 ? -1 : 1;
        const next = nudgeShade(this.bucketId, color, direction, this.tier);
        if (next === color) {
          continue;
        }
        frame[index] = (next >> 16) & 0xff;
        frame[index + 1] = (next >> 8) & 0xff;
        frame[index + 2] = next & 0xff;
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
  }
}
