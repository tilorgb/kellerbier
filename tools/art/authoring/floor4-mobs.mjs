import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canvas, ellipse, fillRect, line, outline, poly, px, toRows } from './draw.mjs';
import { frameFromRows, readFrames, shifted, viewAnim } from './views-kit.mjs';

/**
 * Floor 4's pitched mobs (#40): the Rescue dog, the Skier, the Summit cross, the
 * Snow cannon and the Mountain hare — signed off as block-art options by Tilo
 * (dog A, skier B, cross C, snow gun A, hare A), drawn here in the house style:
 * bold ink outline, flat tones, Floor 4's palette. Same contract as
 * `floor4-roster.mjs`, whose `ALPEN` key table and encoders these share: the
 * committed PNGs are what this file produces, held to it byte for byte by
 * `tests/art/floor4-roster-authoring.test.ts`.
 *
 * Every walker ships its three heading views (`-side`, `-south`, `-north`) and
 * the clips the animator reads (`idle`, `move`, `telegraph`); the two rooted
 * bodies ship idle and a telegraph pose.
 */

/** Takes `ALPEN` as an argument: `floor4-roster.mjs` imports this module, so it cannot be imported back. */
export function buildMobs(ALPEN) {
  const finish = (name, c) => {
    outline(c);
    return frameFromRows(name, ALPEN, toRows(c), { ink: false });
  };

  // ============================================================== RESCUE DOG
  /** Coat A, the Bernese-style dog: near-black, tan cheeks and brows, a white chest, a pink rescue vest. */
  const DOG = {
    coat: 'c',
    dark: 'b',
    belly: 'b',
    chest: 'W',
    paw: '1',
    muzzle: '2',
    brow: '1',
    tip: 'W',
    vest: 'P',
  };

  /** Side-on, facing left, 24×18: standing, a trot (`stride` swaps the legs), or sitting to bark. */
  function dogSide(name, { stride = 0, sit = false } = {}) {
    const k = DOG;
    const c = canvas(24, 18);
    if (sit) {
      // Sat up on its haunches: tail along the ground, hind paw stuck forward.
      line(c, 19, 16, 23, 15, k.coat, 2);
      px(c, 23, 14, k.tip);
      ellipse(c, 14, 12, 5, 4.5, k.coat);
      ellipse(c, 14, 14, 3.5, 2.5, k.belly);
      fillRect(c, 9, 16, 5, 1, k.paw);
      ellipse(c, 8, 10, 3, 4.5, k.chest);
      fillRect(c, 6, 11, 2, 6, k.coat);
      fillRect(c, 6, 16, 3, 1, k.paw);
      fillRect(c, 12, 6, 5, 4, k.vest);
      fillRect(c, 13, 7, 3, 1, 'W');
      ellipse(c, 6, 5, 3.5, 3.2, k.coat);
      ellipse(c, 3.5, 7, 2.2, 1.6, k.muzzle);
      px(c, 1, 7, 'a');
      px(c, 5, 4, 'a');
      px(c, 5, 3, k.brow);
      fillRect(c, 7, 2, 2, 4, k.dark);
      return finish(name, c);
    }
    line(c, 19, 8, 22, 4, k.coat, 2);
    px(c, 22, 3, k.coat);
    px(c, 23, 3, k.tip);
    fillRect(c, 8 + stride, 12, 2, 5, k.dark);
    fillRect(c, 17 - stride, 12, 2, 5, k.dark);
    ellipse(c, 13, 9, 8, 4.5, k.coat);
    ellipse(c, 13, 11, 6, 2.5, k.belly);
    ellipse(c, 6.5, 10, 2.5, 3, k.chest);
    fillRect(c, 6 - stride, 12, 2, 5, k.coat);
    fillRect(c, 15 + stride, 12, 2, 5, k.coat);
    fillRect(c, 6 - stride, 16, 3, 1, k.paw);
    fillRect(c, 15 + stride, 16, 3, 1, k.paw);
    fillRect(c, 11, 5, 6, 4, k.vest);
    fillRect(c, 12, 6, 4, 1, 'W');
    px(c, 13, 5, 'W');
    ellipse(c, 5, 6, 3.5, 3.2, k.coat);
    ellipse(c, 2.5, 8, 2.2, 1.6, k.muzzle);
    px(c, 0, 8, 'a');
    px(c, 4, 5, 'a');
    px(c, 4, 4, k.brow);
    fillRect(c, 6, 3, 2, 4, k.dark);
    return finish(name, c);
  }

  /** Toward the camera, 16×18: head and blaze, white chest, pink collar, front paws; `sit` squats it down. */
  function dogFront(name, { sit = false, step = 0 } = {}) {
    const k = DOG;
    const c = canvas(16, 18);
    const drop = sit ? 2 : 0;
    // body and legs
    ellipse(c, 8, 13 + drop / 2, 4.5, sit ? 3.5 : 4, k.coat);
    ellipse(c, 8, 12 + drop, 1.6, 3, k.chest);
    if (sit) {
      fillRect(c, 3, 16, 3, 1, k.paw);
      fillRect(c, 10, 16, 3, 1, k.paw);
    }
    fillRect(c, 5 - step, 14 + drop, 2, 3 - drop, k.coat);
    fillRect(c, 9 + step, 14 + drop, 2, 3 - drop, k.coat);
    fillRect(c, 5 - step, 16, 2, 1, k.paw);
    fillRect(c, 9 + step, 16, 2, 1, k.paw);
    // collar, head, ears, face
    fillRect(c, 5, 10, 6, 1, k.vest);
    ellipse(c, 8, 6, 4.2, 3.8, k.coat);
    ellipse(c, 5, 7, 1.5, 1.5, '1');
    ellipse(c, 11, 7, 1.5, 1.5, '1');
    px(c, 6, 4, k.brow);
    px(c, 10, 4, k.brow);
    px(c, 6, 5, 'a');
    px(c, 10, 5, 'a');
    fillRect(c, 7, 4, 2, 4, 'W');
    fillRect(c, 6, 8, 4, 2, k.muzzle);
    px(c, 7, 8, 'a');
    px(c, 8, 8, 'a');
    fillRect(c, 3, 3, 2, 5, k.dark);
    fillRect(c, 11, 3, 2, 5, k.dark);
    return finish(name, c);
  }

  /** From behind, 16×18: the vest with its white cross, the plumed tail up over the rump. */
  function dogBack(name, { sit = false, step = 0 } = {}) {
    const k = DOG;
    const c = canvas(16, 18);
    const drop = sit ? 2 : 0;
    ellipse(c, 8, 12 + drop / 2, 4.5, 4, k.coat);
    fillRect(c, 5, 9 + drop, 6, 4, k.vest);
    fillRect(c, 7, 9 + drop, 2, 4, 'W');
    fillRect(c, 6, 10 + drop, 4, 1, 'W');
    // tail, up and over
    fillRect(c, 7, 6 + drop, 2, 4, k.coat);
    px(c, 7, 5 + drop, k.tip);
    px(c, 8, 5 + drop, k.tip);
    // head from behind, ears down the sides
    ellipse(c, 8, 4, 3.4, 2.8, k.dark);
    fillRect(c, 4, 3, 2, 5, k.dark);
    fillRect(c, 10, 3, 2, 5, k.dark);
    // hind legs and paws
    fillRect(c, 4 - step, 14 + drop, 3, 3 - drop, k.coat);
    fillRect(c, 9 + step, 14 + drop, 3, 3 - drop, k.coat);
    fillRect(c, 4 - step, 16, 3, 1, k.paw);
    fillRect(c, 9 + step, 16, 3, 1, k.paw);
    return finish(name, c);
  }

  /** A sit pose is the `telegraph` clip: the dog sits to bark, and that is the warning. */
  const DOG_ANIM = viewAnim(4, {
    telegraph: { frames: [3], frameDurationMs: 100, mode: 'loop' },
  });
  const dogSideFrames = [
    dogSide('rescue-dog-stand'),
    dogSide('rescue-dog-trot-a', { stride: 1 }),
    dogSide('rescue-dog-trot-b', { stride: -1 }),
    dogSide('rescue-dog-sit', { sit: true }),
  ];
  const dogSouthFrames = [
    dogFront('rescue-dog-south-stand'),
    dogFront('rescue-dog-south-step-a', { step: 1 }),
    dogFront('rescue-dog-south-step-b', { step: -1 }),
    dogFront('rescue-dog-south-sit', { sit: true }),
  ];
  const dogNorthFrames = [
    dogBack('rescue-dog-north-stand'),
    dogBack('rescue-dog-north-step-a', { step: 1 }),
    dogBack('rescue-dog-north-step-b', { step: -1 }),
    dogBack('rescue-dog-north-sit', { sit: true }),
  ];

  // ================================================================== SKIER
  /** Kit B: a pink jacket, a blue helmet with white goggles, dark trousers. */
  const KIT = {
    jacket: 'P',
    jacketShade: 'Q',
    pants: 'C',
    pantsShade: 'B',
    stripe: 'W',
    helmet: 'F',
    helmetShade: 'E',
    goggle: 'W',
    boot: 'a',
    glove: 'W',
    ski: 'e',
    skiShade: 'a',
  };

  /** A puff of snow kicked up by the drift-stop. */
  function snowPuff(c, x, y) {
    ellipse(c, x, y, 3, 2, 'u');
    ellipse(c, x + 3, y - 2, 2, 1.5, 't');
    px(c, x + 5, y - 4, 'u');
  }

  /** Side-on, facing left, 32×28: carving in a deep tuck, or in the drift-stop crouch (`crouch`). */
  function skierSide(name, { crouch = false } = {}) {
    const k = KIT;
    const c = canvas(32, 28);
    const sy = 25;
    fillRect(c, 4, sy, 26, 1, k.ski);
    fillRect(c, 4, sy + 1, 26, 1, k.skiShade);
    px(c, 3, sy - 1, k.ski);
    px(c, 2, sy - 2, k.ski);
    fillRect(c, 12, 22, 5, 3, k.boot);
    fillRect(c, 18, 22, 4, 3, k.boot);
    line(c, 14, 22, 18, 17, k.pants, 3);
    line(c, 18, 17, 23, 15, k.pants, 3);
    line(c, 20, 22, 23, 18, k.pantsShade, 2);
    line(c, 23, 15, 14, 10, k.jacket, 5);
    fillRect(c, 18, 9, 5, 3, k.jacketShade);
    line(c, 22, 14, 18, 12, k.stripe, 1);
    line(c, 14, 11, 8, 14, k.jacket, 2);
    px(c, 7, 15, k.glove);
    px(c, 8, 15, k.glove);
    line(c, 7, 15, 20, 26, 'a', 1);
    ellipse(c, 10, 8, 3, 3, k.helmet);
    fillRect(c, 7, 8, 4, 2, k.goggle);
    px(c, 7, 8, 'W');
    fillRect(c, 11, 6, 2, 3, k.helmetShade);
    if (crouch) {
      snowPuff(c, 25, 24);
    }
    return finish(name, c);
  }

  /** Toward the camera, 24×28: helmet and goggles over a folded pink jacket, poles angled out, skis pointing at us. */
  function skierFront(name, { crouch = false, sway = 0 } = {}) {
    const k = KIT;
    const c = canvas(24, 28);
    // skis, tips toward the viewer
    fillRect(c, 6 + sway, 21, 3, 7, k.ski);
    fillRect(c, 15 + sway, 21, 3, 7, k.ski);
    fillRect(c, 6 + sway, 27, 3, 1, k.skiShade);
    fillRect(c, 15 + sway, 27, 3, 1, k.skiShade);
    fillRect(c, 6 + sway, 19, 3, 3, k.boot);
    fillRect(c, 15 + sway, 19, 3, 3, k.boot);
    // knees out, shins in
    line(c, 8 + sway, 19, 7 + sway, 14, k.pants, 3);
    line(c, 16 + sway, 19, 17 + sway, 14, k.pants, 3);
    // torso folded forward: the jacket's back and shoulders
    fillRect(c, 6, 8, 12, 8, k.jacket);
    fillRect(c, 6, 13, 12, 3, k.jacketShade);
    fillRect(c, 11, 8, 2, 8, k.stripe);
    // arms and poles
    line(c, 6, 10, 3, 18, k.jacket, 2);
    line(c, 18, 10, 21, 18, k.jacket, 2);
    px(c, 3, 19, k.glove);
    px(c, 20, 19, k.glove);
    line(c, 3, 19, 0, 27, 'a', 1);
    line(c, 21, 19, 23, 27, 'a', 1);
    // helmet low between the shoulders, goggles toward us
    ellipse(c, 12, 6, 4, 3.5, k.helmet);
    fillRect(c, 8, 6, 8, 2, k.goggle);
    fillRect(c, 9, 6, 2, 2, 'R');
    fillRect(c, 13, 6, 2, 2, 'R');
    if (crouch) {
      snowPuff(c, 4, 25);
      snowPuff(c, 18, 25);
    }
    return finish(name, c);
  }

  /** From behind, 24×28: the back of the helmet and the jacket's white stripe, skis running away. */
  function skierBack(name, { crouch = false, sway = 0 } = {}) {
    const k = KIT;
    const c = canvas(24, 28);
    fillRect(c, 7 + sway, 20, 3, 8, k.ski);
    fillRect(c, 14 + sway, 20, 3, 8, k.ski);
    fillRect(c, 7 + sway, 27, 3, 1, k.skiShade);
    fillRect(c, 14 + sway, 27, 3, 1, k.skiShade);
    fillRect(c, 7 + sway, 18, 3, 3, k.boot);
    fillRect(c, 14 + sway, 18, 3, 3, k.boot);
    line(c, 8 + sway, 18, 8 + sway, 13, k.pants, 3);
    line(c, 15 + sway, 18, 15 + sway, 13, k.pants, 3);
    fillRect(c, 6, 7, 12, 9, k.jacket);
    fillRect(c, 6, 12, 12, 4, k.jacketShade);
    fillRect(c, 6, 10, 12, 2, k.stripe);
    line(c, 6, 9, 3, 17, k.jacket, 2);
    line(c, 18, 9, 21, 17, k.jacket, 2);
    px(c, 3, 18, k.glove);
    px(c, 20, 18, k.glove);
    line(c, 3, 18, 1, 27, 'a', 1);
    line(c, 21, 18, 22, 27, 'a', 1);
    ellipse(c, 12, 5, 4, 3.6, k.helmet);
    fillRect(c, 12, 3, 2, 4, k.helmetShade);
    if (crouch) {
      snowPuff(c, 4, 25);
      snowPuff(c, 19, 25);
    }
    return finish(name, c);
  }

  const SKIER_ANIM = viewAnim(4, {
    // Gliding: a pixel of bob, not a walk.
    move: { frames: [1, 0, 2, 0], frameDurationMs: 140, mode: 'loop' },
    telegraph: { frames: [3], frameDurationMs: 100, mode: 'loop' },
  });
  const skierSideStand = skierSide('skier-stand');
  const skierSideFrames = [
    skierSideStand,
    shifted(skierSideStand, 0, -1, 'skier-bob-a'),
    shifted(skierSideStand, 1, 0, 'skier-bob-b'),
    skierSide('skier-crouch', { crouch: true }),
  ];
  const skierFrontStand = skierFront('skier-south-stand');
  const skierSouthFrames = [
    skierFrontStand,
    shifted(skierFrontStand, 0, -1, 'skier-south-bob-a'),
    shifted(skierFrontStand, 1, 0, 'skier-south-bob-b'),
    skierFront('skier-south-crouch', { crouch: true }),
  ];
  const skierBackStand = skierBack('skier-north-stand');
  const skierNorthFrames = [
    skierBackStand,
    shifted(skierBackStand, 0, -1, 'skier-north-bob-a'),
    shifted(skierBackStand, 1, 0, 'skier-north-bob-b'),
    skierBack('skier-north-crouch', { crouch: true }),
  ];

  // ============================================================ SUMMIT CROSS
  /**
   * Cross C: dark carved timber on a grey cairn, a slate gable over the crossing,
   * 32×46. `glow` is how far the crossbar has charged — 0 idle, 1 a pink glow
   * running out from the middle, 2 white-hot to the ends.
   */
  function summitCross(name, glow = 0) {
    const c = canvas(32, 46);
    ellipse(c, 16, 41, 13, 4, 'q');
    ellipse(c, 16, 38, 10, 4, 'r');
    ellipse(c, 16, 35, 7, 3, 'q');
    for (const [x, y] of [
      [9, 41],
      [14, 43],
      [21, 41],
      [12, 37],
      [19, 38],
      [16, 34],
    ]) {
      px(c, x, y, 'o');
    }
    ellipse(c, 16, 33, 5, 1.5, 'u');
    fillRect(c, 14, 8, 4, 26, 'c');
    fillRect(c, 17, 8, 1, 26, 'b');
    fillRect(c, 3, 14, 26, 4, 'c');
    fillRect(c, 3, 17, 26, 1, 'b');
    poly(
      c,
      [
        [11, 9],
        [16, 3],
        [21, 9],
      ],
      'p',
    );
    fillRect(c, 11, 9, 11, 1, 'o');
    fillRect(c, 3, 13, 7, 1, 'u');
    fillRect(c, 22, 13, 7, 1, 'u');
    fillRect(c, 14, 7, 4, 1, 'u');
    px(c, 16, 3, 'u');
    if (glow >= 1) {
      fillRect(c, 9, 15, 14, 2, 'R');
    }
    if (glow >= 2) {
      fillRect(c, 3, 15, 26, 2, 'S');
      fillRect(c, 9, 15, 14, 2, 'W');
    }
    return finish(name, c);
  }
  const CROSS_ANIM = {
    frames: 3,
    frameDurationMs: 200,
    loop: true,
    clips: {
      idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
      // The loading: a pink glow runs out from the middle, then the whole bar is white-hot.
      telegraph: { frames: [1, 2], frameDurationMs: 300, mode: 'once', onEnd: 'hold' },
      hurt: { frames: [0], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
    },
  };

  // ============================================================== SNOW CANNON
  /** Snow gun A: a fat fan housing tilted on a steel tripod, pointing left, 40×34. `aim` lifts the barrel and lights the mouth. */
  function snowGun(name, aim = false) {
    const c = canvas(40, 34);
    line(c, 22, 20, 12, 31, 'o', 2);
    line(c, 22, 20, 30, 31, 'o', 2);
    line(c, 22, 20, 21, 32, 'n', 2);
    fillRect(c, 10, 31, 5, 2, 'a');
    fillRect(c, 28, 31, 5, 2, 'a');
    const lift = aim ? 3 : 0;
    poly(
      c,
      [
        [10, 12 - lift],
        [30, 9],
        [30, 22],
        [10, 20 + lift],
      ],
      'F',
    );
    poly(
      c,
      [
        [10, 12 - lift],
        [30, 9],
        [30, 12],
        [10, 15 - lift],
      ],
      'x',
    );
    ellipse(c, 10, 16, 2.5, 5 + lift / 2, 'a');
    ellipse(c, 10, 16, 1.5, 3.5, aim ? 'S' : 'B');
    line(c, 30, 18, 36, 24, 'd', 2);
    px(c, 37, 25, 'a');
    fillRect(c, 19, 17, 6, 4, 'p');
    fillRect(c, 17, 7, 2, 2, 'W');
    return finish(name, c);
  }
  const CANNON_ANIM = {
    frames: 2,
    frameDurationMs: 200,
    loop: true,
    clips: {
      idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
      telegraph: { frames: [1], frameDurationMs: 100, mode: 'loop' },
      hurt: { frames: [0], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
    },
  };

  // ============================================================ MOUNTAIN HARE
  /**
   * The Kaninchen's own drawing (Floor 3's `kaninchen*` strips, read from the
   * committed PNGs), recoloured snow white (hare option A): the body and
   * shades move up the cool white ramp, the ink stays, the purple of its ear
   * and nose becomes Floor 4's alpenglow pink.
   */
  const HARE_MAP = {
    0x737373: 0xd1dce4,
    0x8a8a8a: 0xeef2f5,
    0xd1d1d1: 0xffffff,
    0xe8e8e8: 0xffffff,
    0xddaaeb: 0xe893a8,
  };
  const WALD = fileURLToPath(
    new URL('../../../assets/sprites/floor-3-wald/characters/', import.meta.url),
  );
  const recolour = (file, name) =>
    readFrames(`${WALD}${file}`, 2, name).map((frame, i) => ({
      ...frame,
      name: `${name}-${String(i)}`,
      px: frame.px.map((row) => row.map((c) => (c === null ? null : (HARE_MAP[c] ?? c)))),
    }));
  const hareAnim = JSON.parse(readFileSync(`${WALD}kaninchen.anim.json`, 'utf8'));

  const strip = (frames, anim) => ({ frames, anim });
  return {
    // The base `<id>` strip is the side view too, as Floor 3's walkers have it.
    STRIPS: {
      'rescue-dog': strip(dogSideFrames, DOG_ANIM),
      'rescue-dog-side': strip(dogSideFrames, DOG_ANIM),
      'rescue-dog-south': strip(dogSouthFrames, DOG_ANIM),
      'rescue-dog-north': strip(dogNorthFrames, DOG_ANIM),
      skier: strip(skierSideFrames, SKIER_ANIM),
      'skier-side': strip(skierSideFrames, SKIER_ANIM),
      'skier-south': strip(skierSouthFrames, SKIER_ANIM),
      'skier-north': strip(skierNorthFrames, SKIER_ANIM),
      'summit-cross': strip(
        [
          summitCross('summit-cross-idle'),
          summitCross('summit-cross-load', 1),
          summitCross('summit-cross-hot', 2),
        ],
        CROSS_ANIM,
      ),
      'snow-cannon': strip(
        [snowGun('snow-cannon-idle'), snowGun('snow-cannon-aim', true)],
        CANNON_ANIM,
      ),
      'mountain-hare': strip(recolour('kaninchen.strip.png', 'mountain-hare'), hareAnim),
      'mountain-hare-side': strip(recolour('kaninchen.strip.png', 'mountain-hare-side'), hareAnim),
      'mountain-hare-south': strip(
        recolour('kaninchen-south.strip.png', 'mountain-hare-south'),
        hareAnim,
      ),
      'mountain-hare-north': strip(
        recolour('kaninchen-north.strip.png', 'mountain-hare-north'),
        hareAnim,
      ),
    },
  };
}
