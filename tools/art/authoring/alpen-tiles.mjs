import { encodePng } from '../png.mjs';
import { legalPixelColorsFor, shadeOf } from '../palette.mjs';

/**
 * Die Alpen's tileset and props (#40): the snowfield floor, the granite
 * wall face and its snowed-over top, the destructible barrel, and the
 * art-only props a room is dressed with — a Berghütte, a cable-car pylon, a
 * snow-laden fir, a summit cross, a cairn. Authored as code, the way
 * `blocks.mjs` and `build-wald-objects.mjs` are (`docs/DECISIONS.md`
 * #43/#55), and held byte for byte by `tests/art/alpen-tiles-authoring.test.ts`.
 *
 *   npm run art:alpen-tiles
 *
 * **The snow is grey, on purpose.** Floor, wall, lip and art-only props are
 * drawn on the background tier (`tools/art/tiers.mjs`, `docs/DECISIONS.md`
 * #62), whose lightness stops at 0.4 — so the brightest snow a floor tile may
 * carry is `#949494`, and a whole room of it reads as a snowfield in shade,
 * not a white sheet. The real whites are kept for what the player acts on:
 * the boulders' snow caps (`blocks.mjs`), the barrel's lid, the ice sheets
 * (`render/world/scenery.ts`), the creatures. That contrast is what keeps the
 * one floor whose colour is "white" from being a blank screen.
 *
 * Rock is the floor's dark granite, blue-grey; the alpenglow pink lives on
 * the rim of the wall top and in the odd glint on the snow, nowhere large.
 */

const W = 32;
const BG = legalPixelColorsFor('floor-4-alpen', 'background');
const FG = legalPixelColorsFor('floor-4-alpen');
export const TILE_BUCKET = 'floor-4-alpen';

// ----------------------------------------------------------------- palette
// Background tier: every value is `legalPixelColorsFor(bucket, 'background')`.
const SNOW = {
  bright: shadeOf(0x666666, 2), // 949494 — the brightest the tier allows
  light: shadeOf(0x5f676d, 2), // 8d959b
  base: shadeOf(0x606060, 2), // 8e8e8e
  blue: shadeOf(0x576775, 2), // 8495a4 — cold drift highlight
  shade: shadeOf(0x5f676d, 1), // 747e86
  deep: shadeOf(0x576775, 1), // 6b7e8f
  glow: shadeOf(0x854757, 2), // b47384 — alpenglow on a crust
  glowDeep: shadeOf(0x854757, 1), // a3576b
};
const GRANITE = {
  h: shadeOf(0x5f676d, 1), // 747e86
  l: 0x5f676d,
  m: 0x576775,
  d: shadeOf(0x576775, -1), // 43505b
  d2: shadeOf(0x576775, -2), // 303940
  deep: 0x1c1a1f,
  mortar: shadeOf(0x5f676d, -2), // 34393c
};
const WOOD = {
  h: shadeOf(0x856b47, 2), // b49973
  l: shadeOf(0x856b47, 1), // a38357
  m: 0x856b47,
  d: shadeOf(0x856b47, -1), // 675337
  d2: shadeOf(0x856b47, -2), // 493b27
};
const NIGHT = {
  l: shadeOf(0x233341, 2), // 43627d
  m: shadeOf(0x233341, 1), // 334a5f
  d: 0x233341,
  d2: shadeOf(0x233341, -1), // 131c23
};
// Foreground tier, for the barrel: the skin ramp is the one warm wood the
// floor's five allow, and the snow on its lid is the real white.
const STAVE = {
  h: shadeOf(0xe8c28c, -1), // e0ae66
  m: shadeOf(0xe8c28c, -2), // d99940
  d: shadeOf(0x6e7680, -1), // 595f67 — shadow side, grey
  deep: 0x1c1a1f,
};
const HOOP = shadeOf(0x6e7680, -2); // 44484f
const WHITE = { snow: 0xeef2f5, shade: shadeOf(0xeef2f5, -1), deep: shadeOf(0xeef2f5, -2) };

const SHADOW = 0x1c1a1f;
const SHADOW_ALPHA = 104;

