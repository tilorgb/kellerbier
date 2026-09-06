import { type Texture, textureFromPixels } from '../gfx/index.js';

/**
 * Generated marker shapes — a diamond, a dot, a triangle — rasterised
 * straight into pixels.
 *
 * These are the minimap's fallback room icons: the shapes it drew before the
 * authored `minimap-*.png` art (#152) existed, and the ones it still draws in
 * the room editor's playtest view and the bench scene, neither of which loads
 * the sprite tree. They are pure — no renderer, no DOM — for the same reason
 * `pixel-art.ts` and `title.ts` are, so a headless test gets the same texture
 * the game does.
 *
 * Every shape fills a `2·radius` square with its centre between the four
 * middle pixels, so the 8px marker a radius of 4 produces lands on whole
 * screen pixels at the minimap's 1:1 icon scale.
 */

function rasterise(radius: number, inside: (x: number, y: number) => number | undefined): Texture {
  const size = Math.max(1, Math.round(radius * 2));
  const colours = new Int32Array(size * size).fill(-1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const colour = inside(x, y);
      if (colour !== undefined) {
        colours[y * size + x] = colour;
      }
    }
  }
  return textureFromPixels(size, size, colours);
}

/** A filled diamond — the minimap's treasure-room icon. */
export function diamondTexture(radius: number, colour: number): Texture {
  const centre = radius - 0.5;
  return rasterise(radius, (x, y) =>
    Math.abs(x - centre) + Math.abs(y - centre) <= radius ? colour : undefined,
  );
}

/**
 * A filled disc, with an optional one-pixel lighter rim just inside its edge
 * — the minimap's shop icon.
 */
export function dotTexture(radius: number, colour: number, rim: number = colour): Texture {
  const centre = radius - 0.5;
  const outer = radius * radius;
  const innerRadius = Math.max(0, radius - 1);
  const inner = innerRadius * innerRadius;
  return rasterise(radius, (x, y) => {
    const dx = x - centre;
    const dy = y - centre;
    const distance = dx * dx + dy * dy;
    if (distance > outer) {
      return undefined;
    }
    return distance > inner ? rim : colour;
  });
}

/**
 * A hollow upward triangle — the minimap's mini-boss-room icon (#274).
 *
 * Deliberately the boss triangle with its middle cut out rather than a new
 * shape or a smaller triangle: a mini-boss is the floor's *other* fight, so
 * it should read as "boss, lesser" at a glance, and #21's "no information by
 * colour alone" means that relationship has to be carried by the silhouette,
 * not by drawing the same triangle in a different colour.
 */
export function hollowTriangleTexture(radius: number, colour: number): Texture {
  const centre = radius - 0.5;
  return rasterise(radius, (x, y) => {
    const halfWidth = (y + 1) / 2;
    const inside = Math.abs(x - centre) <= halfWidth;
    if (!inside) {
      return undefined;
    }
    // One pixel of border all round: the bottom row, and — on every other
    // row — the two pixels the row's own edge lands on. A row narrow enough
    // that its border pixels meet stays solid, which is what keeps the apex
    // from disappearing at this size.
    const isEdge = y >= radius * 2 - 1 || Math.abs(x - centre) > halfWidth - 1 || halfWidth <= 1.5;
    return isEdge ? colour : undefined;
  });
}

/** A filled upward triangle — the minimap's boss-room icon. */
export function triangleTexture(radius: number, colour: number): Texture {
  const centre = radius - 0.5;
  return rasterise(radius, (x, y) => {
    // The apex is the top row's middle pair of pixels; the base is the full
    // bottom row. Half-width grows by half a pixel per row between them.
    const halfWidth = (y + 1) / 2;
    return Math.abs(x - centre) <= halfWidth ? colour : undefined;
  });
}
