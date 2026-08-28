/**
 * Concatenates same-sized frames into one horizontal animation strip — the
 * `name.strip.png` half of the `*.strip.png` + `*.anim.json` pair
 * `tools/art/scan.mjs` expects. No padding between frames: `validate.mjs`'s
 * `validateSpriteSize` divides the strip's width by the frame count to get
 * back a per-frame width, and padding would break that division.
 *
 * Kept separate from `tools/art/pack.mjs` on purpose — that packer sorts,
 * pads and power-of-two-pads sprites of *different* sizes into an atlas;
 * this is the simpler "lay N same-size frames edge to edge" case the pixel
 * editor's save endpoint needs, and forcing it through the packer's shelf
 * layout would make the strip's frame order (and therefore playback order)
 * a function of sort order rather than authoring order.
 */

/**
 * `frames`: `{ width, height, pixels: Buffer }[]`, all the same width and
 * height — the pixel editor's canvas is fixed-size per category, so every
 * frame drawn in one session already satisfies that; this function does not
 * re-check it.
 *
 * Returns `{ width, height, pixels }` for the combined strip. Throws for an
 * empty `frames` array — there is no such thing as a zero-frame strip.
 */
export function buildStrip(frames) {
  if (frames.length === 0) {
    throw new Error('buildStrip: at least one frame is required');
  }
  const [first] = frames;
  const { width: frameWidth, height } = first;
  const stripWidth = frameWidth * frames.length;
  const pixels = Buffer.alloc(stripWidth * height * 4);

  frames.forEach((frame, index) => {
    for (let row = 0; row < height; row++) {
      const sourceStart = row * frameWidth * 4;
      const destStart = (row * stripWidth + index * frameWidth) * 4;
      frame.pixels.copy(pixels, destStart, sourceStart, sourceStart + frameWidth * 4);
    }
  });

  return { width: stripWidth, height, pixels };
}