// ------------------------------------------------------------------ canvas
function hash(x, y, s) {
  let h =
    (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519)) >>>
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function canvas(h, fill = null) {
  return {
    h,
    px: Array.from({ length: h }, () => Array(W).fill(fill)),
    sh: Array.from({ length: h }, () => Array(W).fill(false)),
  };
}
function set(cv, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < W && y < cv.h) cv.px[y][x] = c;
}
const on = (cv, x, y) => x >= 0 && y >= 0 && x < W && y < cv.h && cv.px[y][x] !== null;
const wrap = (v, n) => ((v % n) + n) % n;
function setWrap(cv, x, y, c, rows = cv.h) {
  cv.px[wrap(y, rows)][wrap(x, W)] = c;
}
function shadow(cv, cx, cy, rx, ry) {
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < W; x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) cv.sh[y][x] = true;
}
function rect(cv, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(cv, x, y, c);
}
/** Snow lying on every upward-facing edge of the silhouette: `depth` rows, lit on top. */
function snowOn(cv, seed, min, max, top, shade, { yLimit = 99, chance = 1 } = {}) {
  const snap = cv.px.map((r) => [...r]);
  const has = (x, y) => (snap[y]?.[x] ?? null) !== null;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < cv.h; y++) {
      if (!has(x, y) || has(x, y - 1) || y > yLimit) continue;
      if (hash(x, y, seed) > chance) continue;
      const depth = min + Math.floor((Math.sin(x * 0.9 + seed + y) * 0.5 + 0.5) * (max - min + 1));
      for (let k = 0; k < depth; k++) {
        if (!has(x, y + k)) break;
        set(cv, x, y + k, k === depth - 1 && depth > 1 ? shade : top);
      }
    }
  }
}
/** A 1-px rim in `dark`, lit `light` along the top-left — the outline every object here carries. */
function rim(cv, dark, light) {
  const snap = cv.px.map((r) => [...r]);
  const has = (x, y) => (snap[y]?.[x] ?? null) !== null;
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < W; x++) {
      if (snap[y][x] === null) continue;
      if (has(x - 1, y) && has(x + 1, y) && has(x, y - 1) && has(x, y + 1)) continue;
      cv.px[y][x] = light !== null && (!has(x - 1, y) || !has(x, y - 1)) ? light : dark;
    }
}
function contact(cv, deep, d2) {
  for (let x = 0; x < W; x++) {
    let b = -1;
    for (let y = cv.h - 1; y >= 0; y--)
      if (on(cv, x, y)) {
        b = y;
        break;
      }
    if (b < 0) continue;
    for (let y = b; y > b - 2; y--) if (on(cv, x, y)) set(cv, x, y, y === b ? deep : d2);
  }
}
function finish(name, cv, tier) {
  return { name, width: W, height: cv.h, px: cv.px, sh: cv.sh, tier };
}

// ======================================================= FLOOR (background)
/**
 * Four snowfield variants, all tiling seamlessly: trodden snow with a cold
 * drift here and there, then — one variant each — a patch of granite showing
 * through, a ski track across, and a crust catching the alpenglow.
 */
