import { encodePng } from '../png.mjs';
import { legalPixelColorsFor } from '../palette.mjs';

/**
 * Der Wald's roster, as text grids — one creature at a time, as each of
 * #405-#411 lands its sign-off. The same contract as `floor2-roster.mjs`:
 * the committed PNGs are exactly what this file encodes, and
 * `tests/art/floor3-roster-authoring.test.ts` holds them to it byte for byte.
 *
 * Unlike Floor 2's grids these are written with their outline ink in place
 * (`K`) rather than auto-inked: the Fliegenpilz was signed off as a rendered
 * candidate (option B of three, shown standing in a wald room next to Alois),
 * and the grid below is that candidate pixel for pixel — re-inking it with a
 * different rule would quietly change the art that was picked.
 *
 * Palette is Floor 3's five (deep greens, the sickly luminous green, the
 * fungus violet) plus the neutrals and their ramps — the Zecke's engorged
 * abdomen is that fungus violet — there is no red on this
 * floor, which is why a fly agaric here glows green rather than wearing the
 * red cap it would anywhere else.
 */

// ------------------------------------------------------------------ palette
export const WALD = {
  '.': null,
  K: 0x000000, // outline ink
  G: 0x9fe066, // luminous fungus green — the cap
  H: 0xb7e88c, // cap, lit (top-left)
  h: 0x70c327, // cap, shade (bottom-right)
  D: 0x234d2b, // deep green — the cap's spots
  t: 0xa1a1a1, // gills, the underside band
  S: 0xd1d1d1, // stalk
  s: 0xb8b8b8, // stalk, shade side
  w: 0xe8e8e8, // stalk, lit side
  a: 0x1c1a1f, // tick: darkest violet-grey — the shield's shadow
  b: 0x332f38, // tick: head and shield
  c: 0x494451, // tick: shield, lit
  v: 0x962bb3, // tick: engorged abdomen
  V: 0xb13bd0, // tick: abdomen, lit
  p: 0xcf85e2, // tick: abdomen highlight
  m: 0x737373, // rabbit: grey fur
  l: 0x8a8a8a, // rabbit: fur, lit (the backs of the ears)
  q: 0xddaaeb, // rabbit: inner ear and nose
  1: 0x2c4d2a, // trout: dark olive back
  2: 0x3d6b3a, // trout: olive
  3: 0x4e894a, // trout: flank
  4: 0x5fa65b, // trout: flank, lit
  5: 0xcfefb2, // trout: belly
  6: 0x1b2f1a, // trout: dark spots
  7: 0x5c5c5c, // boar: coat
};

{
  const legal = legalPixelColorsFor('floor-3-wald');
  for (const [key, colour] of Object.entries(WALD)) {
    if (colour !== null && !legal.has(colour)) {
      throw new Error(
        `floor3-roster key "${key}" is #${colour.toString(16).padStart(6, '0')}, ` +
          `not legal for floor-3-wald — see tools/art/palette.mjs`,
      );
    }
  }
}

/** A whole sprite from one full-canvas text grid, outline included. */
function single(name, rows) {
  const width = Math.max(...rows.map((row) => row.length));
  const px = rows.map((row, y) =>
    Array.from(row.padEnd(width, '.'), (ch) => {
      if (!(ch in WALD)) throw new Error(`${name}: row ${String(y)} has unknown key "${ch}"`);
      return WALD[ch];
    }),
  );
  return { name, width, height: rows.length, px };
}

