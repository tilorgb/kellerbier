import { CATEGORY_SPECS, type SpriteCategory } from '../../tools/art/spec.mjs';
import { allowedColorsFor } from '../../tools/art/palette.mjs';

/**
 * One drawn frame: RGBA bytes, `width * height * 4` long. `Uint8ClampedArray`
 * because that is what `CanvasRenderingContext2D`'s `ImageData` already uses
 * — the grid (`canvas.ts`) reads and writes these in place via `ImageData`,
 * no conversion at the paint boundary.
 */
export type FrameData = Uint8ClampedArray;

export type Tool = 'pen' | 'eraser';

/**
 * A sprite category's canvas is fixed at its spec's *maximum* size
 * (`docs/DECISIONS.md` #24) — `minWidth <= maxWidth <= maxWidth` is always
 * true, so a canvas authored at that size can never fail
 * `validate.mjs`'s `validateSpriteSize`, for any category, with no
 * freehand resizing to get there. `character`'s "roughly 12x16" and
 * `boss`'s "up to 48x48" both mean "this is the largest legal size", not
 * "this is the only legal size" — a narrower character or a smaller boss is
 * still a sprite drawn on this canvas with its unused columns/rows left
 * transparent, exactly as legal as one that fills it.
 */
export function canvasSizeFor(category: SpriteCategory): { width: number; height: number } {
  const spec = CATEGORY_SPECS[category];
  return { width: spec.maxWidth, height: spec.maxHeight };
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
  /** `null` only when the palette has not painted a first selection yet — the picker always defaults one in. */
  selectedColor: number | null = null;
  dirty = false;

  private readonly listeners = new Set<() => void>();

  constructor(bucketId: string, category: SpriteCategory) {
    this.bucketId = bucketId;
    this.category = category;
    const size = canvasSizeFor(category);
    this.width = size.width;
    this.height = size.height;
    this.frames = [blankFrame(this.width, this.height)];
    const [firstColor] = [...allowedColorsFor(bucketId)];
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

  /** Resets to a fresh single-frame blank canvas for `bucketId`/`category`, keeping the current name. */
  reset(bucketId: string, category: SpriteCategory): void {
    this.bucketId = bucketId;
    this.category = category;
    const size = canvasSizeFor(category);
    this.width = size.width;
    this.height = size.height;
    this.frames = [blankFrame(this.width, this.height)];
    this.activeFrameIndex = 0;
    const [firstColor] = [...allowedColorsFor(bucketId)];
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
}
