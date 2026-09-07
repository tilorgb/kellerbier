import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * Der Keller's two mini-bosses (#276) — Der Rattenkönig and Die Zapfhahn-Orgel.
 *
 * Authored the same way as the Floor 1 roster (`floor1-roster.mjs`, `docs/
 * DECISIONS.md` #55): a per-floor key map, a full-canvas text grid, and
 * `inkOutline` putting the hard `#000000` edge on automatically. The raster
 * core is duplicated per-module on purpose, the same call `bosses.mjs` and the
 * two rosters make.
 *
 * These started as ComfyUI candidates (the local diffusion pipeline, `docs/
 * DECISIONS.md` #71/#77 — a hulking rat-beast for the King, a row of brass
 * tap-columns for the Orgel), picked from an options round, then re-drawn by
 * hand to the floor's flat-fill / bold-outline discipline: the generator gave
 * the silhouette and the pose, this is the sprite the game actually draws.
 *
 * Both are `mid` (collider 40 internal px). The King reads clearly bigger than
 * the roster and clearly smaller than Die Große Kellerassel (#276's own
 * size brief, `docs/DECISIONS.md` #56 the reference); the Orgel is wall
 * apparatus, no face, like the roster Zapfhahn it is three of.
 *
 * Everything is authored **facing left** (`render/animation/state.ts`'s
 * `AUTHORED_FACING`); the engine mirrors it when a body moves right. Neither
 * of these bodies actually moves, but the convention still holds.
 */

// ------------------------------------------------------------------ palette
// Der Keller's five — three close greys, one brown, one amber — plus the
// neutrals and their ramps. Identical key map to `floor1-roster.mjs`'s
// `CELLAR`; kept here rather than imported, per the per-module rule above.
export const CELLAR = {
  '.': null,
  K: 0x000000, // outline + internal ink
  x: 0x1c1a1f, // near-black shade, eye pupil, dark iron
  D: 0x3c3e40, // grey, darkest (Der Keller base)
  M: 0x4a4d50, // grey, mid
  L: 0x5b5f63, // grey, light
  H: 0x888d92, // grey, highlight
  G: 0x8a8a8a, // neutral grey — brass fittings, iron hoops
  B: 0x54402e, // brown (fur / wood)
  b: 0x36291e, // brown, dark (underside, shade)
  r: 0x72573e, // brown, lit
  R: 0x8f6d4e, // brown, highlight (spine ridge)
  A: 0xd99a3f, // amber — the one warm light, a rim only
  W: 0xffffff, // eye sclera, hot glint, beer foam
};

{
  const legal = legalPixelColorsFor('floor-1-cellar');
  for (const [key, colour] of Object.entries(CELLAR)) {
    if (colour !== null && !legal.has(colour)) {
      throw new Error(
        `floor1-minibosses key "${key}" is #${colour.toString(16).padStart(6, '0')}, ` +
          `not legal for floor-1-cellar — see tools/art/palette.mjs`,
      );
    }
  }
}

// --------------------------------------------------------------- raster core
function canvas(w, h) {
  return { w, h, px: Array.from({ length: h }, () => Array.from({ length: w }, () => null)) };
}

function paint(name, rows) {
  const w = Math.max(...rows.map((row) => row.length));
  if (w === 0) throw new Error(`${name}: no rows`);
  const cv = canvas(w, rows.length);
  rows.forEach((row, y) => {
    const padded = row.padEnd(w, '.');
    for (let x = 0; x < w; x++) {
      const ch = padded[x];
      if (!(ch in CELLAR)) throw new Error(`${name}: row ${String(y)} has unknown key "${ch}"`);
      cv.px[y][x] = CELLAR[ch];
    }
  });
  return cv;
}

/** 1px `#000000` around every painted pixel that borders emptiness (8-way). */
function inkOutline(cv) {
  const snap = cv.px.map((row) => [...row]);
  const on = (x, y) => x >= 0 && y >= 0 && x < cv.w && y < cv.h && snap[y][x] !== null;
  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      if (on(x, y)) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (on(x + dx, y + dy)) {
            cv.px[y][x] = 0x000000;
            dx = dy = 2;
          }
        }
      }
    }
  }
  return cv;
}