// ======================================================== FLIEGENPILZ
// A squat fly agaric (#405): a wide luminous-green cap with deep-green spots
// over a short pale stalk, no face — it reads as part of the forest floor
// until it bloats. 28 wide against a normal-size collider's 28.
export const fliegenpilz = single('fliegenpilz', [
  '............................',
  '..........KKKKKKKK..........',
  '.......KKKHHGGDGGGKKK.......',
  '.....KKHDHHGGDDDGGGGGKK.....',
  '....KHHDDDGGGGDGGGGGDGGK....',
  '...KHHHHDGGGGGGGGGGDDDGGK...',
  '..KHHHGGGGGGGGGGGGGGDGGGGK..',
  '.KHHHGGGGGGDGGGGGDGGGGGGhhK.',
  '.KHGGDGGGGGGGGGGGGGGGGGhhhK.',
  '.KGGGGGGGGGGGGGGGGGGGhhDhhK.',
  '.KGGGGGGGGGGGGGGGGGhhhhhhhK.',
  '..KtttttttttttttttttttttttK.',
  '...KKKKKKKwSSSSSSsKKKKKKKK..',
  '.........KwSSSSSSsK.........',
  '.........KwSSSSSSsK.........',
  '.........KwSSSSSSsK.........',
  '.........KwSSSSSSsK.........',
  '........KwwSSSSSSssK........',
  '........KwwSSSSSSssK........',
  '.........KKKKKKKKKK.........',
]);

// ============================================================== ZECKE
// An engorged tick (#406): a swollen violet abdomen behind a small dark head,
// legs splayed. The design is option B of three; the size is the medium of
// three micro sizes, both signed off by Tilo. Shown standing in a wald room
// and latched on Alois's hat, where it takes the place of part of the crown.
// 10 wide against a micro collider's 8; the eight empty rows on top are only
// there because a character canvas is at least 16 tall. It stands on its
// bottom row like the rest.
export const zecke = single('zecke', [
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '....KK....',
  '...KbbK...',
  'K.KKccKK.K',
  '.KKcpVvKK.',
  'K.KVVvvK.K',
  '..KVvvvbK.',
  '...KvvbK..',
  '....KKK...',
]);

// ========================================================== KANINCHEN
// A grey wild rabbit (#407), sitting side-on and facing left: tall pink-lined
// ears, a pale belly and chin, a white scut at the back. Option A of three,
// signed off by Tilo, shown standing in a wald room next to Alois. 15x16
// against a mini collider's 16.
export const kaninchen = single('kaninchen', [
  '....KK.KK......',
  '...KlmKlmK.....',
  '...KlqKlqK.....',
  '...KlqKlqK.....',
  '...KlmKlmK.....',
  '..KKmmmmmK.....',
  '.KmmmmmmmmK....',
  'KmKmmmmmmmmK...',
  'KqmmmmmmmmmmK..',
  'KSmmmmmmmmmmmK.',
  '.KSmmmmmmmmmmKK',
  '..KSSmmmmmmmmwK',
  '..KSSSmmmmmmmwK',
  '...KSSSmmmmmmK.',
  '...KmKKKKKKmK..',
  '...KK.....KK...',
]);

// ======================================================== BACHFORELLE
// A brown trout (#408), drawn twice. Under the water it swims as its whole
// side-on figure, facing left (`bachforelle-shadow`: the renderer darkens and
// flattens it, and mirrors it to the way it swims). When it surfaces to fire,
// only its head half is out: the front of that same figure turned head-up,
// with a foam collar at the waterline (`bachforelle`). Option A of three,
// reworked to Tilo's direction and signed off by him in a wald stream next to
// Alois. Violet spots stand in for a brown trout's red ones: no red on this
// floor.
export const bachforelle = single('bachforelle', [
  '......K.......',
  '.....K3K......',
  '....K53KK.....',
  '...K553KwK....',
  '...K5443KK....',
  '..K5543322K...',
  '..K554V322K...',
  '..K55433321K..',
  '.Kl55433621K..',
  '..K55443311K..',
  '..K554362161K.',
  '..K554332111K.',
  '..K55V332111K.',
  '.KwwSwwSwwwSK.',
  'KwSwwKKKKwwSwK',
  '.KKKK....KKKK.',
]);

export const bachforelleShadow = single('bachforelle-shadow', [
  '..........................',
  '..........................',
  '..........................',
  '..........................',
  '..........KKKKK...........',
  '.......KKK11111KK.......KK',
  '.....KK1116116111KK....K1K',
  '...KK22221111161111K..K11K',
  '..KwK22363222222V221KK111K',
  '.KKK33333363336333333211K.',
  'K33343V33433334336333321K.',
  '.K5544444444V44444444311K.',
  '..K555555555555555543K.K1K',
  '...KK555555555555KKKK...KK',
  '.....KKKlKKKKKlKK.........',
  '........K.....K...........',
]);

