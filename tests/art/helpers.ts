import { encodePng } from '../../tools/art/png.mjs';

/**
 * Builds a PNG buffer from a per-pixel colour function — the one place the
 * art pipeline tests touch a real PNG codec, so fixtures never need to be
 * committed binary files.
 */
export function makePng(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number, number],
): Buffer {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const [r, g, b, a] = colorAt(x, y);
      pixels[index] = r;
      pixels[index + 1] = g;
      pixels[index + 2] = b;
      pixels[index + 3] = a;
    }
  }
  return encodePng({ width, height, pixels });
}

/** A PNG buffer filled with one solid `0xRRGGBB` colour, fully opaque. */
export function solidPng(width: number, height: number, color: number): Buffer {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return makePng(width, height, () => [r, g, b, 255]);
}
