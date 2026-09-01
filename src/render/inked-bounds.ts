import type { Texture } from 'pixi.js';

/**
 * Where a texture's drawing actually ends at the bottom — the Y of its lowest
 * opaque row, in texture pixels from the top of its frame — as opposed to
 * where its canvas ends.
 *
 * A ground shadow has to sit at the last drawn pixel, not at the padded
 * canvas edge and not at the physics collider (`docs/DECISIONS.md` #61): a
 * sprite authored with two blank rows under its feet would otherwise cast its
 * shadow two pixels low, and a body whose collider is smaller than its art
 * (every one, since #45) would cast it high.
 *
 * Measured once per `(source, frame)` by drawing the texture's own source
 * image to a scratch 2D canvas and scanning up from the bottom, then cached.
 * When the pixels can't be read — no DOM (tests), no 2D context, a source
 * that has not decoded yet, a tainted canvas — it falls back to the full
 * frame height, which is exactly the "canvas bottom" the shadow used before
 * this and is never worse than that.
 */

/** Alpha at or below this is treated as transparent — trims the feathered edge of a soft sprite. */
const OPAQUE_THRESHOLD = 8;

const cache = new WeakMap<object, Map<string, number>>();

let scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null | undefined;

function scratchContext(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (scratch !== undefined) {
    return scratch;
  }
  if (typeof document === 'undefined') {
    scratch = null;
    return null;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  scratch = ctx === null ? null : { canvas, ctx };
  return scratch;
}

/** The source image a texture was uploaded from, if it is something a 2D canvas can draw. */
function drawableSource(texture: Texture): CanvasImageSource | null {
  const resource = (texture.source as { resource?: unknown } | undefined)?.resource;
  if (typeof ImageBitmap !== 'undefined' && resource instanceof ImageBitmap) {
    return resource;
  }
  if (typeof HTMLImageElement !== 'undefined' && resource instanceof HTMLImageElement) {
    return resource.complete && resource.naturalWidth > 0 ? resource : null;
  }
  if (typeof HTMLCanvasElement !== 'undefined' && resource instanceof HTMLCanvasElement) {
    return resource;
  }
  if (typeof OffscreenCanvas !== 'undefined' && resource instanceof OffscreenCanvas) {
    return resource;
  }
  return null;
}

export function inkedBottomY(texture: Texture): number {
  const frame = texture.frame;
  const fw = Math.max(1, Math.round(frame.width));
  const fh = Math.max(1, Math.round(frame.height));
  const fallback = fh;

  const source = texture.source as object | undefined;
  if (source === undefined) {
    return fallback;
  }
  const key = [Math.round(frame.x), Math.round(frame.y), fw, fh].join(',');
  let byFrame = cache.get(source);
  const cached = byFrame?.get(key);
  if (cached !== undefined) {
    return cached;
  }

  let result = fallback;
  const image = drawableSource(texture);
  const scratchCtx = scratchContext();
  if (image !== null && scratchCtx !== null) {
    try {
      const { canvas, ctx } = scratchCtx;
      if (canvas.width < fw) canvas.width = fw;
      if (canvas.height < fh) canvas.height = fh;
      ctx.clearRect(0, 0, fw, fh);
      ctx.drawImage(image, Math.round(frame.x), Math.round(frame.y), fw, fh, 0, 0, fw, fh);
      const data = ctx.getImageData(0, 0, fw, fh).data;
      for (let y = fh - 1; y >= 0; y--) {
        let rowHasInk = false;
        for (let x = 0; x < fw; x++) {
          if ((data[(y * fw + x) * 4 + 3] ?? 0) > OPAQUE_THRESHOLD) {
            rowHasInk = true;
            break;
          }
        }
        if (rowHasInk) {
          result = y + 1;
          break;
        }
      }
    } catch {
      result = fallback;
    }
  }

  if (byFrame === undefined) {
    byFrame = new Map();
    cache.set(source, byFrame);
  }
  byFrame.set(key, result);
  return result;
}