// =============================================================== BOAR
// A wild boar (#409), side-on and facing left: a tank of a body — a high
// shoulder hump under a bristly dark mane, a heavy wedge head, thick legs on
// dark hooves — and the tusks as its signature, two pale crescents curving up
// from the jaw past a deliberately muted snout. Grey (option A's coat) after
// three rounds with Tilo: first bulkier, then tusks over snout. 49x31 on a
// mid collider. No brown on this floor's palette, so the coat is grey.
export const boar = single('boar', [
  '...................K.K.K.K.......................',
  '.................KKaKaKaKaKK.....................',
  '...............KKaaaaaaaaaKaKK...................',
  '..............KaaaaaaaaaaaaaKaK..................',
  '.............Kmaaa77777777aaaaKK.K...............',
  '............Km7a777777777777aaaaKaKK.............',
  '...........Km77777777777777777aaaaaaKKK..........',
  '...........Kc777777777777777777aaaaaammKKK.......',
  '.........KKccc777777777777777777777aa77mmmKK.....',
  '.......KKmmccc7777777777777777777777777777mmK....',
  '.....KKmm77ccc777777777777777777777777777777mK..K',
  '....Kmm77777777777777777777777777777777777777mKKc',
  '...Km77777777777777777777777777777777777777777KcK',
  '...K7777777wK777777777777777777777777777777777mcK',
  '.KKm7777777777777777777777777777777777777777777K.',
  'Kcccc7777w7777777777777777777777777777777777777K.',
  'Kcccc777ws7777777777777777777777777777777777777K.',
  'KcKcc77ww77777777777777777777777777777777777777K.',
  'Kcccc7wws777s777777777777777777777777777777777cK.',
  'KcKccwws777s7777777777777777777777777777777777K..',
  'Kccccwws777s777777777777777777777777777777777cK..',
  'Kccccwws77sccccccccccccccccccccccccccccccccccK...',
  '.KKK77wws7sccccccccccccccccccccccccccccccccccK...',
  '....KKKww77scccccccccccccccccccccccccccccccccK...',
  '.......KK7ccccccccKcccccKccccccccccccccKcccccK...',
  '.........KKKKcccccKcccccKKKKKKKKKKcccccKcccccK...',
  '............KcccccKcccccK........KcccccKcccccK...',
  '............KcccccKcccccK........KcccccKcccccK...',
  '............KcccccKcccccK........KcccccKcccccK...',
  '............KaaaaaKaaaaaK........KaaaaaKaaaaaK...',
  '.............KKKKK.KKKKK..........KKKKK.KKKKK....',
]);

// ====================================================== WALK AND HOP
// The bare minimum of motion for the two side-on walkers, so they stop
// gliding: frame 0 of each strip is the signed-off sprite above, untouched,
// and the other frames re-pose only the legs.

/** The Boar's four legs, as the outline columns either side of each (front pair, back pair). */
const BOAR_LEGS = [
  [12, 18],
  [18, 24],
  [33, 39],
  [39, 45],
];
/** The rows the Boar's legs are redrawn over: the shins down to the ground row. */
const BOAR_LEG_TOP = 26;
const BOAR_GROUND = 30;
/**
 * How many rows a lifted hoof clears the ground by. Two, signed off by Tilo
 * over one: a single row all but vanishes at the in-room scale.
 */
const BOAR_LIFT = 2;

/**
 * The Boar with the legs in `raised` (indices into `BOAR_LEGS`) lifted
 * `BOAR_LIFT` rows off the ground — a diagonal pair at a time is a trot. A
 * planted leg is shin, hoof on row 29, sole on row 30; a lifted one is the
 * same that much higher. A shared outline column is inked as far down as either leg beside
 * it still reaches.
 */
