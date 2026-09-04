import { MASTER_PALETTE, NEUTRAL_PALETTE, FLOOR_PALETTES } from './palette.mjs';

/**
 * Turns a raw Stable Diffusion output (stylistically pixel-art, but a
 * continuous-tone PNG at whatever resolution the model produced — see #258)
 * into a candidate sprite/tile: box-filtered down to a grid-aligned size,
 * then every pixel snapped to a fixed palette. Neither step is destructive
 * to the *source* — this always writes a new file — and neither step is a
 * substitute for the sign-off `CLAUDE.md`'s "New pixel art needs sign-off"
 * section requires: this produces *candidates* to choose between, not a
 * finished asset.
 */

/**
 * Box-filter downscale: `targetWidth`/`targetHeight` must each evenly divide
 * `width`/`height` (the raw output is one image, not an atlas — asking for a
 * ragged block size would silently blur the grid this whole pipeline exists
 * to produce). Each output pixel is the average of its source block,
 * alpha-weighted so a half-transparent block does not pull in colour from
 * pixels that will end up invisible anyway.
 */
export function downscaleBoxFilter({ width, height, pixels }, targetWidth, targetHeight) {
  if (width % targetWidth !== 0 || height % targetHeight !== 0) {
    throw new Error(
      `${String(width)}x${String(height)} does not divide evenly into ${String(targetWidth)}x${String(targetHeight)}`,
    );
  }
  const blockW = width / targetWidth;
  const blockH = height / targetHeight;
  const out = Buffer.alloc(targetWidth * targetHeight * 4);

  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      for (let by = 0; by < blockH; by++) {
        for (let bx = 0; bx < blockW; bx++) {
          const sx = tx * blockW + bx;
          const sy = ty * blockH + by;
          const i = (sy * width + sx) * 4;
          const a = pixels[i + 3];
          rSum += pixels[i] * a;
          gSum += pixels[i + 1] * a;
          bSum += pixels[i + 2] * a;
          aSum += a;
        }
      }
      const o = (ty * targetWidth + tx) * 4;
      const blockPixels = blockW * blockH;
      out[o] = aSum > 0 ? Math.round(rSum / aSum) : 0;
      out[o + 1] = aSum > 0 ? Math.round(gSum / aSum) : 0;
      out[o + 2] = aSum > 0 ? Math.round(bSum / aSum) : 0;
      out[o + 3] = Math.round(aSum / blockPixels);
    }
  }
  return { width: targetWidth, height: targetHeight, pixels: out };
}

/**
 * Snaps every pixel to the nearest colour in `palette` (Euclidean RGB
 * distance — good enough to pick between a handful of hand-authored hues,
 * not a general-purpose perceptual metric). Alpha passes through unchanged:
 * quantizing transparency the same way would turn a soft downscaled edge
 * into a hard on/off cutout, which is exactly the kind of decision the
 * sign-off step, not this script, should make.
 */
export function quantizeToPalette({ width, height, pixels }, palette) {
  const out = Buffer.alloc(pixels.length);
  const cache = new Map();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = (r << 16) | (g << 8) | b;
    let nearest = cache.get(key);
    if (nearest === undefined) {
      nearest = nearestPaletteColor(r, g, b, palette);
      cache.set(key, nearest);
    }
    out[i] = (nearest >> 16) & 0xff;
    out[i + 1] = (nearest >> 8) & 0xff;
    out[i + 2] = nearest & 0xff;
    out[i + 3] = pixels[i + 3];
  }
  return { width, height, pixels: out };
}

function nearestPaletteColor(r, g, b, palette) {
  let best = palette[0];
  let bestDistance = Infinity;
  for (const color of palette) {
    const pr = (color >> 16) & 0xff;
    const pg = (color >> 8) & 0xff;
    const pb = color & 0xff;
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best;
}

/**
 * The palette a candidate should be snapped to: a named floor's own five
 * hues plus the shared neutrals (matching `allowedColorsFor` in
 * `palette.mjs`), or the whole `MASTER_PALETTE` for a candidate not yet
 * committed to one floor. Kept separate from `allowedColorsFor` itself
 * because a raw diffusion candidate is not a sprite bucket yet — it has no
 * `bucketId`, just a floor it's being explored for.
 */
export function paletteForFloor(floorTag) {
  if (floorTag === null || floorTag === undefined) {
    return MASTER_PALETTE;
  }
  const floorColors = FLOOR_PALETTES[floorTag];
  if (floorColors === undefined) {
    throw new Error(`unknown floor tag "${floorTag}"`);
  }
  return [...NEUTRAL_PALETTE, ...floorColors];
}

/**
 * The full candidate pipeline: downscale, then quantize. `palette` is
 * whatever `paletteForFloor` (or a caller's own array) produced.
 */
export function postprocessDiffusionOutput(
  { width, height, pixels },
  { targetWidth, targetHeight, palette },
) {
  const downscaled = downscaleBoxFilter({ width, height, pixels }, targetWidth, targetHeight);
  return quantizeToPalette(downscaled, palette);
}
