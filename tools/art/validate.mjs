import { CATEGORY_SPECS } from './spec.mjs';

/**
 * Sprite-spec and palette validation — pure functions over already-decoded
 * pixels, so they can be unit-tested without touching a filesystem or a real
 * PNG.
 */

/**
 * Checks a decoded sprite (or one frame of an animation strip) against its
 * category's size spec. Returns an error string, or `null` if it passes.
 */
export function validateSpriteSize(category, width, height, frameCount = 1) {
  const spec = CATEGORY_SPECS[category];
  if (spec === undefined) {
    return `unknown sprite category "${category}"`;
  }
  if (!Number.isInteger(width / frameCount)) {
    return `strip is ${width}px wide, which does not divide evenly into ${frameCount} frames`;
  }
  const frameWidth = width / frameCount;
  const withinWidth = frameWidth >= spec.minWidth && frameWidth <= spec.maxWidth;
  const withinHeight = height >= spec.minHeight && height <= spec.maxHeight;
  if (withinWidth && withinHeight) {
    return null;
  }
  const sizeLabel = frameCount > 1 ? `frame size ${frameWidth}x${height}` : `${width}x${height}`;
  return (
    `${sizeLabel} is outside the "${category}" spec ` +
    `(${spec.minWidth}-${spec.maxWidth} wide, ${spec.minHeight}-${spec.maxHeight} tall)`
  );
}

/**
 * Scans every opaque pixel of a decoded sprite for a colour outside
 * `allowedColors` (a `Set` of `0xRRGGBB` numbers). Fully transparent pixels
 * (alpha 0) are exempt — their RGB is usually whatever the export tool left
 * behind, not an authored colour. Returns the first offending pixel found,
 * or `null` if every opaque pixel is on-palette.
 */
export function findOffPalettePixel(pixels, width, height, allowedColors) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const alpha = pixels[index + 3];
      if (alpha === 0) {
        continue;
      }
      const rgb = (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2];
      if (!allowedColors.has(rgb)) {
        return { x, y, color: rgb };
      }
    }
  }
  return null;
}

/**
 * The brightest opaque pixel in a decoded sprite, as a `0xRRGGBB` colour —
 * the stand-in for "the rim" (`docs/CONTENT_BIBLE.md` §5's "enemy shots
 * always get a bright rim") when checking projectile legibility.
 * `null` for a sprite with no opaque pixels at all.
 */
export function brightestOpaqueColor(pixels, width, height, luminanceOf) {
  let brightest = null;
  let brightestLuminance = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const alpha = pixels[index + 3];
      if (alpha === 0) {
        continue;
      }
      const rgb = (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2];
      const luminance = luminanceOf(rgb);
      if (luminance > brightestLuminance) {
        brightestLuminance = luminance;
        brightest = rgb;
      }
    }
  }
  return brightest;
}

/**
 * Validates an `*.anim.json` sidecar's shape. Returns an error string, or
 * `null` if it passes.
 */
export function validateAnimation(animation) {
  if (
    typeof animation.frames !== 'number' ||
    !Number.isInteger(animation.frames) ||
    animation.frames < 1
  ) {
    return '"frames" must be a positive integer';
  }
  const { frameDurationMs } = animation;
  if (typeof frameDurationMs === 'number') {
    if (frameDurationMs <= 0) {
      return '"frameDurationMs" must be a positive number';
    }
  } else if (Array.isArray(frameDurationMs)) {
    if (frameDurationMs.length !== animation.frames) {
      return `"frameDurationMs" has ${frameDurationMs.length} entries for ${animation.frames} frames`;
    }
    if (frameDurationMs.some((duration) => typeof duration !== 'number' || duration <= 0)) {
      return '"frameDurationMs" entries must all be positive numbers';
    }
  } else {
    return '"frameDurationMs" must be a number or an array of numbers, one per frame';
  }
  if (typeof animation.loop !== 'boolean') {
    return '"loop" must be a boolean';
  }
  return null;
}