function boarStep(name, raised) {
  const rows = boar.px.map((row) => row.slice());
  const hoofRow = (leg) => BOAR_GROUND - 1 - (raised.includes(leg) ? BOAR_LIFT : 0);
  for (let y = BOAR_LEG_TOP; y <= BOAR_GROUND; y++) {
    const row = rows[y];
    // Clear the legs' span first: everything from the first leg's left edge
    // to the last one's right edge on these rows is legs or gap.
    for (let x = BOAR_LEGS[0][0]; x <= BOAR_LEGS[3][1]; x++) {
      row[x] = WALD['.'];
    }
    BOAR_LEGS.forEach(([left, right], leg) => {
      const hoof = hoofRow(leg);
      for (let x = left + 1; x < right; x++) {
        row[x] = y < hoof ? WALD.c : y === hoof ? WALD.a : y === hoof + 1 ? WALD.K : WALD['.'];
      }
    });
    BOAR_LEGS.forEach(([left, right], leg) => {
      for (const x of [left, right]) {
        if (y <= hoofRow(leg)) {
          row[x] = WALD.K;
        }
      }
    });
  }
  return { name, width: boar.width, height: boar.height, px: rows };
}

export const boarStepA = boarStep('boar-step-a', [0, 3]);
export const boarStepB = boarStep('boar-step-b', [1, 2]);

/**
 * The Kaninchen mid-hop: front paws reaching forward, hind feet kicked back —
 * the sitting sprite's own body, only the bottom two rows re-posed.
 */
export const kaninchenHop = single('kaninchen-hop', [
  '....KK.KK......',
  '...KlmKlmK.....',
  '...KlqKlqK.....',
  '...KlqKlqK.....',
  '...KlmKlmK.....',
  '..KKmmmmmK.....',
  '.KmmmmmmmmK....',
  'KmKmmmmmmmmK...',
  'KqmmmmmmmmmmK..',
  'KSmmmmmmmmmmmK.',
  '.KSmmmmmmmmmmKK',
  '..KSSmmmmmmmmwK',
  '..KSSSmmmmmmmwK',
  '...KSSSmmmmmmK.',
  '..KmKKKKKKKmmK.',
  '.KK........KKK.',
]);

/**
 * The animated bodies: a horizontal strip per creature plus its
 * `.anim.json` sidecar (`assets/sprites/README.md`). No `telegraph` clip on
 * either, on purpose — the renderer's wind-up crouch (#429) is their
 * telegraph, and it only runs for a body whose strip does not author one.
 */
// ------------------------------------------------- SPECHT, IN FLIGHT
// Option B of three, signed off by Tilo: a side view that flaps (wings up,
// level, down), mirrored for the other way, plus a front and a back view for
// flying toward and away from the camera, and a head-down dive. 20x16, the
// landed sprite's canvas. Same colours as the perched bird.
const spechtFlySideUp = single('specht-fly-side-0', [
  '..........KK........',
  '.........KhhK.......',
  '........KhGhK.......',
  '........KhhhK.......',
  '.......KhGhK........',
  '....KKKKhhhK........',
  '...KVVVhhGhK........',
  'KKKV222hhhhKKKKK....',
  'tt2a2222hh2222DDKK..',
  'KK222SS22222222DDDK.',
  '..K2SSSSS22222KKKDDK',
  '...KSSSSS22KKK...KK.',
  '....KKKKKKK.........',
  '....................',
  '....................',
  '....................',
]);

const spechtFlySideMid = single('specht-fly-side-1', [
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....KKK.............',
  '...KVVVKKKKKKKKK....',
  'KKKV222hhhhhhhhhK...',
  'tt2a22hGhGhGhhhhKK..',
  'KK222SShhhhhh22DDDK.',
  '..K2SSSSS22222KKKDDK',
  '...KSSSSS22KKK...KK.',
  '....KKKKKKK.........',
  '....................',
  '....................',
  '....................',
]);

const spechtFlySideDown = single('specht-fly-side-2', [
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....KKK.............',
  '...KVVVK............',
  'KKKV2222KKKKKKKK....',
  'tt2a2222222222DDKK..',
  'KK222SS22222222DDDK.',
  '..K2SSShhhh222KKKDDK',
  '...KSSShGhhKKK...KK.',
  '....KKKKhhhK........',
  '.......KhGhK........',
  '........KhhK........',
  '.........KK.........',
]);