function snowField(seed) {
  const cv = canvas(W, SNOW.base);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const r = hash(x, y, seed);
      if (r < 0.1) cv.px[y][x] = SNOW.light;
      else if (r < 0.16) cv.px[y][x] = SNOW.bright;
      else if (r < 0.2) cv.px[y][x] = SNOW.shade;
    }
  // Two soft drifts: a run of lighter snow with a cold blue edge below.
  for (let d = 0; d < 2; d++) {
    const cx = Math.floor(hash(d, 1, seed) * W);
    const cy = Math.floor(hash(d, 2, seed) * W);
    const len = 7 + Math.floor(hash(d, 3, seed) * 6);
    for (let k = 0; k < len; k++) {
      const x = cx + k;
      const y = cy + Math.round(Math.sin(k * 0.6 + d) * 1.2);
      setWrap(cv, x, y, SNOW.bright);
      setWrap(cv, x, y + 1, SNOW.light);
      setWrap(cv, x, y + 2, SNOW.blue);
    }
  }
  return cv;
}
function floorTiles() {
  const tiles = [];
  for (let v = 1; v <= 4; v++) {
    const cv = snowField(v * 13);
    if (v === 2) {
      // Granite showing through, a ragged patch.
      for (let y = 0; y < W; y++)
        for (let x = 0; x < W; x++) {
          const d = Math.hypot((x - 19) / 7, (y - 17) / 5) + (hash(x, y, 99) - 0.5) * 0.5;
          if (d <= 1)
            cv.px[y][x] = d > 0.78 ? GRANITE.d : hash(x, y, 7) < 0.15 ? GRANITE.l : GRANITE.m;
        }
    }
    if (v === 3) {
      // A ski track: two parallel grooves, edge to edge, a shade down.
      for (let x = 0; x < W; x++) {
        const y = 12 + Math.round(Math.sin(x * 0.25) * 2);
        setWrap(cv, x, y, SNOW.shade);
        setWrap(cv, x, y + 1, SNOW.deep);
        setWrap(cv, x, y + 4, SNOW.shade);
        setWrap(cv, x, y + 5, SNOW.deep);
      }
    }
    if (v === 4) {
      // The alpenglow: a few crust glints, pink, never more than a pixel or two.
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(hash(i, 5, 44) * W);
        const y = Math.floor(hash(i, 6, 44) * W);
        setWrap(cv, x, y, SNOW.glow);
        setWrap(cv, x + 1, y, SNOW.glowDeep);
      }
    }
    tiles.push(finish(`alpen-floor-${String(v)}`, cv, 'background'));
  }
  return tiles;
}

// ================================================ WALL and WALL TOP (background)
/** The granite face: big irregular slabs with dark mortar, lit along their top edges, wrapping horizontally. */
function wall() {
  const cv = canvas(W, GRANITE.mortar);
  const courses = [
    [0, 10],
    [11, 20],
    [21, 31],
  ];
  courses.forEach(([y0, y1], c) => {
    let x = c * 7;
    while (x < W + 14) {
      const len = 8 + Math.floor(hash(x, c, 30) * 7);
      const tone = hash(x, c, 31);
      const face = tone < 0.33 ? GRANITE.m : tone < 0.66 ? GRANITE.l : GRANITE.d;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x; xx < x + len - 1; xx++) {
          let colour = face;
          if (yy === y0) colour = GRANITE.h;
          else if (yy === y1 - 1) colour = GRANITE.d2;
          else if (hash(xx, yy, 32) < 0.06) colour = GRANITE.d;
          setWrap(cv, xx, yy, colour);
        }
      x += len;
    }
  });
  return finish('alpen-wall', cv, 'background');
}
/**
 * The wall top (`render/world/scenery.ts`'s lip layout): rows 0-23 tile
 * seamlessly on their own — snow lying on the top of the wall, a drift or
 * two, a granite chip showing — and rows 24-31 are the edge band the room
 * sees, ending in a rim that catches the alpenglow. Drawn edge-at-the-bottom
 * and flipped on save, like the wald lip.
 */
const BODY = 24;
function lip() {
  const cv = canvas(W, SNOW.base);
  for (let y = 0; y < BODY; y++)
    for (let x = 0; x < W; x++) {
      const r = hash(x, y, 51);
      if (r < 0.14) cv.px[y][x] = SNOW.light;
      else if (r < 0.2) cv.px[y][x] = SNOW.bright;
      else if (r < 0.24) cv.px[y][x] = SNOW.shade;
    }
  for (let d = 0; d < 3; d++) {
    const cx = Math.floor(hash(d, 1, 52) * W);
    const cy = Math.floor(hash(d, 2, 52) * BODY);
    for (let k = 0; k < 8; k++) {
      const x = cx + k;
      const y = cy + Math.round(Math.sin(k * 0.7) * 1.1);
      cv.px[wrap(y, BODY)][wrap(x, W)] = SNOW.bright;
      cv.px[wrap(y + 1, BODY)][wrap(x, W)] = SNOW.blue;
    }
  }
  // A granite chip poking through the snow on the wall top.
  for (let y = -2; y <= 2; y++)
    for (let x = -3; x <= 3; x++)
      if (Math.hypot(x / 3, y / 2) <= 1)
        cv.px[wrap(14 + y, BODY)][wrap(7 + x, W)] = y < 0 ? GRANITE.l : GRANITE.d;
  // The edge band: crust, then the rock's rim, then the glow on the lip.
  for (let x = 0; x < W; x++) {
    for (let y = BODY; y < 27; y++) cv.px[y][x] = hash(x, y, 53) < 0.3 ? SNOW.light : SNOW.base;
    cv.px[27][x] = SNOW.shade;
    cv.px[28][x] = GRANITE.d2;
    cv.px[29][x] = GRANITE.d;
    cv.px[30][x] = GRANITE.l;
    cv.px[31][x] = hash(x, 31, 54) < 0.7 ? SNOW.glow : SNOW.glowDeep;
  }
  // Flipped: the renderer puts the image's top rows on the room side.
  cv.px.reverse();
  return cv;
}

