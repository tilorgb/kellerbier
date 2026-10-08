import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { format } from 'prettier';
import { decodePng, encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * The shared kit for the per-heading creature views (#438, epic #457): every
 * creature that turns the way it walks ships three strips — `<id>-side`
 * (authored facing left, mirrored for right), `<id>-south` (toward the
 * camera) and `<id>-north` (away) — the filing Alois and Der Ordner have
 * (`assets/sprites/README.md`, "Directions").
 *
 * A *frame* here is the same `{ name, width, height, px }` the rosters use,
 * `px[y][x]` being a `0xRRGGBB` number or `null`. A *view strip* is a list of
 * frames — by default three: standing, a step on each foot — plus the one
 * sidecar every such strip shares (`VIEW_ANIM`).
 */

/** The sidecar of a three-frame view strip: `idle` stands, `move` walks. */
export const VIEW_ANIM = {
  frames: 3,
  frameDurationMs: 120,
  loop: true,
  clips: {
    idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
    move: { frames: [1, 0, 2, 0], frameDurationMs: 100, mode: 'loop' },
  },
};

/** The same, for a strip that also needs the hurt flinch (frame 3 of four). */
export function viewAnim(frameCount, extraClips = {}) {
  if (frameCount === 3 && Object.keys(extraClips).length === 0) return VIEW_ANIM;
  return { ...VIEW_ANIM, frames: frameCount, clips: { ...VIEW_ANIM.clips, ...extraClips } };
}

/** A frame from text rows and a key map (`'.'` or a key mapped to `null` is transparent). */
export function frameFromRows(name, keys, rows, { ink = true } = {}) {
  const width = Math.max(...rows.map((row) => row.length));
  const px = rows.map((row, y) =>
    Array.from({ length: width }, (_, x) => {
      const ch = row[x] ?? '.';
      if (!(ch in keys)) throw new Error(`${name}: row ${String(y)} has unknown key "${ch}"`);
      return keys[ch];
    }),
  );
  const frame = { name, width, height: rows.length, px };
  return ink ? inkOutline(frame) : frame;
}

/** An empty `width`×`height` frame. */
export function blankFrame(name, width, height) {
  return {
    name,
    width,
    height,
    px: Array.from({ length: height }, () => Array.from({ length: width }, () => null)),
  };
}

/** 1px `#000000` around every painted pixel that borders emptiness (8-way); returns a new frame. */
export function inkOutline(frame) {
  const px = frame.px.map((row) => [...row]);
  const on = (x, y) =>
    x >= 0 && y >= 0 && x < frame.width && y < frame.height && frame.px[y][x] !== null;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (on(x, y)) continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (on(x + dx, y + dy)) {
            touches = true;
            break;
          }
        }
      }
      if (touches) px[y][x] = 0x000000;
    }
  }
  return { ...frame, px };
}

/** A copy of `frame` under a new name. */
export function renamed(frame, name) {
  return { ...frame, name, px: frame.px.map((row) => [...row]) };
}

/** The frame mirrored left↔right. */
export function mirrored(frame, name = frame.name) {
  return { ...frame, name, px: frame.px.map((row) => [...row].reverse()) };
}

/**
 * The frame shifted by (`dx`, `dy`) on the same canvas, vacated pixels
 * transparent and anything pushed off the edge dropped — the cheap way to a
 * walking bob (`dy: -1`) or a lean (`dx`).
 */
export function shifted(frame, dx, dy, name = frame.name) {
  const out = blankFrame(name, frame.width, frame.height);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx >= 0 && ty >= 0 && tx < frame.width && ty < frame.height) {
        out.px[ty][tx] = frame.px[y][x];
      }
    }
  }
  return out;
}

/**
 * Only the rows `from`..`to-1` of `frame` shifted by (`dx`, `dy`), the rest
 * left where they were — for lifting one side of the legs without moving the
 * body, or leaning the head. Pixels moved on top of others overwrite them.
 */
export function shiftedRows(frame, from, to, dx, dy, name = frame.name) {
  const out = renamed(frame, name);
  for (let y = from; y < to; y++) {
    for (let x = 0; x < frame.width; x++) {
      out.px[y][x] = null;
    }
  }
  for (let y = from; y < to; y++) {
    for (let x = 0; x < frame.width; x++) {
      const c = frame.px[y][x];
      const tx = x + dx;
      const ty = y + dy;
      if (c !== null && tx >= 0 && ty >= 0 && tx < frame.width && ty < frame.height) {
        out.px[ty][tx] = c;
      }
    }
  }
  return out;
}

/**
 * Stand + two step frames from one standing frame: the body bobs up a pixel
 * and leans a pixel toward each foot in turn. What a view gets for free when
 * its author does not draw legs per beat; `strip(name, stand, [a, b])` takes
 * hand-drawn ones instead.
 */
export function bobSteps(stand, name) {
  return [
    renamed(stand, `${name}-stand`),
    shifted(stand, -1, -1, `${name}-step-a`),
    shifted(stand, 1, -1, `${name}-step-b`),
  ];
}

