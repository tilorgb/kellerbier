/**
 * A pit in the floor (#410): a floor plank a Borkenkäfer ate through. Drawn
 * as pixels from a palette — no authored tile — so a headless specimen sheet
 * and the game draw the same hole (`docs/DECISIONS.md` #43's shortcut).
 *
 * 32×32 texels over one 16-unit floor tile, the density of the floor art
 * around it. Read from above at the game's 65°: the far inner wall of the
 * hole shows, the near one does not, and the rim is pale splintered board —
 * the one thing that reads on the near-black Wald floor. The look is option A
 * of three, signed off by Tilo, shown in a wald room next to Alois.
 */

export const PIT_TEXELS = 32;

const INK = 0x000000;
const SHADE = 0x1c1a1f;
const WALL_FAR = 0x332f38;
const WALL_MID = 0x494451;

/** The splintered rim's colours, lightest last. */
const RIM: readonly number[] = [0x737373, 0xa1a1a1, 0xd1d1d1];

/** Small deterministic hash → [0, 1). */
function hash(a: number, b: number, seed: number): number {
  let h = (a * 374761393 + b * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The hole's texels, top row first, `-1` for transparent (the floor shows
 * through outside the rim). `seed` varies the splinters per pit so a row of
 * them does not read as one stamped tile.
 */
export function pitPixels(seed: number): Int32Array {
  const size = PIT_TEXELS;
  const colours = new Int32Array(size * size).fill(-1);
  const rim = RIM;
  // How far in from each edge the hole starts, per texel along that edge —
  // ragged, so the edge reads as broken rather than cut.
  const inset = (edge: number, along: number): number =>
    2 + Math.floor(hash(edge, along >> 1, seed) * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const top = inset(0, x);
      const bottom = inset(1, x);
      const left = inset(2, y);
      const right = inset(3, y);
      const inside = y >= top && y < size - bottom && x >= left && x < size - right;
      const at = y * size + x;
      if (!inside) {
        // The splintered rim: a band one or two texels wide around the hole.
        const near = y >= top - 2 && y < size - bottom + 2 && x >= left - 2 && x < size - right + 2;
        if (near) {
          const pick = hash(x, y, seed + 7);
          colours[at] = rim[pick < 0.35 ? 0 : pick < 0.8 ? 1 : 2] ?? INK;
        }
        continue;
      }
      // Inside: the far wall shows as a short gradient under the top rim;
      // below that, nothing but dark.
      const depth = y - top;
      colours[at] = depth < 2 ? WALL_MID : depth < 5 ? WALL_FAR : depth < 8 ? SHADE : INK;
      // Splinter stubs poking into the hole from the rim.
      const fromEdge = Math.min(x - left, size - right - 1 - x, y - top, size - bottom - 1 - y);
      if (fromEdge < 2 && hash(x, y, seed + 13) < 0.22) {
        colours[at] = rim[1] ?? INK;
      }
    }
  }
  return colours;
}