// ============================================================ PROPS (background)
/** A Berghütte: a low log cabin under a thick snowed roof, a lit window, a chimney. 32x40, standing on its bottom row. */
function huette() {
  const cv = canvas(40);
  shadow(cv, 17, 37, 15, 3);
  // Log walls.
  for (let y = 22; y <= 37; y++) {
    const log = Math.floor((y - 22) / 3);
    const c = log % 2 === 0 ? WOOD.m : WOOD.d;
    for (let x = 4; x <= 28; x++) set(cv, x, y, (y - 22) % 3 === 0 ? WOOD.l : c);
  }
  // Door and window.
  rect(cv, 13, 27, 18, 37, 0x1c1a1f);
  rect(cv, 14, 28, 17, 36, WOOD.d2);
  set(cv, 17, 32, WOOD.h);
  rect(cv, 21, 26, 25, 30, NIGHT.d2);
  rect(cv, 22, 27, 24, 29, NIGHT.l);
  set(cv, 23, 28, SNOW.glow);
  // Roof: a wide gable, snowed over, eaves past the walls.
  for (let y = 10; y <= 23; y++) {
    const half = 2 + (y - 10) * 1.15;
    for (let x = Math.round(16 - half); x <= Math.round(16 + half); x++) {
      set(
        cv,
        x,
        y,
        y >= 21 ? WOOD.d2 : y >= 19 ? SNOW.shade : hash(x, y, 61) < 0.12 ? SNOW.bright : SNOW.light,
      );
    }
  }
  // Ridge and eave lines.
  for (let x = 2; x <= 30; x++) set(cv, x, 22, WOOD.d2);
  // Chimney with a plume of smoke.
  rect(cv, 21, 7, 23, 13, GRANITE.d);
  rect(cv, 21, 7, 23, 7, GRANITE.l);
  set(cv, 22, 6, SNOW.light);
  set(cv, 22, 4, SNOW.shade);
  set(cv, 23, 3, SNOW.shade);
  set(cv, 24, 1, SNOW.shade);
  rim(cv, 0x1c1a1f, null);
  contact(cv, 0x050506, WOOD.d2);
  return finish('alpen-huette', cv, 'background');
}
/** A cable-car pylon: a lattice steel tower with its crossarm and the cable running off both edges. 32x40. */
function pylon() {
  const cv = canvas(40);
  shadow(cv, 16, 37, 9, 3);
  // Legs, tapering.
  for (let y = 6; y <= 37; y++) {
    const half = 3 + ((y - 6) / 31) * 7;
    set(cv, 16 - half, y, GRANITE.l);
    set(cv, 16 - half + 1, y, GRANITE.m);
    set(cv, 16 + half, y, GRANITE.d);
    set(cv, 16 + half - 1, y, GRANITE.m);
  }
  // Cross-bracing.
  for (let y = 8; y <= 36; y += 7) {
    const half = 3 + ((y - 6) / 31) * 7;
    for (let x = Math.round(16 - half); x <= Math.round(16 + half); x++) {
      set(cv, x, y, GRANITE.d);
      const t = (x - (16 - half)) / (2 * half);
      set(cv, x, y + Math.round(t * 6), GRANITE.d2);
      set(cv, x, y + Math.round((1 - t) * 6), GRANITE.d2);
    }
  }
  // Crossarm and the cable, which leaves the canvas on both sides.
  rect(cv, 6, 5, 26, 6, GRANITE.d);
  rect(cv, 6, 5, 26, 5, GRANITE.h);
  for (let x = 0; x < W; x++) {
    const y = 3 + Math.round(((x - 16) / 16) ** 2 * 1.5);
    set(cv, x, y, GRANITE.d2);
  }
  // Snow on the crossarm and the braces.
  snowOn(cv, 71, 1, 1, SNOW.light, SNOW.shade, { chance: 0.7 });
  // Concrete feet.
  rect(cv, 4, 36, 8, 38, GRANITE.d2);
  rect(cv, 24, 36, 28, 38, GRANITE.d2);
  return finish('alpen-pylon', cv, 'background');
}
/** A fir under snow: three tiers of dark needles, each shelved with snow, a short trunk. 32x40. */
function fir() {
  const cv = canvas(40);
  shadow(cv, 16, 37, 11, 3);
  rect(cv, 14, 31, 17, 37, WOOD.d);
  rect(cv, 15, 31, 15, 37, WOOD.m);
  const tiers = [
    [31, 12],
    [23, 9],
    [15, 6],
  ];
  for (const [base, half] of tiers) {
    for (let y = base - 9; y <= base; y++) {
      const t = (base - y) / 9;
      const w = half * (1 - t) + 1;
      for (let x = Math.round(16 - w); x <= Math.round(16 + w); x++) {
        const edge = Math.abs(x - 16) > w - 1.5;
        const r = hash(x, y, 81);
        set(cv, x, y, edge ? NIGHT.d2 : r < 0.15 ? NIGHT.l : r < 0.5 ? NIGHT.m : NIGHT.d);
      }
    }
  }
  set(cv, 16, 5, NIGHT.d);
  set(cv, 16, 4, NIGHT.m);
  snowOn(cv, 82, 1, 3, SNOW.light, SNOW.shade, { chance: 0.85 });
  rim(cv, 0x050506, null);
  contact(cv, 0x050506, WOOD.d2);
  return finish('alpen-fir', cv, 'background');
}
/** A summit cross: a tall wooden cross set in a small heap of stones. 32x40. */
function gipfelkreuz() {
  const cv = canvas(40);
  shadow(cv, 16, 37, 8, 2);
  // The stone heap.
  for (let y = 31; y <= 37; y++) {
    const half = 3 + (y - 31) * 1.1;
    for (let x = Math.round(16 - half); x <= Math.round(16 + half); x++) {
      const r = hash(x, y, 91);
      set(cv, x, y, r < 0.3 ? GRANITE.l : r < 0.7 ? GRANITE.m : GRANITE.d);
    }
  }
  // The cross.
  rect(cv, 15, 4, 17, 32, WOOD.m);
  rect(cv, 15, 4, 15, 32, WOOD.l);
  rect(cv, 17, 4, 17, 32, WOOD.d);
  rect(cv, 8, 11, 24, 13, WOOD.m);
  rect(cv, 8, 11, 24, 11, WOOD.l);
  rect(cv, 8, 13, 24, 13, WOOD.d);
  // A ring where the arms meet, and snow on every upper edge.
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    set(cv, 16 + Math.cos(ang) * 5, 12 + Math.sin(ang) * 5, WOOD.d2);
  }
  snowOn(cv, 92, 1, 1, SNOW.light, SNOW.shade);
  rim(cv, 0x1c1a1f, null);
  contact(cv, 0x050506, GRANITE.d2);
  return finish('alpen-gipfelkreuz', cv, 'background');
}
/** A cairn: five stones stacked, smallest on top, snow on each. 32x32. */
function cairn() {
  const cv = canvas(32);
  shadow(cv, 17, 29, 10, 3);
  const stones = [
    [16, 27, 9, 4],
    [16, 21, 7, 3.5],
    [15, 16, 5.5, 3],
    [16, 12, 4, 2.5],
    [16, 9, 2.5, 2],
  ];
  stones.forEach(([cx, cy, rx, ry], i) => {
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < W; x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const lit = -(nx * 0.7 + ny * 0.7);
        set(
          cv,
          x,
          y,
          lit > 0.5 ? GRANITE.h : lit > 0 ? GRANITE.l : lit > -0.5 ? GRANITE.m : GRANITE.d,
        );
      }
    void i;
  });
  snowOn(cv, 93, 1, 2, SNOW.light, SNOW.shade);
  rim(cv, GRANITE.d2, GRANITE.h);
  contact(cv, 0x050506, GRANITE.d2);
  return finish('alpen-cairn', cv, 'background');
}

