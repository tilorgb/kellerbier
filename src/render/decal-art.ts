import {
  DECAL_KIND_COUNT,
  DECAL_VARIANTS,
  DecalKind,
  type DecalKindId,
} from '../sim/particle/decals.js';
import { type Texture, textureFromPixels } from './gfx/index.js';

/**
 * What a kill leaves on the floor, drawn: one small pixel-art spatter per
 * (kind, variant), generated from a seed so the art is a pure function of
 * its two numbers. Pure pixels, no GPU — `decalPixels` is what the specimen
 * sheet script and the tests call, `buildDecalArt` is what uploads them.
 *
 * Every drawing is a centre mass (where the body lay) with the kind's debris
 * thrown outward from it, on a canvas the size of two authored pixels per room
 * unit across a typical splash (`docs/DECISIONS.md` #45). The debris is what
 * says what the thing was; the centre mass is kept small and low-contrast so a
 * floor of kills reads as a record of the fight rather than as painted discs.
 */

/** Canvas side in authored pixels. */
export const DECAL_PIXELS = 32;

/** The decal's opacity on the floor, by kind — blood and oil sit in the floor, dust and chips lie on it. */
export const DECAL_ALPHA: Readonly<Record<DecalKindId, number>> = {
  [DecalKind.Blood]: 0.72,
  [DecalKind.Ichor]: 0.7,
  [DecalKind.Spores]: 0.6,
  [DecalKind.Metal]: 0.85,
  [DecalKind.Wood]: 0.85,
  [DecalKind.Shards]: 0.85,
};

interface Palette {
  readonly base: number;
  readonly dark: number;
  readonly light: number;
  readonly accent: number;
}

const PALETTES: Readonly<Record<DecalKindId, Palette>> = {
  [DecalKind.Blood]: { base: 0x6b1a1a, dark: 0x4a1010, light: 0x8e2a26, accent: 0x7a2220 },
  [DecalKind.Ichor]: { base: 0x6f7d2a, dark: 0x4d5a1c, light: 0x9aa63c, accent: 0x5f6b24 },
  [DecalKind.Spores]: { base: 0x8d9a74, dark: 0x6f7c5a, light: 0xc4cfa8, accent: 0xa8b48c },
  [DecalKind.Metal]: { base: 0x35322e, dark: 0x25221f, light: 0xb4b8bc, accent: 0x9a5a2a },
  [DecalKind.Wood]: { base: 0x7a5530, dark: 0x4f361d, light: 0xc9a56c, accent: 0xa07a46 },
  [DecalKind.Shards]: { base: 0xb4573a, dark: 0x8a3f2a, light: 0xe8dcc4, accent: 0xd0a082 },
};

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Canvas {
  readonly pixels = new Int32Array(DECAL_PIXELS * DECAL_PIXELS).fill(-1);

  set(x: number, y: number, colour: number): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= DECAL_PIXELS || py >= DECAL_PIXELS) {
      return;
    }
    this.pixels[py * DECAL_PIXELS + px] = colour;
  }

  disc(cx: number, cy: number, radius: number, colour: number): void {
    const reach = Math.ceil(radius);
    for (let y = -reach; y <= reach; y++) {
      for (let x = -reach; x <= reach; x++) {
        if (x * x + y * y <= radius * radius + 0.25) {
          this.set(cx + x, cy + y, colour);
        }
      }
    }
  }

  /** A line from `(x0, y0)` to `(x1, y1)`, `w0` thick at the start and `w1` at the end. */
  line(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, c: number): void {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(length * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const radius = (w0 + (w1 - w0) * t) / 2;
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.max(0.4, radius - 0.5), c);
    }
  }
}

const CENTRE = (DECAL_PIXELS - 1) / 2;