function frameOf(name, cv) {
  return { name, width: cv.w, height: cv.h, px: cv.px };
}

/** A whole sprite from one full-canvas text grid, auto-inked. */
function single(name, rows) {
  return frameOf(name, inkOutline(paint(name, rows)));
}

function putFrame(pixels, stripWidth, frame, ox) {
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const c = frame.px[y][x];
      if (c === null) continue;
      const at = (y * stripWidth + ox + x) * 4;
      pixels[at] = (c >> 16) & 0xff;
      pixels[at + 1] = (c >> 8) & 0xff;
      pixels[at + 2] = c & 0xff;
      pixels[at + 3] = 0xff;
    }
  }
}

export function encodeSingle(f) {
  const pixels = Buffer.alloc(f.width * f.height * 4);
  putFrame(pixels, f.width, f, 0);
  return encodePng({ width: f.width, height: f.height, pixels });
}

/** Throws if any painted pixel is not legal for floor-1-cellar. */
export function assertOnPalette(framesIn) {
  const legal = legalPixelColorsFor('floor-1-cellar');
  for (const f of framesIn) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const c = f.px[y][x];
        if (c !== null && !legal.has(c)) {
          throw new Error(
            `${f.name}: pixel ${x},${y} is #${c.toString(16).padStart(6, '0')}, not legal`,
          );
        }
      }
    }
  }
}

// ============================================================ ZAPFHAHN-ORGEL
// Three brass tap columns hung from one iron manifold, foam pooling under
// them. `mid`, contact damage 0 (wall apparatus, like the roster Zapfhahn).
// No face — the three spouts and the sweep of foam are the whole read.
export const zapfhahnOrgel = single('die-zapfhahn-orgel', [
  '......KK..........KK..........KK.....',
  '......xx..........xx..........xx.....',
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  'KHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHK',
  'KxGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGxK',
  'KxxHGGHGGHGGHGGHGGHGGHGGHGGHGGHGGHGxxK',
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  'KxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxK',
  'KxxDDDxxxxxxxxDDDxxxxxxxxDDDxxxxxxxxxK',
  'KxDGGGDxxxxxxDGGGDxxxxxxDGGGDxxxxxxxxK',
  'KxDGHGDxxxxxxDGHGDxxxxxxDGHGDxxxxxxxxK',
  'KxDGGGDxxxxxxDGGGDxxxxxxDGGGDxxxxxxxxK',
  'KxxDGDxxxxxxxxDGDxxxxxxxxDGDxxxxxxxxxK',
  'KxDDGDDxxxxxxDDGDDxxxxxxDDGDDxxxxxxxxK',
  'KDGGGGGDxxxxDGGGGGDxxxxDGGGGGDxxxxxxxK',
  'KxDDGDDxxxxxxDDGDDxxxxxxDDGDDxxxxxxxxK',
  'KxxDGDxxxxxxxxDGDxxxxxxxxDGDxxxxxxxxxK',
  'KxxDGDxxxxxxxxDGDxxxxxxxxDGDxxxxxxxxxK',
  'KxxDADxxxxxxxxDADxxxxxxxxDADxxxxxxxxxK',
  'KxxDGDxxxxxxxxDGDxxxxxxxxDGDxxxxxxxxxK',
  'KxxDGDxxxxxxxxDGDxxxxxxxxDGDxxxxxxxxxK',
  'KKKDGDKKKKKKKKDGDKKKKKKKKDGDKKKKKKKKKK',
  '...DGD..........DGD..........DGD.....',
  '..KDGDK........KDGDK........KDGDK.....',
  '..KKWKK........KKWKK........KKWKK.....',
  '....W............W............W......',
  '....W............W............W......',
  '...WWW..........WWW..........WWW.....',
  '...WWW..........WWW..........WWW.....',
  '..WWWWW........WWWWW........WWWWW.....',
  '.WWWWWWW......WWWWWWW......WWWWWWW....',
  'KWWHWWWWWKKKKKWWWWHWWWKKKKKWWWWWHWWWWK',
  'KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
]);

