/**
 * Shelf packing: sprites sorted tallest-first, laid left to right and wrapped
 * into rows. Simple on purpose — floor atlases hold at most a few hundred
 * small, similarly-sized sprites, not the thousands a general-purpose packer
 * earns its complexity on, and a shelf packer is trivial to reason about
 * when a build fails and someone has to work out why an atlas grew.
 */

const DEFAULT_PADDING = 1;
const DEFAULT_MAX_WIDTH = 2048;

function nextPowerOfTwo(value) {
  let power = 1;
  while (power < value) {
    power *= 2;
  }
  return Math.max(power, 1);
}

function blit(destination, destWidth, source, sourceWidth, sourceHeight, destX, destY) {
  for (let row = 0; row < sourceHeight; row++) {
    const sourceStart = row * sourceWidth * 4;
    const destStart = ((destY + row) * destWidth + destX) * 4;
    source.copy(destination, destStart, sourceStart, sourceStart + sourceWidth * 4);
  }
}

/**
 * Packs `sprites` (`{ key, width, height, pixels }[]`) into one atlas.
 *
 * Returns `null` for an empty list — an empty bucket produces no atlas file
 * rather than a degenerate 1×1 one. Otherwise returns
 * `{ width, height, pixels, frames }`, where `frames` maps each sprite's
 * `key` to its placement rectangle.
 */
export function packSprites(sprites, options = {}) {
  if (sprites.length === 0) {
    return null;
  }
  const padding = options.padding ?? DEFAULT_PADDING;
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;

  const ordered = [...sprites].sort(
    (a, b) => b.height - a.height || b.width - a.width || a.key.localeCompare(b.key),
  );

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let usedWidth = 0;
  const placements = [];

  for (const sprite of ordered) {
    if (cursorX > 0 && cursorX + sprite.width > maxWidth) {
      cursorX = 0;
      cursorY += rowHeight + padding;
      rowHeight = 0;
    }
    placements.push({ sprite, x: cursorX, y: cursorY });
    usedWidth = Math.max(usedWidth, cursorX + sprite.width);
    cursorX += sprite.width + padding;
    rowHeight = Math.max(rowHeight, sprite.height);
  }
  const usedHeight = cursorY + rowHeight;

  const width = nextPowerOfTwo(usedWidth);
  const height = nextPowerOfTwo(usedHeight);
  const pixels = Buffer.alloc(width * height * 4);
  const frames = {};

  for (const { sprite, x, y } of placements) {
    blit(pixels, width, sprite.pixels, sprite.width, sprite.height, x, y);
    frames[sprite.key] = { x, y, width: sprite.width, height: sprite.height };
  }

  return { width, height, pixels, frames };
}