/** An irregular mass: radius `r` wobbled by the angle, a dark core and one wet glint. */
function mass(
  canvas: Canvas,
  rng: () => number,
  radius: number,
  palette: Palette,
  glint: boolean,
): void {
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const reach = Math.ceil(radius * 1.5);
  for (let y = -reach; y <= reach; y++) {
    for (let x = -reach; x <= reach; x++) {
      const angle = Math.atan2(y, x);
      const edge =
        radius *
        (1 +
          0.22 * Math.sin(2 * angle + p1) +
          0.16 * Math.sin(3 * angle + p2) +
          0.1 * Math.sin(5 * angle + p3));
      const distance = Math.hypot(x, y);
      if (distance <= edge) {
        canvas.set(CENTRE + x, CENTRE + y, distance <= edge * 0.55 ? palette.dark : palette.base);
      }
    }
  }
  if (glint) {
    canvas.set(CENTRE - radius * 0.3, CENTRE - radius * 0.35, palette.light);
    canvas.set(CENTRE - radius * 0.3 + 1, CENTRE - radius * 0.35, palette.light);
  }
}

/** Streaks flung outward with a droplet past each one's tip, plus loose satellite dots. */
function splat(canvas: Canvas, rng: () => number, palette: Palette, ichor: boolean): void {
  const radius = ichor ? 4.5 + rng() * 1.5 : 3.5 + rng() * 1.5;
  // Lobes first, so the streaks start from a ragged edge, not a clean disc.
  for (let i = 0; i < 2; i++) {
    const angle = rng() * Math.PI * 2;
    canvas.disc(
      CENTRE + Math.cos(angle) * radius * 0.7,
      CENTRE + Math.sin(angle) * radius * 0.7,
      radius * (0.4 + rng() * 0.2),
      palette.base,
    );
  }
  mass(canvas, rng, radius, palette, true);
  const streaks = (ichor ? 2 : 3) + Math.floor(rng() * 3);
  for (let i = 0; i < streaks; i++) {
    const angle = rng() * Math.PI * 2;
    const length = 2 + rng() * 5;
    const start = radius * 0.7;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const colour = rng() < 0.5 ? palette.base : palette.accent;
    canvas.line(
      CENTRE + dx * start,
      CENTRE + dy * start,
      CENTRE + dx * (start + length),
      CENTRE + dy * (start + length),
      2.5,
      1,
      colour,
    );
    if (rng() < 0.75) {
      canvas.disc(
        CENTRE + dx * (start + length + 2 + rng() * 2),
        CENTRE + dy * (start + length + 2 + rng() * 2),
        rng() < 0.4 ? 1 : 0.4,
        colour,
      );
    }
  }
  const dots = (ichor ? 8 : 6) + Math.floor(rng() * 6);
  for (let i = 0; i < dots; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = radius + 2 + rng() * 7;
    canvas.set(
      CENTRE + Math.cos(angle) * distance,
      CENTRE + Math.sin(angle) * distance,
      palette.base,
    );
  }
}

/** A soft ring of powder, thinning outward, with a few paler motes. */
function puff(canvas: Canvas, rng: () => number, palette: Palette): void {
  const motes = 70 + Math.floor(rng() * 25);
  for (let i = 0; i < motes; i++) {
    const angle = rng() * Math.PI * 2;
    // Squared, so the powder is dense near the body and drifts thin outward.
    const distance = 1 + Math.pow(rng(), 1.6) * 13;
    const colour = rng() < 0.18 ? palette.light : rng() < 0.5 ? palette.base : palette.dark;
    canvas.set(CENTRE + Math.cos(angle) * distance, CENTRE + Math.sin(angle) * distance, colour);
  }
  canvas.disc(CENTRE, CENTRE, 2.5, palette.base);
}

/** An oil patch under angular scrap: bolts, plate, a rust fleck and one bright glint. */
function scrap(canvas: Canvas, rng: () => number, palette: Palette): void {
  mass(canvas, rng, 2.5 + rng() * 1.2, palette, false);
  const pieces = 10 + Math.floor(rng() * 5);
  for (let i = 0; i < pieces; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = 2 + rng() * 10;
    const x = CENTRE + Math.cos(angle) * distance;
    const y = CENTRE + Math.sin(angle) * distance;
    const roll = rng();
    if (roll < 0.35) {
      // A bolt or washer: a pixel with a dark underside.
      canvas.set(x, y, palette.light);
      canvas.set(x + 1, y + 1, palette.dark);
    } else if (roll < 0.7) {
      // A plate: a short flat strip, one face lit.
      const flat = rng() < 0.5;
      const length = 2 + Math.floor(rng() * 3);
      for (let j = 0; j < length; j++) {
        canvas.set(flat ? x + j : x, flat ? y : y + j, 0x6c7074);
      }
      canvas.set(x, y, palette.light);
    } else if (roll < 0.85) {
      canvas.set(x, y, palette.accent);
      canvas.set(x + 1, y, palette.accent);
    } else {
      // A bent shard on the diagonal.
      for (let j = 0; j < 3; j++) {
        canvas.set(x + j, y + j, 0x8a8e92);
      }
    }
  }
}