// ===================================================== DESTRUCTIBLE (foreground)
/** The barrel, 32x32, upright: warm staves, iron hoops, snow on the lid. */
function barrel() {
  const cv = canvas(32);
  shadow(cv, 18, 29, 12, 3);
  const halfAt = (y) => 9 + Math.sin(Math.max(0, Math.min(1, (y - 4) / 26)) * Math.PI) * 2;
  for (let y = 4; y <= 30; y++)
    for (let x = 0; x < W; x++) {
      const half = halfAt(y);
      if (Math.abs(x - 16) > half) continue;
      const nx = (x - 16) / half;
      set(cv, x, y, nx < -0.45 ? STAVE.h : nx < 0.5 ? STAVE.m : STAVE.d);
    }
  for (let y = 6; y <= 30; y++)
    for (const off of [-6, -2, 2, 6]) set(cv, 16 + off * (halfAt(y) / 11), y, STAVE.deep);
  for (const y of [8, 17, 26])
    for (let x = 0; x < W; x++)
      if (on(cv, x, y)) {
        set(cv, x, y, HOOP);
        set(cv, x, y - 1, STAVE.h);
      }
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < W; x++) {
      const d = ((x - 16) / 9) ** 2 + ((y - 5) / 2.5) ** 2;
      if (d <= 1) set(cv, x, y, d > 0.6 ? WHITE.deep : d > 0.25 ? WHITE.shade : WHITE.snow);
    }
  rim(cv, STAVE.deep, STAVE.h);
  contact(cv, 0x050506, STAVE.deep);
  return finish('alpen-barrel', cv, 'foreground');
}