// Toward the camera: crown and eyes on top, pale breast, wings spread.
const spechtFlyFrontUp = single('specht-fly-front-0', [
  '....................',
  '....................',
  '....................',
  '....................',
  'KK.......KK.......KK',
  'hhK.....KVVK.....Khh',
  'hGhK...KV22VK...KhGh',
  'KhhhK..Ka22aK..KhhhK',
  '.KhGhKK.KttK.KKhGhK.',
  '..KhhhhK2SS2KhhhhK..',
  '...KKKKK2SS2KKKKK...',
  '........KSSK........',
  '........KDDK........',
  '.........KK.........',
  '....................',
  '....................',
]);

const spechtFlyFrontMid = single('specht-fly-front-1', [
  '....................',
  '....................',
  '....................',
  '....................',
  '.........KK.........',
  '........KVVK........',
  '.......KV22VK.......',
  '.......Ka22aK.......',
  'KKKKKKK.KttK.KKKKKKK',
  'hhhhhhhK2SS2Khhhhhhh',
  'KhGhGhhK2SS2KhhGhGhK',
  '.KKKKKK.KSSK.KKKKKK.',
  '........KDDK........',
  '.........KK.........',
  '....................',
  '....................',
]);

const spechtFlyFrontDown = single('specht-fly-front-2', [
  '....................',
  '....................',
  '....................',
  '....................',
  '.........KK.........',
  '........KVVK........',
  '.......KV22VK.......',
  '.......Ka22aK.......',
  '...KKKK.KttK.KKKK...',
  '..KhhhhK2SS2KhhhhK..',
  '.KhGhKKK2SS2KKKhGhK.',
  'KhhhK...KSSK...KhhhK',
  'hGhK....KDDK....KhGh',
  'KKK......KK......KKK',
  '....................',
  '....................',
]);

// Away from the camera: crown, olive back, deep-green tail.
const spechtFlyBackUp = single('specht-fly-back-0', [
  '....................',
  '....................',
  '....................',
  '....................',
  'KK.......KK.......KK',
  'hhK.....KVVK.....Khh',
  'hGhK...KVVVVK...KhGh',
  'KhhhK..K2222K..KhhhK',
  '.KhGhKKK2222KKKhGhK.',
  '..KhhhhK2222KhhhhK..',
  '...KKKKK2222KKKKK...',
  '.......KDDDDK.......',
  '........KDDK........',
  '.........KK.........',
  '....................',
  '....................',
]);

const spechtFlyBackMid = single('specht-fly-back-1', [
  '....................',
  '....................',
  '....................',
  '....................',
  '.........KK.........',
  '........KVVK........',
  '.......KVVVVK.......',
  '.......K2222K.......',
  'KKKKKKKK2222KKKKKKKK',
  'hhhhhhhK2222Khhhhhhh',
  'KhGhGhhK2222KhhGhGhK',
  '.KKKKKKKDDDDKKKKKKK.',
  '........KDDK........',
  '.........KK.........',
  '....................',
  '....................',
]);

const spechtFlyBackDown = single('specht-fly-back-2', [
  '....................',
  '....................',
  '....................',
  '....................',
  '.........KK.........',
  '........KVVK........',
  '.......KVVVVK.......',
  '.......K2222K.......',
  '...KKKKK2222KKKKK...',
  '..KhhhhK2222KhhhhK..',
  '.KhGhKKK2222KKKhGhK.',
  'KhhhK..KDDDDK..KhhhK',
  'hGhK....KDDK....KhGh',
  'KKK......KK......KKK',
  '....................',
  '....................',
]);

// The dive: head down at the floor, wings folded back along the body.
const spechtDive = single('specht-dive', [
  '...............KK...',
  '..............KDDK..',
  '.............KDDDK..',
  '............K22DK...',
  '...........Khh22K...',
  '..........KhGh2SK...',
  '.........Khhh2SSK...',
  '........KhGh22SSK...',
  '......KKhhh22SSK....',
  '.....KVV2222SSK.....',
  '....KV22a22SSK......',
  '.....K2222SSK.......',
  '......Kt22KK........',
  '.......KtK..........',
  '........K...........',
  '....................',
]);

const SPECHT_FLAP = {
  frames: 3,
  frameDurationMs: 90,
  loop: true,
  clips: { idle: { frames: [0, 1, 2, 1], frameDurationMs: 90, mode: 'loop' } },
};

