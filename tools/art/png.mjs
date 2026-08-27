import { PNG } from 'pngjs';

/**
 * The only two places this pipeline touches an actual PNG codec — everything
 * else works on `{ width, height, pixels }` (`pixels` a `Buffer` of RGBA
 * bytes), so the rest of the pipeline stays testable without decoding a real
 * file.
 */

export function decodePng(buffer) {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, pixels: png.data };
}

export function encodePng({ width, height, pixels }) {
  const png = new PNG({ width, height });
  pixels.copy(png.data, 0, 0, width * height * 4);
  return PNG.sync.write(png);
}