/** Splinters of every length on a scatter of sawdust. */
function splinters(canvas: Canvas, rng: () => number, palette: Palette): void {
  const sawdust = 24 + Math.floor(rng() * 12);
  for (let i = 0; i < sawdust; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = Math.pow(rng(), 1.3) * 11;
    canvas.set(
      CENTRE + Math.cos(angle) * distance,
      CENTRE + Math.sin(angle) * distance,
      rng() < 0.5 ? palette.accent : palette.dark,
    );
  }
  const pieces = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < pieces; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = 2 + rng() * 8;
    const x = CENTRE + Math.cos(angle) * distance;
    const y = CENTRE + Math.sin(angle) * distance;
    const turn = rng() * Math.PI;
    const length = 3 + rng() * 5;
    canvas.line(
      x,
      y,
      x + Math.cos(turn) * length,
      y + Math.sin(turn) * length,
      1.6,
      1,
      rng() < 0.6 ? palette.base : palette.light,
    );
  }
}

/** Ceramic chips: a few flat triangles-ish flakes, glazed on one face, over a scatter of grit. */
function chips(canvas: Canvas, rng: () => number, palette: Palette): void {
  const grit = 14 + Math.floor(rng() * 8);
  for (let i = 0; i < grit; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = 2 + rng() * 11;
    canvas.set(
      CENTRE + Math.cos(angle) * distance,
      CENTRE + Math.sin(angle) * distance,
      palette.accent,
    );
  }
  const flakes = 6 + Math.floor(rng() * 3);
  for (let i = 0; i < flakes; i++) {
    const angle = rng() * Math.PI * 2;
    const distance = 2 + rng() * 9;
    const x = CENTRE + Math.cos(angle) * distance;
    const y = CENTRE + Math.sin(angle) * distance;
    const size = 2 + Math.floor(rng() * 2);
    const glaze = rng() < 0.5 ? palette.base : palette.light;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size - row; col++) {
        canvas.set(x + col, y + row, row === 0 ? glaze : palette.dark);
      }
    }
  }
}

/** The pixels of one decal drawing — `DECAL_PIXELS` square, `-1` where the floor shows through. */
export function decalPixels(kind: DecalKindId, variant: number): Int32Array {
  const rng = seeded(kind * 7919 + variant * 104729 + 17);
  const canvas = new Canvas();
  const palette = PALETTES[kind];
  switch (kind) {
    case DecalKind.Blood:
      splat(canvas, rng, palette, false);
      break;
    case DecalKind.Ichor:
      splat(canvas, rng, palette, true);
      break;
    case DecalKind.Spores:
      puff(canvas, rng, palette);
      break;
    case DecalKind.Metal:
      scrap(canvas, rng, palette);
      break;
    case DecalKind.Wood:
      splinters(canvas, rng, palette);
      break;
    case DecalKind.Shards:
      chips(canvas, rng, palette);
      break;
  }
  return canvas.pixels;
}

/** Every kind's variants, uploaded: `art[kind][variant]`. */
export type DecalArt = readonly (readonly Texture[])[];

export function buildDecalArt(): DecalArt {
  const art: Texture[][] = [];
  for (let kind = 0; kind < DECAL_KIND_COUNT; kind++) {
    const variants: Texture[] = [];
    for (let variant = 0; variant < DECAL_VARIANTS; variant++) {
      variants.push(
        textureFromPixels(DECAL_PIXELS, DECAL_PIXELS, decalPixels(kind as DecalKindId, variant)),
      );
    }
    art.push(variants);
  }
  return art;
}