export const STRIPS = {
  boar: {
    frames: [boar, boarStepA, boarStepB],
    anim: {
      frames: 3,
      frameDurationMs: 120,
      loop: true,
      clips: {
        idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
        // Trot: one diagonal pair up, down, the other pair up, down. Quick
        // enough that the charge reads as legs going flat out.
        move: { frames: [1, 0, 2, 0], frameDurationMs: 90, mode: 'loop' },
        hurt: { frames: [0], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
      },
    },
  },
  kaninchen: {
    frames: [kaninchen, kaninchenHop],
    anim: {
      frames: 2,
      frameDurationMs: 120,
      loop: true,
      clips: {
        idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
        // Stretched out for as long as the hop is moving it, sat back down
        // the moment it lands.
        move: { frames: [1], frameDurationMs: 120, mode: 'loop' },
        hurt: { frames: [0], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
      },
    },
  },
  // Wing-beat: up, level, down, level. One `idle` clip, since what the bird
  // is doing picks the strip (`render/entities.ts`), not the animator.
  'specht-fly-side': {
    frames: [spechtFlySideUp, spechtFlySideMid, spechtFlySideDown],
    anim: SPECHT_FLAP,
  },
  'specht-fly-front': {
    frames: [spechtFlyFrontUp, spechtFlyFrontMid, spechtFlyFrontDown],
    anim: SPECHT_FLAP,
  },
  'specht-fly-back': {
    frames: [spechtFlyBackUp, spechtFlyBackMid, spechtFlyBackDown],
    anim: SPECHT_FLAP,
  },
};

// ======================================================== BORKENKÄFER
// A bark-beetle swarm (#410): a heaped mound of glossy grey beetles, one body
// on the floor, with sawdust at its foot and a couple of stragglers at the
// edges. Option B of three, signed off by Tilo, shown in a wald room next to
// Alois sitting on the plank it eats. 32x18 against a normal collider's 28 —
// a swarm is wider than it is tall.
export const borkenkaefer = single('borkenkaefer', [
  '................................',
  '.............KKKKK..............',
  '............KmSSmmK.............',
  '............KmmmmKK.............',
  '............KcccccKK............',
  '.........KKKKKKKKKmmKKKKK.......',
  '........KmSSmKKKmKmKmSSmmK......',
  '........KmmmmKKccccKmmmmKK......',
  '........KcccccKKKKKKcccccK......',
  '......KKKKKKKKKKKKmKKKKKKKKK....',
  '.....KmSSKmKmKSmmKmmKmKmKSmmK...',
  '.....KmmmmKKmmmmKKccccKmmmmKK...',
  '...KKKcccccKcccccKKKKKKcccccKKK.',
  '..KmSSKKKKKKKKKKKSKmKKKKKKKKSmmK',
  '..KmmmKKKmKSKmKmKmmKKmSKmKmKmmKK',
  '..KcccccKmmmmKKcccccKmmmmKcccccK',
  '...KKKKKKcccccKKKKKKKcccccKKKKK.',
  '...K.KlKlKKKKKtKtKtKlKKKKKK.K.K.',
]);

// ============================================================= SPECHT
// A green woodpecker (#411), clinging upright to the wall and facing left:
// olive head and back, pale belly, barred luminous-green wing, the crown in
// the floor's fungus violet where a real one is red (no red on this floor).
// Option A of three, signed off by Tilo with its size, shown perched on a
// wald room's wall next to Alois. 16x20 against a mini collider's 16.
export const specht = single('specht', [
  '.......KKK......',
  '......KVVVK.....',
  '.....KVVV22K....',
  '....K2222222K...',
  '.tttt2a22222K...',
  '...tt2222222K...',
  '....Ka2222hhK...',
  '.....KS222hhhK..',
  '....KSSS22hGhK..',
  '....KSSS22hhhK..',
  '....KSSS22hGhK..',
  '....KSSS22hhhK..',
  '....KSSS22hGhK..',
  '.....KSS22hhhK..',
  '.....KSS222hhK..',
  '.....tKS222hK...',
  '.....ttK22DDK...',
  '........KDDDK...',
  '.........KDDK...',
  '..........KDK...',
]);

// Its beak stuck in the plank after a dive (#411's hit window): head down,
// wings up, chips at the beak — drawn while it is in a `land` state.
export const spechtLanded = single('specht-landed', [
  '...........K....K...',
  '..........KhK..KhK..',
  '.........KhhK.KhhK..',
  '........KhGhKKhGhK..',
  '........KhhhhKhhhK..',
  '.......KKKhhhhhhKKK.',
  '.....KK2222222222DDK',
  '....KVV2222SSSS222DD',
  '...KV22222SSSSSS22KD',
  '...K22a2222SSSS22K.K',
  '...K22222K22222KK...',
  '....K222K.KKKKK.....',
  '.....KtK............',
  '......t.............',
  '.....ttt............',
  '....t.t..t..........',
]);

// ================================================== WALDRADLER / WALDRADL
// PLACEHOLDERS (#412, #413). The boss designs are not signed off yet: the key
// art is still being picked (`CLAUDE.md`, "New pixel art needs sign-off"), and
// the real sprites are rigs cut from it (`docs/BOSS_SPRITES.md`). These two are
// plain pictograms — a rider on a bike, a wheel — drawn from code so the fight
// is playable and the art-coverage tests have something to hold. They are
// meant to be deleted, not iterated on.

/** A blank character grid, `w` x `h`, for the little drawing helpers below. */
function canvas(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
}

function plot(g, x, y, ch) {
  const row = g[Math.round(y)];
  if (row !== undefined && Math.round(x) >= 0 && Math.round(x) < row.length) {
    row[Math.round(x)] = ch;
  }
}

function disc(g, cx, cy, r, ch) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) plot(g, x, y, ch);
    }
  }
}

