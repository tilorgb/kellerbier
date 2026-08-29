import {
  ANIMATION_STATES,
  CATEGORY_SPECS,
  CLIP_END_ACTIONS,
  CLIP_MODES,
  DEFAULT_ANIMATION_STATE,
} from './spec.mjs';

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
 * The *darkest* opaque pixel, same shape — the stand-in for "the outline".
 *
 * A projectile reads against a background by differing from it in brightness,
 * and which end of the sprite does that work depends entirely on the
 * background: a shot reads on Die Alpen's snow by its dark outline and on Der
 * Wald's black by its bright core. Checking only the bright end (which is all
 * this module offered before #152) makes a shot that appears on more than one
 * floor impossible to author — see `docs/DECISIONS.md` #39 for the search
 * that established there is no single colour clearing all seven floors.
 * `null` for a sprite with no opaque pixels at all.
 */
export function darkestOpaqueColor(pixels, width, height, luminanceOf) {
  let darkest = null;
  let darkestLuminance = Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const alpha = pixels[index + 3];
      if (alpha === 0) {
        continue;
      }
      const rgb = (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2];
      const luminance = luminanceOf(rgb);
      if (luminance < darkestLuminance) {
        darkestLuminance = luminance;
        darkest = rgb;
      }
    }
  }
  return darkest;
}

/**
 * Validates an `*.anim.json` sidecar's shape. Returns an error string, or
 * `null` if it passes.
 *
 * Two halves, and the split matters. `frames`/`frameDurationMs`/`loop`
 * describe the *strip*: how many frames the PNG holds and the timing the
 * pixel editor previews them at. `clips` — optional, added by #150 — is what
 * the game actually plays: named per animation state, each one a frame list
 * over that same strip with its own timing and end behaviour. A strip with no
 * `clips` is still legal and still animates (the whole strip becomes one
 * looping `idle` clip at the strip's own timing), which is what keeps every
 * sidecar the pixel editor has ever written valid.
 *
 * A clip is validated here rather than only at runtime because everything it
 * can get wrong is decidable from the file: a state name nothing plays, a
 * frame index the strip does not have, a `once` clip with no end behaviour to
 * apply. `docs/DECISIONS.md` #7's line applies — data whose *shape* is wrong
 * fails the build, and only a gap in what has been *authored* degrades
 * gracefully at runtime (`docs/DECISIONS.md` #19: an unauthored state falls
 * back to `idle`, which is exactly why `idle` is required below).
 */
export function validateAnimation(animation) {
  if (
    typeof animation.frames !== 'number' ||
    !Number.isInteger(animation.frames) ||
    animation.frames < 1
  ) {
    return '"frames" must be a positive integer';
  }
  const durationError = validateClipDuration(animation.frameDurationMs, animation.frames, 'frame');
  if (durationError !== null) {
    return durationError;
  }
  if (typeof animation.loop !== 'boolean') {
    return '"loop" must be a boolean';
  }
  if (animation.clips === undefined) {
    return null;
  }
  return validateClips(animation.clips, animation.frames);
}

/**
 * `"frameDurationMs"`, in either of its two authored forms: one number shared
 * by every frame, or one per frame. Shared by the strip-level field and by
 * each clip's own, because they are the same field asked about a different
 * frame count — `countLabel` is only there so the error message names which.
 */
function validateClipDuration(frameDurationMs, count, countLabel) {
  if (typeof frameDurationMs === 'number') {
    return frameDurationMs > 0 ? null : '"frameDurationMs" must be a positive number';
  }
  if (Array.isArray(frameDurationMs)) {
    if (frameDurationMs.length !== count) {
      return (
        `"frameDurationMs" has ${String(frameDurationMs.length)} entries for ` +
        `${String(count)} ${countLabel}s`
      );
    }
    if (frameDurationMs.some((duration) => typeof duration !== 'number' || duration <= 0)) {
      return '"frameDurationMs" entries must all be positive numbers';
    }
    return null;
  }
  return `"frameDurationMs" must be a number or an array of numbers, one per ${countLabel}`;
}

function validateClips(clips, stripFrames) {
  if (typeof clips !== 'object' || clips === null || Array.isArray(clips)) {
    return '"clips" must be an object keyed by animation state';
  }
  const names = Object.keys(clips);
  if (names.length === 0) {
    return '"clips" is present but empty — drop it, or author at least an "idle" clip';
  }
  if (!names.includes(DEFAULT_ANIMATION_STATE)) {
    return (
      `"clips" must include an "${DEFAULT_ANIMATION_STATE}" clip — it is what every other ` +
      'state falls back to when its own clip has not been drawn yet'
    );
  }
  for (const name of names) {
    if (!ANIMATION_STATES.includes(name)) {
      return (
        `"clips.${name}" is not an animation state (expected one of ` +
        `${ANIMATION_STATES.join(', ')}) — nothing would ever play it`
      );
    }
    const error = validateClip(clips[name], stripFrames);
    if (error !== null) {
      return `"clips.${name}": ${error}`;
    }
  }
  return null;
}

function validateClip(clip, stripFrames) {
  if (typeof clip !== 'object' || clip === null || Array.isArray(clip)) {
    return 'must be an object';
  }
  const { frames } = clip;
  if (!Array.isArray(frames) || frames.length === 0) {
    return '"frames" must be a non-empty array of frame indices';
  }
  for (const frame of frames) {
    if (typeof frame !== 'number' || !Number.isInteger(frame)) {
      return '"frames" entries must all be integers';
    }
    if (frame < 0 || frame >= stripFrames) {
      return (
        `frame index ${String(frame)} is outside the strip, which has ${String(stripFrames)} ` +
        `frame(s) (0-${String(stripFrames - 1)})`
      );
    }
  }
  const durationError = validateClipDuration(clip.frameDurationMs, frames.length, 'clip frame');
  if (durationError !== null) {
    return durationError;
  }
  if (!CLIP_MODES.includes(clip.mode)) {
    return `"mode" must be one of ${CLIP_MODES.join(', ')}`;
  }
  if (clip.onEnd !== undefined) {
    if (clip.mode !== 'once') {
      return `"onEnd" only means something on a "once" clip, and this one is "${String(clip.mode)}"`;
    }
    if (!CLIP_END_ACTIONS.includes(clip.onEnd)) {
      return `"onEnd" must be one of ${CLIP_END_ACTIONS.join(', ')}`;
    }
  }
  return null;
}

/**
 * The tight box around a sprite's opaque pixels — its silhouette, as opposed
 * to the canvas it was drawn on.
 *
 * Since `docs/DECISIONS.md` #42 a body's canvas *is* its size in internal
 * pixels, so the canvas alone cannot say how large a creature reads: two rows
 * of headroom above a 14-row woodlouse is a 16-tall file holding a 14-tall
 * animal, and it is the animal a player sees and shoots at.
 * `tests/content/sprite-scale.test.ts` compares this, not `height`, against
 * the collider the creature is authored with.
 *
 * `frameWidth` scopes the scan to frame 0 of an animation strip. One frame is
 * the right unit: every frame of a strip shares one canvas size, so the
 * silhouette of the pose the creature stands in is what the check is about,
 * not the union of every pose it ever takes.
 *
 * Returns `null` for a fully transparent sprite, which has no silhouette to
 * measure and is a different problem than a mis-sized one.
 */
export function inkedBounds(pixels, width, height, frameWidth = width) {
  const scanWidth = Math.min(frameWidth, width);
  let minX = scanWidth;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < scanWidth; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) {
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) {
    return null;
  }
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