/** Reads a committed PNG as one frame (`frames` = 1) or a list of `frames` equal frames. */
export function readFrames(path, frames = 1, name = 'frame') {
  const { width, height, pixels } = decodePng(readFileSync(path));
  const frameWidth = width / frames;
  return Array.from({ length: frames }, (_, i) => {
    const px = Array.from({ length: height }, (_, y) =>
      Array.from({ length: frameWidth }, (_, x) => {
        const at = (y * width + i * frameWidth + x) * 4;
        if (pixels[at + 3] === 0) return null;
        return (pixels[at] << 16) | (pixels[at + 1] << 8) | pixels[at + 2];
      }),
    );
    return { name: `${name}-${String(i)}`, width: frameWidth, height, px };
  });
}

/** Throws if any painted pixel is not legal for `bucket` (`tools/art/palette.mjs`). */
export function assertViewsOnPalette(bucket, strips) {
  const legal = legalPixelColorsFor(bucket);
  for (const [stripName, frames] of Object.entries(strips)) {
    for (const f of frames) {
      f.px.forEach((row, y) =>
        row.forEach((c, x) => {
          if (c !== null && !legal.has(c)) {
            throw new Error(
              `${stripName}/${f.name}: pixel ${String(x)},${String(y)} ` +
                `#${c.toString(16).padStart(6, '0')} is not legal for ${bucket}`,
            );
          }
        }),
      );
    }
  }
}

/** One strip (frames side by side, all one size) as PNG bytes. */
export function encodeViewStrip(frames) {
  const { width: fw, height } = frames[0];
  const width = fw * frames.length;
  const pixels = Buffer.alloc(width * height * 4);
  frames.forEach((f, i) => {
    if (f.width !== fw || f.height !== height) {
      throw new Error(
        `${f.name}: ${String(f.width)}x${String(f.height)} is not ${String(fw)}x${String(height)}`,
      );
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < fw; x++) {
        const c = f.px[y][x];
        if (c === null) continue;
        const at = (y * width + i * fw + x) * 4;
        pixels[at] = (c >> 16) & 0xff;
        pixels[at + 1] = (c >> 8) & 0xff;
        pixels[at + 2] = c & 0xff;
        pixels[at + 3] = 0xff;
      }
    }
  });
  return encodePng({ width, height, pixels });
}

/** A sidecar as the prettier-formatted JSON the other `.anim.json` files are. */
export async function encodeSidecar(anim) {
  return format(JSON.stringify(anim), { parser: 'json' });
}

/**
 * Writes every strip and its sidecar into `dir`.
 * `sidecars` maps a strip name to its sidecar; strips not in it get `VIEW_ANIM`.
 */
export async function writeViewStrips(dir, strips, sidecars = {}) {
  for (const [name, frames] of Object.entries(strips)) {
    const anim = sidecars[name] ?? VIEW_ANIM;
    if (anim.frames !== frames.length) {
      throw new Error(
        `${name}: sidecar says ${String(anim.frames)} frames, strip has ${String(frames.length)}`,
      );
    }
    await writeFile(`${dir}${name}.strip.png`, encodeViewStrip(frames));
    await writeFile(`${dir}${name}.anim.json`, await encodeSidecar(anim));
    console.log(
      `${name}.strip.png  ${String(frames.length)} x ${String(frames[0].width)}x${String(frames[0].height)}`,
    );
  }
}

/**
 * A specimen sheet for looking at views while authoring: one row per entry
 * (`{ label, frames }`), frames side by side, scaled up nearest-neighbour on
 * a flat background. `node -e` it or call it from a throwaway script, then
 * open the PNG.
 */
export function specimenSheet(rows, { scale = 6, background = 0x5b5f63, gap = 2 } = {}) {
  const cellW = Math.max(...rows.flatMap((r) => r.frames.map((f) => f.width)));
  const cellH = Math.max(...rows.flatMap((r) => r.frames.map((f) => f.height)));
  const cols = Math.max(...rows.map((r) => r.frames.length));
  const width = (cols * (cellW + gap) + gap) * scale;
  const height = (rows.length * (cellH + gap) + gap) * scale;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = (background >> 16) & 0xff;
    pixels[i * 4 + 1] = (background >> 8) & 0xff;
    pixels[i * 4 + 2] = background & 0xff;
    pixels[i * 4 + 3] = 0xff;
  }
  rows.forEach((row, r) => {
    row.frames.forEach((f, c) => {
      const ox = gap + c * (cellW + gap);
      const oy = gap + r * (cellH + gap) + (cellH - f.height);
      for (let y = 0; y < f.height; y++) {
        for (let x = 0; x < f.width; x++) {
          const colour = f.px[y][x];
          if (colour === null) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const at = (((oy + y) * scale + sy) * width + (ox + x) * scale + sx) * 4;
              pixels[at] = (colour >> 16) & 0xff;
              pixels[at + 1] = (colour >> 8) & 0xff;
              pixels[at + 2] = colour & 0xff;
              pixels[at + 3] = 0xff;
            }
          }
        }
      }
    });
  });
  return encodePng({ width, height, pixels });
}