// ---------------------------------------------------------------------------
/** `name -> frame` for every tile this module authors. */
export const ALPEN_TILES = Object.fromEntries(
  [
    ...floorTiles(),
    wall(),
    finish('alpen-wall-lip', lip(), 'background'),
    finish('alpen-wall-lip-corner', lip(), 'background'),
    huette(),
    pylon(),
    fir(),
    gipfelkreuz(),
    cairn(),
    barrel(),
  ].map((frame) => [frame.name, frame]),
);

/** Throws if any painted pixel is not legal for the frame's tier on floor-4-alpen. */
export function assertOnPalette(frame) {
  const legal = frame.tier === 'background' ? BG : FG;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const c = frame.px[y][x];
      if (c !== null && !legal.has(c)) {
        throw new Error(
          `${frame.name}: pixel ${String(x)},${String(y)} is #${c.toString(16).padStart(6, '0')}, not legal for ${TILE_BUCKET} (${frame.tier})`,
        );
      }
    }
  }
}

/** One frame → PNG bytes: opaque `px`, else translucent cast shadow, else clear. */
export function encodeTile(frame) {
  const { width, height } = frame;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const c = frame.px[y][x];
      if (c !== null) {
        pixels[at] = (c >> 16) & 0xff;
        pixels[at + 1] = (c >> 8) & 0xff;
        pixels[at + 2] = c & 0xff;
        pixels[at + 3] = 0xff;
      } else if (frame.sh[y][x]) {
        pixels[at] = (SHADOW >> 16) & 0xff;
        pixels[at + 1] = (SHADOW >> 8) & 0xff;
        pixels[at + 2] = SHADOW & 0xff;
        pixels[at + 3] = SHADOW_ALPHA;
      }
    }
  }
  return encodePng({ width, height, pixels });
}