function ring(g, cx, cy, r, thickness, ch) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r && d > r - thickness) plot(g, x, y, ch);
    }
  }
}

function line(g, x0, y0, x1, y1, ch, thickness = 1) {
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2);
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (let dy = 0; dy < thickness; dy++) {
      for (let dx = 0; dx < thickness; dx++) plot(g, x + dx, y + dy, ch);
    }
  }
}

/** Nearest-neighbour fit of a drawing onto a smaller `w` x `h` grid. */
function fit(g, w, h) {
  return Array.from({ length: h }, (_, y) =>
    Array.from(
      { length: w },
      (_, x) => g[Math.floor((y * g.length) / h)][Math.floor((x * g[0].length) / w)],
    ),
  );
}

/** Ink round everything painted: the outline the signed-off sprites carry in their grids. */
function inked(g) {
  const out = g.map((row) => [...row]);
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[y].length; x++) {
      if (g[y][x] !== '.') continue;
      const near = [g[y - 1]?.[x], g[y + 1]?.[x], g[y]?.[x - 1], g[y]?.[x + 1]];
      if (near.some((n) => n !== undefined && n !== '.' && n !== 'K')) out[y][x] = 'K';
    }
  }
  return out.map((row) => row.join(''));
}

// 76x60, facing left like all character art: a rider in luminous green lycra
// crouched over a bike, the front wheel on the left.
const waldradler = single(
  'waldradler',
  (() => {
    const g = canvas(76, 60);
    const frontX = 17;
    const rearX = 59;
    const wheelY = 43;
    for (const cx of [frontX, rearX]) {
      disc(g, cx, wheelY, 15, 'b');
      ring(g, cx, wheelY, 15, 3, 'a');
      for (const a of [0, 1, 2, 3]) {
        const t = (a * Math.PI) / 4;
        line(
          g,
          cx - Math.cos(t) * 11,
          wheelY - Math.sin(t) * 11,
          cx + Math.cos(t) * 11,
          wheelY + Math.sin(t) * 11,
          'S',
        );
      }
      disc(g, cx, wheelY, 2, 'w');
    }
    // Frame and fork.
    line(g, frontX, wheelY, 30, 28, 'c', 2);
    line(g, 30, 28, 48, 30, 'c', 2);
    line(g, 48, 30, rearX, wheelY, 'c', 2);
    line(g, 30, 28, 44, 42, 'c', 2);
    line(g, 44, 42, rearX, wheelY, 'c', 2);
    line(g, 26, 22, 31, 29, 'c', 2);
    // Rider: hips over the saddle, torso leaning on the bars, arms, head.
    line(g, 48, 30, 38, 17, 'G', 7);
    line(g, 40, 17, 28, 19, 'H', 3);
    line(g, 28, 19, 25, 24, 'H', 3);
    line(g, 48, 32, 44, 43, 'v', 4);
    disc(g, 30, 13, 6, 'w');
    disc(g, 30, 10, 6, 'V');
    line(g, 25, 14, 31, 14, 'a', 2);
    // Drawn on a roomier grid, then fitted to the largest character canvas
    // (`tools/art/spec.mjs`: 64x48) — a boss strip is the real art's job.
    return inked(fit(g, 60, 48));
  })(),
);