// ============================================================ RATTENKÖNIG
// The floor's Bierratte (#228), scaled up into a boss: a huge angry head with
// two hard-browed eyes and two buck teeth, round ears, a jagged iron crown,
// a hunched body and a fan of three long tails knotted off to one side — the
// tails are the tell that it is a nest, not a fighter. `mid`, reads clearly
// bigger than the roster. Brown fur (b/B/r), the one amber note on the crown
// as a catch of the cellar's single bulb. It does not chase; it squats and
// spawns rats. Authored facing the camera, a touch left — it never turns.
export const rattenkoenig = single('der-rattenkoenig', [
  '................K.....K.....K......................',
  '...............KGK...KGK...KGK.....................',
  '..............KGGGK.KGGGK.KGGGK....................',
  '.............KGGAGGKGGAGGKGGAGGK...................',
  '......bb.....KGGGGGGGGGGGGGGGGGGK.....bb...........',
  '.....bBBb...KKGGGGGGGGGGGGGGGGGGKK...bBBb..........',
  '.....bBrBb.KrBBrrrrrrrrrrrrrrrrBBrK.bBrBb.........',
  '.....bBBBBbrBBBBBBBBBBBBBBBBBBBBBBrKbBBBBBb........',
  '....bBBBBBBrBBBBBBBBBBBBBBBBBBBBBBBBrBBBBBBb.......',
  '...bBBBBBBBrBBBBBBBBBBBBBBBBBBBBBBBBBrBBBBBBBb.....',
  '..bBBBBBBBrBBBBBBBBBBBBBBBBBBBBBBBBBBrBBBBBBBBb....',
  '..bBBBBBBrBBBBBBBBBBBBBBBBBBBBBBBBBBBBrBBBBBBBBb...',
  '.bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBb...',
  '.bBBBBBBBBBBBBKKKKBBBBBBBBBBKKKKBBBBBBBBBBBBBBBb...',
  '.bBBBBBBBBBBKKxWWKBBBBBBBBBKWWxKKBBBBBBBBBBBBBBb...',
  'bBBBBBBBBBBBBKxxxKBBBBBBBBBBKxxxKBBBBBBBBBBBBBBBb..',
  'bBBBBBBBBBBBBBKKKBBBBBBBBBBBBKKKBBBBBBBBBBBBBBBBb..',
  'bBBBBBBBBBBBBBBBBBBBrbbrBBBBBBBBBBBBBBBBBBBBBBBBb..',
  'bBBBBBBBBBBBBBBBBbrbbbbrbBBBBBBBBBBBBBBBBBBBBBBBb..',
  '.bBBBBBBBBBBBBBBbrxWWWWxrbBBBBBBBBBBBBBBBBBBBBBb...',
  '.bBBBBBBBBBBBBBBBrxWWWWxrBBBBBBBBBBBBBBBBBBBBBBb...',
  '..bBBBBBBBBBBBBBBBrxWWxrBBBBBBBBBBBBBBBBBBBBBBb....',
  '..bBBBBBBBBBBBBBBBBBrrBBBBBBBBBBBBBBBBBBBBBBBb.....',
  '...bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBb......',
  '....bbBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBbb.......',
  '.....bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBb.........',
  '....bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBb........',
  '...bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBbrrrb...',
  '..bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBbrbbbrb..',
  '..bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBb....brrrb',
  '..bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBbrrrb..bbb',
  '..bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBbrbbbrb....',
  '..bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBb...brrrb..',
  '...bBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBbrrrb.bbb..',
  '...bbBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBbrbbrb.....',
  '....KbbbbBBBBBBBBBBBBBBBBBBBBBBBBBBBbbbbKbrrrb.....',
  '...KKKKKKbbbbbBBBBBBBBBBBBBBBBbbbbbKKKKKKbbbb......',
  '...KbbbbK...KbbbbbbbbbbbbbbbbbbbbK.KbbbbK.........',
  '...KKKKKK...KKKKKKKKKKKKKKKKKKKKKK.KKKKKK.........',
]);

/** The single-frame sprites `build-floor1-minibosses` writes, keyed by enemy id. */
export const MINIBOSSES = {
  'der-rattenkoenig': rattenkoenig,
  'die-zapfhahn-orgel': zapfhahnOrgel,
};

export const MINIBOSS_BUCKET = 'floor-1-cellar';