// 44x44: one wheel standing upright with a scrap of neon lycra caught in it.
const waldradl = single(
  'waldradl',
  (() => {
    const g = canvas(44, 44);
    disc(g, 22, 22, 20, 'b');
    ring(g, 22, 22, 20, 4, 'a');
    for (const a of [0, 1, 2, 3, 4, 5]) {
      const t = (a * Math.PI) / 6;
      line(
        g,
        22 - Math.cos(t) * 16,
        22 - Math.sin(t) * 16,
        22 + Math.cos(t) * 16,
        22 + Math.sin(t) * 16,
        'S',
      );
    }
    disc(g, 22, 22, 3, 'G');
    line(g, 22, 22, 34, 12, 'H', 3);
    line(g, 22, 22, 12, 32, 'V', 2);
    return inked(g);
  })(),
);

export const ROSTER = {
  fliegenpilz,
  zecke,
  bachforelle,
  'bachforelle-shadow': bachforelleShadow,
  borkenkaefer,
  specht,
  'specht-landed': spechtLanded,
  'specht-dive': spechtDive,
  waldradler,
  waldradl,
};

/** Every sprite is authored against Floor 3's palette. */
export const ROSTER_BUCKET = 'floor-3-wald';

/** Throws if any painted pixel is not legal for floor-3-wald. */
export function assertOnPalette(_bucket, framesIn) {
  const legal = legalPixelColorsFor('floor-3-wald');
  for (const f of framesIn) {
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const c = f.px[y][x];
        if (c !== null && !legal.has(c)) {
          throw new Error(
            `${f.name}: pixel ${x},${y} is #${c.toString(16).padStart(6, '0')}, not legal for floor-3-wald`,
          );
        }
      }
    }
  }
}

function putFrame(pixels, stripWidth, f, ox) {
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const c = f.px[y][x];
      if (c === null) continue;
      const at = (y * stripWidth + ox + x) * 4;
      pixels[at] = (c >> 16) & 0xff;
      pixels[at + 1] = (c >> 8) & 0xff;
      pixels[at + 2] = c & 0xff;
      pixels[at + 3] = 0xff;
    }
  }
}

/** One frame as PNG bytes. */
export function encodeSingle(f) {
  const pixels = Buffer.alloc(f.width * f.height * 4);
  putFrame(pixels, f.width, f, 0);
  return encodePng({ width: f.width, height: f.height, pixels });
}

/** A horizontal frame strip as PNG bytes (`assets/sprites/README.md` layout). */
export function encodeStrip(name, frames) {
  const first = frames[0];
  if (first === undefined) throw new Error(`${name}: no frames`);
  for (const f of frames) {
    if (f.width !== first.width || f.height !== first.height) {
      throw new Error(
        `${name}: frame ${f.name} is not ${String(first.width)}x${String(first.height)}`,
      );
    }
  }
  const width = first.width * frames.length;
  const pixels = Buffer.alloc(width * first.height * 4);
  frames.forEach((f, i) => putFrame(pixels, width, f, i * first.width));
  return encodePng({ width, height: first.height, pixels });
}

/** A strip's sidecar, as the bytes committed next to it. */
export function encodeAnim(anim) {
  return `${JSON.stringify(anim, null, 2)}\n`;
}
