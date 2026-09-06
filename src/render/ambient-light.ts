import { Container, Sprite, Texture } from 'pixi.js';
import type { RoomRect } from '../sim/room/geometry.js';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../sim/room/template.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, WORLD_ZOOM } from './resolution.js';

/**
 * Ambient per-floor lighting, world-space so it pans and shakes with the room
 * rather than the screen (contrast `render/vignette.ts`, which follows the
 * player). Two effects, one per authored floor, both requested as a "nice
 * touch" rather than a mechanic — neither reads `GameSim` state beyond the
 * floor number and the tick counter, and neither can affect a replay.
 *
 * Both are soft, smoothly-shaded canvas gradients rather than anything drawn
 * on the pixel grid — deliberately: a lamp's falloff and a cloud's shadow are
 * naturally soft-edged things, and forcing them onto hard pixel steps would
 * read as banding, not lighting. The rest of the game stays pixel art; this
 * is the one place a smoother, "modern" render technique sits well next to
 * it, the same way `vignette.ts`'s own gradient already does.
 *
 * Drawn just above `propView` and below `decals`/`entities` in
 * `render/view.ts` — the ground and its furniture darken, bodies and shots
 * never do. This is a twin-stick bullet-hell (`docs/GAME_DESIGN.md` §1);
 * dimming the thing a player has to dodge for atmosphere would fight the
 * genre's own legibility requirement, so only the floor itself is lit.
 */

/** Der Keller (#35): the "single bare bulb" `docs/CONTENT_BIBLE.md` §1 already calls for. */
const KELLER_FLOOR = 1;
/** Dorf & Acker (#37): bright and outdoor — the sun, with the odd cloud passing over it. */
const DORF_FLOOR = 2;

/**
 * The span both `lampPlacement` and `cloudPlacement` size one falloff sprite
 * against — the same `viewWidth`/`viewHeight` `GameView.followOffset`
 * computes the camera's pan range from, i.e. one screen's worth of world
 * units (#243). A `1x1` room's own span already sits under this, so nothing
 * about either floor's original single-screen rooms changes.
 *
 * #243 capped a *single* sprite, centred on the whole room, to this span —
 * which fixed the original "falloff several screens wide" symptom (a
 * texture's blur/gradient is a fixed fraction of the texture, so stretching
 * one sprite across a `2x2`/`L`/`T` room's full multi-screen span read as a
 * hard-edged shadow box that only ever showed part of itself, tracking the
 * camera as it panned) but traded it for the opposite one: a single
 * screen-sized sprite is *smaller* than a multi-cell room, so it left the far
 * cells unlit and its own rectangular edge visible inside the arena (#260).
 *
 * The actual fix is `roomCellCentres`: place one screen-capped falloff per
 * screen-cell of the room (every room's cells are exactly `SCREEN_WIDTH` ×
 * `SCREEN_HEIGHT`, glued edge to edge — `sim/room/template.ts`) rather than
 * one stretched over the room's whole bounding box. Each pool keeps the same
 * never-stretched-past-one-screen size #243 already fixed, and
 * `KELLER_COVERAGE`/the cloud's own fractions make adjacent cells' pools
 * overlap enough to blend at the seam instead of leaving a gap — many small
 * bulbs (or one drifting cloud per cell) rather than one giant one.
 */
const ROOM_SPAN_CAP_WIDTH = INTERNAL_WIDTH / WORLD_ZOOM;
const ROOM_SPAN_CAP_HEIGHT = INTERNAL_HEIGHT / WORLD_ZOOM;

/** Warm, barely-off-black — a bare bulb's shadow, not a neutral grey one. */
const KELLER_SHADOW_RGB = '12, 9, 6';
/** The bulb's own warm light, for the additive glow pooled under it — not the shadow colour inverted, an actual light-bulb amber. */
const KELLER_GLOW_RGB = '255, 214, 140';
/**
 * Neutral, close to white — a cloud dims whatever is under it without
 * changing its colour, which is what a `multiply`-blended near-white does
 * (`AmbientLight`'s cloud sprite runs in `multiply` rather than the lamp's
 * plain alpha blend): scaling every channel by the same near-1 factor keeps
 * hue and saturation exactly where they were and only pulls brightness down,
 * instead of mixing in a foreign blue-grey the way a `normal`-blend overlay
 * would — see `createCloudTexture`'s own doc comment for the reasoning.
 */
const CLOUD_SHADOW_RGB = '150, 150, 150';
/** `CLOUD_SHADOW_RGB` as a `0..1` multiplier, for `AmbientLight.tintAt` — the same near-white, read as the factor a `multiply` blend applies. */
const CLOUD_SHADOW_LEVEL = 150 / 255;

/**
 * How much of the gradient's radius is spent easing from `KELLER_CENTRE_ALPHA`
 * to `KELLER_EDGE_ALPHA` before the flat centre begins — small, so the bulb
 * reads as one continuous pool of light rather than a hard-edged disc.
 */
const KELLER_INNER_STOP = 0.08;
/** The cellar's darkening directly under the bulb — `KELLER_GLOW_RGB`'s additive glow is what actually brightens the centre; this stays low rather than zero so even the lit pool reads as part of a darker room. */
const KELLER_CENTRE_ALPHA = 0.05;
/** The darkening the falloff reaches by the gradient's outer edge — deliberately strong: "brighter in the middle and darker on the edge" is the whole ask. */
const KELLER_EDGE_ALPHA = 0.78;
/** How strong the additive warm glow is directly under the bulb. */
const KELLER_GLOW_PEAK_ALPHA = 0.4;
/**
 * `KELLER_GLOW_RGB`'s green and blue, for `AmbientLight.tintAt`: what a body
 * standing in the pool is tinted *toward*, at `KELLER_GLOW_WARMTH` of the
 * glow's own reach. Red is 255 in that colour and so is left out of the
 * arithmetic — warming is entirely a matter of holding green and blue back.
 */
const KELLER_GLOW_G = 214;
const KELLER_GLOW_B = 140;
/**
 * How much of the bulb's colour a body standing under it takes on.
 *
 * Half. The glow is *added* to the floor and can only be *multiplied* into
 * anything standing on it (#73, `tintAt`), so this is a hue shift standing in
 * for a light: too little and a grey rock reads cold against an amber floor,
 * too much and the same rock goes orange and stops reading as stone. Tuned by
 * looking at floor 1's start room with a rock in the pool and a rock in a
 * corner in the same frame.
 */
const KELLER_GLOW_WARMTH = 0.5;
/**
 * Where the glow's own fade reaches `0`, as a fraction of the *shadow*
 * sprite's half-size (both sprites share one `lampPlacement`, so this is
 * relative to the same span either way) — well short of `1`, so the glow is
 * fully spent while the darkening is still only partway to `KELLER_EDGE_ALPHA`.
 * Sharing the sprite but not the falloff distance is what keeps "brighter in
 * the middle, darker at the edge" reading as one continuous pool of light
 * rather than a lit disc sitting on top of a separately-vignetted floor: the
 * glow has already faded to nothing well before the darkening has faded in
 * very far, so there is no point where the two are both still strong and
 * fighting each other, and the edges are free to reach real darkness instead
 * of the glow perpetually taking a bite out of it.
 */
const KELLER_GLOW_REACH = 0.55;
/**
 * The falloff sprites' size relative to the room's *full authored frame*
 * (`sim/room/geometry.ts`'s `roomFrameSize` — interior plus the wall margin
 * on every side), not just the interior play area: a bulb overhead lights
 * the nearby wall too, not only the floor, and sizing off the frame is what
 * lets the glow reach that wall band with the same falloff rather than
 * stopping dead at the floor's own edge. Bigger than `1` on top of that so
 * the sprites' own rectangular bounds sit past the frame's corners — with a
 * texture whose fade already reaches its own corner (see
 * `createGlowTexture`), that keeps the one hard edge that necessarily exists
 * (a `Sprite` is always a rectangle) off the visible frame entirely.
 */
const KELLER_COVERAGE = 1.3;

/** Never more than this much of the cloud's own near-white gets multiplied in — a soft dimming, not a wash. */
const CLOUD_MAX_ALPHA = 0.4;
/** How wide/tall the shadow patch is relative to the room, less than `1` so it reads as a discrete cloud rather than the whole sky dimming at once. */
const CLOUD_WIDTH_FRACTION = 0.85;
const CLOUD_HEIGHT_FRACTION = 0.6;
/** How often a cloud starts crossing. Long enough that "occasional" is the honest word for it. */
const CLOUD_CYCLE_TICKS = TICKS_PER_SECOND * 50;
/** How long one crossing takes, start to finish — a slow drift, not a blink. */
const CLOUD_CROSS_TICKS = TICKS_PER_SECOND * 16;
/** Fraction of the crossing spent fading in and, mirrored, fading out — no hard pop at either end. */
const CLOUD_FADE_FRACTION = 0.25;

/**
 * A square radial-gradient texture, easing from `rgba(rgb, innerAlpha)` at
 * the centre (out to `innerStop`, a fraction of the radius) to
 * `rgba(rgb, outerAlpha)` at the texture's own corner. Generated once via
 * `<canvas>` — a soft radial fade is a Canvas 2D gradient, not a shape, and
 * not worth a shader, same reasoning as `vignette.ts`'s own gradient.
 *
 * `outerStop` (a fraction of `size/2`) defaults callers to the texture's own
 * corner radius (`√2`), not the more usual inscribed-circle radius (`1`):
 * canvas gradients paint their last stop's colour for every radius past it
 * rather than stopping there, so an inscribed-circle outer stop leaves the
 * texture's own four corners a flat, uniform block once stretched onto a
 * sprite — invisible on a sprite cropped well inside its own bounds, but a
 * visible hard-edged rectangle on one that isn't. Ending the fade at the
 * corner instead means every pixel a *fully covering* texture like the lamp
 * shadow gets stretched to is still part of one continuous gradient. A
 * texture meant to fade all the way to nothing well inside its own sprite
 * (the lamp glow) passes a smaller `outerStop` on purpose instead — there
 * the flat region past the last stop is transparent, so it never shows.
 */
/**
 * A texture plus the alpha it actually holds, coarsely sampled.
 *
 * The lighting is drawn as sprites over the floor, which is all it needed to
 * be while nothing stood *in* it. Since `docs/DECISIONS.md` #73 the obstacles
 * and the furniture are above that overlay — they have to be, to sort against
 * the bodies — so they have to be lit some other way, and the only way that
 * does not cost a draw call per rock is a `tint` on the sprite itself.
 *
 * That needs the light's value at a point, which means reading back what the
 * gradient canvas actually painted rather than re-deriving it: the sampler and
 * the GPU are then looking at the same pixels by construction, and a change to
 * a gradient stop, a puff or a blur radius cannot leave the two disagreeing.
 * `FIELD_SIZE` is coarse on purpose — this is a soft falloff hundreds of world
 * units across, and a rock is sixteen.
 */
interface AlphaField {
  readonly width: number;
  readonly height: number;
  /** `0..1` per cell, row-major. */
  readonly data: Float32Array;
}

interface SampledTexture {
  readonly texture: Texture;
  /** `null` with no DOM — see `createGlowTexture`'s own headless guard. */
  readonly field: AlphaField | null;
}

const FIELD_SIZE = 64;

/** Reads a canvas's alpha channel down into a `FIELD_SIZE`-ish grid. */
function sampleAlpha(canvas: HTMLCanvasElement): AlphaField | null {
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }
  const width = Math.min(FIELD_SIZE, canvas.width);
  const height = Math.min(FIELD_SIZE, canvas.height);
  const data = new Float32Array(width * height);
  try {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < height; y++) {
      const sy = Math.min(canvas.height - 1, Math.floor(((y + 0.5) / height) * canvas.height));
      for (let x = 0; x < width; x++) {
        const sx = Math.min(canvas.width - 1, Math.floor(((x + 0.5) / width) * canvas.width));
        data[y * width + x] = (pixels[(sy * canvas.width + sx) * 4 + 3] ?? 0) / 255;
      }
    }
  } catch {
    // A tainted canvas, or a context that cannot be read back. The overlay
    // still draws; only the per-sprite tint falls back to "unlit", which is
    // exactly what this looked like before it existed.
    return null;
  }
  return { width, height, data };
}

/**
 * The field's alpha at a normalised `(u, v)` inside the sprite, or `0` outside
 * it. Nearest-neighbour: the source is already a smooth gradient sampled far
 * more finely than anything reading it.
 */
function fieldAt(field: AlphaField | null, u: number, v: number): number {
  if (field === null || u < 0 || u > 1 || v < 0 || v > 1) {
    return 0;
  }
  const x = Math.min(field.width - 1, Math.floor(u * field.width));
  const y = Math.min(field.height - 1, Math.floor(v * field.height));
  return field.data[y * field.width + x] ?? 0;
}

/** `value` at a world point, given the placement of the sprite the field is drawn on (anchor `0.5`). */
function sampleAt(field: AlphaField | null, placement: Placement, x: number, y: number): number {
  return fieldAt(
    field,
    (x - placement.x) / placement.width + 0.5,
    (y - placement.y) / placement.height + 0.5,
  );
}

function createGlowTexture(
  rgb: string,
  innerAlpha: number,
  outerAlpha: number,
  innerStop: number,
  outerStop: number = Math.SQRT2,
): SampledTexture {
  // No DOM at all — the frame-time benchmark (`tests/bench/scene.ts`) builds
  // a `GameView` in plain Node, same reasoning as `inked-bounds.ts`'s own
  // `scratchContext` guard.
  if (typeof document === 'undefined') {
    return { texture: Texture.EMPTY, field: null };
  }
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    // No 2D context is a headless/test environment, not a real failure.
    return { texture: Texture.from(canvas), field: null };
  }
  const centre = size / 2;
  const gradient = context.createRadialGradient(
    centre,
    centre,
    size * innerStop,
    centre,
    centre,
    centre * outerStop,
  );
  gradient.addColorStop(0, `rgba(${rgb}, ${String(innerAlpha)})`);
  gradient.addColorStop(1, `rgba(${rgb}, ${String(outerAlpha)})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return { texture: Texture.from(canvas), field: sampleAlpha(canvas) };
}

/**
 * A hand-placed cluster of overlapping circles, fractions of the canvas —
 * the classic cartoon-cloud silhouette (a wide flattish base, a few rounded
 * bumps along the top) rather than a single oval, which reads as a smudge
 * more than a cloud. Feathered afterward in `createCloudTexture`, so the
 * bumps read as one soft shape and not as a row of separate blobs.
 */
const CLOUD_PUFFS: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  { x: 0.22, y: 0.62, r: 0.15 },
  { x: 0.37, y: 0.44, r: 0.21 },
  { x: 0.55, y: 0.38, r: 0.24 },
  { x: 0.73, y: 0.48, r: 0.2 },
  { x: 0.85, y: 0.62, r: 0.14 },
  { x: 0.5, y: 0.64, r: 0.22 },
];

/** How much of the canvas's shorter side one blur pass softens the silhouette's edge by. */
const CLOUD_BLUR_FRACTION = 0.05;

/**
 * A soft-edged cloud silhouette, coloured `rgb` at full alpha — `AmbientLight`
 * draws it with `blendMode: 'multiply'` rather than the lamp's plain alpha
 * blend, and controls how strongly that multiply applies via `Sprite.alpha`.
 * `rgb` is meant to be near-white (`CLOUD_SHADOW_RGB`): multiplying the floor
 * by a near-1 factor dims it without shifting its hue, which is what makes
 * this read as an actual shadow instead of a grey-blue wash painted over the
 * ground — the failure mode a plain alpha-blended overlay had.
 *
 * Drawn crisp (union of `CLOUD_PUFFS`, no filter) onto an offscreen canvas
 * first and blurred only when that whole silhouette is composited onto the
 * real texture, rather than blurring each circle as it's drawn — blurring
 * per-shape leaves visible extra-soft seams where two feathered edges
 * overlap; blurring the finished union softens only the silhouette's actual
 * outline.
 */
function createCloudTexture(rgb: string): SampledTexture {
  // No DOM at all — same `tests/bench` reasoning as `createGlowTexture`'s own guard.
  if (typeof document === 'undefined') {
    return { texture: Texture.EMPTY, field: null };
  }
  const width = 512;
  const height = 320;
  const blur = Math.round(Math.min(width, height) * CLOUD_BLUR_FRACTION);

  const shape = document.createElement('canvas');
  shape.width = width;
  shape.height = height;
  const shapeContext = shape.getContext('2d');
  if (shapeContext === null) {
    // No 2D context is a headless/test environment, not a real failure.
    return { texture: Texture.from(shape), field: null };
  }
  shapeContext.fillStyle = `rgb(${rgb})`;
  const unit = Math.min(width, height);
  for (const puff of CLOUD_PUFFS) {
    shapeContext.beginPath();
    shapeContext.arc(puff.x * width, puff.y * height, puff.r * unit, 0, Math.PI * 2);
    shapeContext.fill();
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) {
    return { texture: Texture.from(canvas), field: null };
  }
  context.filter = `blur(${String(blur)}px)`;
  context.drawImage(shape, 0, 0);
  return { texture: Texture.from(canvas), field: sampleAlpha(canvas) };
}

/** Rectangle plus size, in room units — what a sprite needs to sit centred over a point at some fraction of one screen's span. */
interface Placement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A single screen-cell's centre, in room units. */
export interface CellCentre {
  readonly x: number;
  readonly y: number;
}

/**
 * Every screen-cell centre in `room`'s bounding grid, row-major — one entry
 * for a `1x1` room (its own centre, exactly as before #260), up to nine for
 * `T`'s `3x3` bounding box (`content/rooms/definition.ts`'s `MULTI_CELL_COUNT`).
 * Void cells (`sim/room/geometry.ts`'s `voidRects` — the corners an `L`/`T`
 * shape's footprint doesn't claim) get a centre too: they're walled off, so a
 * pool of light sitting there is never seen, and including them keeps this a
 * plain grid walk rather than a shape-aware one.
 *
 * Every room's cells are glued edge to edge with no gap between them
 * (`sim/room/template.ts`'s `compileRoomTemplate`), each exactly
 * `SCREEN_WIDTH` × `SCREEN_HEIGHT` — so the room's own interior bounds divide
 * evenly into that grid for every shape `ROOM_SHAPES` authors. A staircase
 * room's steps overlap by half a screen instead of tiling cleanly
 * (`sim/room/staircase.ts`'s `STAIR_STEP_OVERLAP`), so the division here is
 * only ever approximate there — still enough cells, spread across the room,
 * to avoid the single-undersized-box bug this replaces, just not seamed
 * exactly on each step.
 */
export function roomCellCentres(room: RoomRect): CellCentre[] {
  const cols = Math.max(1, Math.round((room.maxX - room.minX) / SCREEN_WIDTH));
  const rows = Math.max(1, Math.round((room.maxY - room.minY) / SCREEN_HEIGHT));
  const centres: CellCentre[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      centres.push({
        x: room.minX + col * SCREEN_WIDTH + SCREEN_WIDTH / 2,
        y: room.minY + row * SCREEN_HEIGHT + SCREEN_HEIGHT / 2,
      });
    }
  }
  return centres;
}

/**
 * Where and how big one of Floor 1's falloff sprites sits, centred on a
 * single screen-cell (#260) — never the whole room, however many cells it
 * has. Always exactly `ROOM_SPAN_CAP_WIDTH`/`_HEIGHT` times `KELLER_COVERAGE`
 * (#243's cap, on a span that is by construction never bigger than one
 * screen to begin with) so a `1x1` room's one cell renders exactly as before
 * either fix, and a multi-cell room gets one such pool per cell
 * (`roomCellCentres`) instead of a single sprite stretched or shrunk to fit
 * the whole thing.
 */
export function lampPlacement(cell: CellCentre): Placement {
  return {
    x: cell.x,
    y: cell.y,
    width: ROOM_SPAN_CAP_WIDTH * KELLER_COVERAGE,
    height: ROOM_SPAN_CAP_HEIGHT * KELLER_COVERAGE,
  };
}

/**
 * One cloud crossing, as a pure function of the run's tick counter — same
 * "same tick, same frame, every replay" determinism `shooting.ts`'s aim
 * wobble and `vignette.ts`'s breathing already use a sine for, even though
 * nothing here feeds back into the simulation: a replay should still look
 * the same as the run it recorded.
 *
 * `tick` is the run-wide counter (`GameSim.tick`), not reset per room, so
 * two rooms entered at different points in a run see the cloud at different,
 * uncoordinated phases rather than all syncing to the same moment.
 */
export interface CloudShadowState {
  /** Whether the shadow is on screen at all — `false` outside a crossing. */
  readonly visible: boolean;
  /** `0` at the start of a crossing (off the west edge) to `1` at the end (off the east edge). */
  readonly progress: number;
  /** `0..CLOUD_MAX_ALPHA`, ramped at both ends of the crossing so it never pops in or out. */
  readonly alpha: number;
}

export function cloudShadowState(tick: number): CloudShadowState {
  const phase = ((tick % CLOUD_CYCLE_TICKS) + CLOUD_CYCLE_TICKS) % CLOUD_CYCLE_TICKS;
  if (phase >= CLOUD_CROSS_TICKS) {
    return { visible: false, progress: 0, alpha: 0 };
  }
  const progress = phase / CLOUD_CROSS_TICKS;
  const fadeIn = Math.min(1, progress / CLOUD_FADE_FRACTION);
  const fadeOut = Math.min(1, (1 - progress) / CLOUD_FADE_FRACTION);
  const alpha = Math.min(fadeIn, fadeOut) * CLOUD_MAX_ALPHA;
  return { visible: alpha > 0, progress, alpha };
}

/**
 * Where and how big one cloud shadow sits at a given point in its crossing —
 * drifting west to east across a single screen-cell (#260, mirroring
 * `lampPlacement`), fully off that cell at both ends. `AmbientLight` drives
 * one of these per cell in `roomCellCentres`, all sharing the same `progress`
 * (from the one run-wide `cloudShadowState`) so every cell's cloud crosses in
 * lockstep — one weather front passing over the whole room at once, rather
 * than several independent clouds happening to overlap.
 */
export function cloudPlacement(cell: CellCentre, progress: number): Placement {
  const width = ROOM_SPAN_CAP_WIDTH * CLOUD_WIDTH_FRACTION;
  const height = ROOM_SPAN_CAP_HEIGHT * CLOUD_HEIGHT_FRACTION;
  const travel = ROOM_SPAN_CAP_WIDTH + width;
  return {
    x: cell.x - ROOM_SPAN_CAP_WIDTH / 2 - width / 2 + travel * progress,
    y: cell.y,
    width,
    height,
  };
}

/**
 * The per-floor lighting layer `render/view.ts`'s `GameView` owns one of.
 *
 * `onRoomChanged` runs whenever the room (and so its size/floor) changes —
 * the same event that rebuilds `roomView`/`propView` — and is the only place
 * that touches geometry. `sync` runs every rendered frame but only Floor 2's
 * cloud actually does anything there; every other floor, including Floor 1's
 * static falloff, costs nothing per frame.
 *
 * One cell's worth of sprites used to be enough — a single lamp-shadow,
 * lamp-glow and cloud sprite, centred on the room. Since #260 each floor
 * needs up to one falloff *per screen-cell* (`roomCellCentres`), so the three
 * single sprites are now three pools, grown to the room's cell count and
 * never shrunk — a smaller room after a bigger one just leaves the pool's
 * extra sprites at `alpha = 0` rather than destroying and recreating them.
 */
export class AmbientLight {
  /**
   * The lighting itself, drawn under the depth layer: it shades the floor and
   * never dims a body — the legibility rule this class's own doc comment
   * states. What *stands* in the light is shaded by `tintAt` instead, because
   * since #73 it has to be above this to sort against the bodies.
   */
  readonly container = new Container();

  private readonly lampShadow: SampledTexture;
  private readonly lampGlow: SampledTexture;
  private readonly cloud: SampledTexture;
  /** The darkening vignette — drawn first, so the additive glow painted after it never gets darkened back down. */
  private readonly lampShadowSprites: Sprite[] = [];
  /** The bulb's own warm pool of light, `blendMode: 'add'` — see `KELLER_GLOW_REACH`'s own doc comment for why it fades out well short of the shadow's own falloff. */
  private readonly lampGlowSprites: Sprite[] = [];
  private readonly cloudSprites: Sprite[] = [];
  private floorNumber = 0;
  private cells: CellCentre[] = [];
  private reducedMotion = false;
  /** The cloud's live crossing, mirrored out of `sync` so `tintAt` reads the same shadow the sprites are drawing. */
  private cloudAlpha = 0;
  private cloudProgress = 0;
  private revision = 0;

  constructor() {
    this.lampShadow = createGlowTexture(
      KELLER_SHADOW_RGB,
      KELLER_CENTRE_ALPHA,
      KELLER_EDGE_ALPHA,
      KELLER_INNER_STOP,
    );
    this.lampGlow = createGlowTexture(
      KELLER_GLOW_RGB,
      KELLER_GLOW_PEAK_ALPHA,
      0,
      KELLER_INNER_STOP,
      KELLER_GLOW_REACH,
    );
    this.cloud = createCloudTexture(CLOUD_SHADOW_RGB);
  }

  /** Grows `pool` to `count` sprites of `texture`/`blendMode`, adding new ones to `into`; never shrinks it. */
  private growPool(
    pool: Sprite[],
    texture: Texture,
    blendMode: Sprite['blendMode'],
    count: number,
    into: Container,
  ): void {
    while (pool.length < count) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.blendMode = blendMode;
      sprite.alpha = 0;
      into.addChild(sprite);
      pool.push(sprite);
    }
  }

  /**
   * The multiply tint a sprite **standing at** `(x, y)` should be drawn with,
   * as `0xrrggbb` — `0xffffff` on a floor with no lighting, or with none the
   * sampler could read.
   *
   * Sampled at the body's own **floor position**, so the whole drawing takes
   * one value: a rock's raised crown is not further across the room than its
   * base, it is above it, and lighting it by where its pixels land on screen
   * would read height as depth and slide the falloff up its face. One value
   * per object is also what the falloff deserves — it varies over hundreds of
   * world units, and a rock is sixteen.
   *
   * A tint is a **multiply**, so it can shade and it can shift hue, and it
   * cannot make a sprite brighter than it was drawn. That is not the
   * limitation it first looks like: the authored art already *is* the
   * fully-lit reference, so "no darkening at all" is the right answer directly
   * under the bulb. What the bulb's glow contributes there is its *colour*,
   * and `KELLER_GLOW_WARMTH` carries that — a rock in the pool reads warm
   * rather than reading grey against a warm floor.
   *
   * (Drawing the glow itself over the depth layer was tried first, so it would
   * fall on the rocks as light rather than as hue. It also falls on the bodies,
   * and at the alpha the floor was tuned for it washes them out — Alois under
   * the bulb lost his outline. The floor is the surface the pool is authored
   * against; foreground art is not.)
   */
  tintAt(x: number, y: number): number {
    let factor = 1;
    let warmth = 0;
    if (this.floorNumber === KELLER_FLOOR) {
      for (const cell of this.cells) {
        const placement = lampPlacement(cell);
        factor *= 1 - sampleAt(this.lampShadow.field, placement, x, y);
        warmth += sampleAt(this.lampGlow.field, placement, x, y);
      }
      warmth = Math.min(1, warmth) * KELLER_GLOW_WARMTH;
    } else if (this.floorNumber === DORF_FLOOR && this.cloudAlpha > 0) {
      // `multiply` with a near-white at `alpha`: every channel scaled by the
      // same factor, which is exactly a tint and so is reproduced here rather
      // than approximated.
      for (const cell of this.cells) {
        const covered = sampleAt(this.cloud.field, cloudPlacement(cell, this.cloudProgress), x, y);
        factor *= 1 - covered * this.cloudAlpha * (1 - CLOUD_SHADOW_LEVEL);
      }
    }
    const shade = (level: number): number =>
      Math.max(0, Math.min(255, Math.round(factor * (255 + (level - 255) * warmth))));
    return (shade(255) << 16) | (shade(KELLER_GLOW_G) << 8) | shade(KELLER_GLOW_B);
  }

  /**
   * Bumped whenever `tintAt` would answer differently — a room change, or the
   * cloud moving. `GameView` re-tints its scenery off this rather than every
   * frame: on Floor 1 the lamp never moves, so the whole room is tinted once
   * at load and never again.
   */
  get tintRevision(): number {
    return this.revision;
  }

  /** `reduceMotion` (#153's accessibility toggle) skips the drifting cloud entirely — it is a slow, non-essential background motion, not a mechanic. */
  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    this.revision += 1;
    if (reducedMotion) {
      this.cloudAlpha = 0;
      for (const sprite of this.cloudSprites) {
        sprite.alpha = 0;
      }
    }
  }

  onRoomChanged(room: RoomRect, floorNumber: number): void {
    this.floorNumber = floorNumber;
    this.cells = roomCellCentres(room);
    this.revision += 1;

    if (floorNumber === KELLER_FLOOR) {
      this.growPool(
        this.lampShadowSprites,
        this.lampShadow.texture,
        'normal',
        this.cells.length,
        this.container,
      );
      this.growPool(
        this.lampGlowSprites,
        this.lampGlow.texture,
        'add',
        this.cells.length,
        this.container,
      );
      this.cells.forEach((cell, index) => {
        const lamp = lampPlacement(cell);
        const shadow = this.lampShadowSprites[index];
        const glow = this.lampGlowSprites[index];
        if (shadow === undefined || glow === undefined) {
          return;
        }
        shadow.position.set(lamp.x, lamp.y);
        shadow.width = lamp.width;
        shadow.height = lamp.height;
        shadow.alpha = 1;
        glow.position.set(lamp.x, lamp.y);
        glow.width = lamp.width;
        glow.height = lamp.height;
        glow.alpha = 1;
      });
      for (const sprite of this.lampShadowSprites.slice(this.cells.length)) {
        sprite.alpha = 0;
      }
      for (const sprite of this.lampGlowSprites.slice(this.cells.length)) {
        sprite.alpha = 0;
      }
    } else {
      for (const sprite of this.lampShadowSprites) {
        sprite.alpha = 0;
      }
      for (const sprite of this.lampGlowSprites) {
        sprite.alpha = 0;
      }
    }

    if (floorNumber === DORF_FLOOR) {
      this.growPool(
        this.cloudSprites,
        this.cloud.texture,
        'multiply',
        this.cells.length,
        this.container,
      );
      for (const sprite of this.cloudSprites.slice(this.cells.length)) {
        sprite.alpha = 0;
      }
    } else {
      for (const sprite of this.cloudSprites) {
        sprite.alpha = 0;
      }
    }
  }

  sync(tick: number): void {
    if (this.floorNumber !== DORF_FLOOR || this.reducedMotion) {
      if (this.cloudAlpha !== 0) {
        this.cloudAlpha = 0;
        this.revision += 1;
      }
      for (const sprite of this.cloudSprites) {
        sprite.alpha = 0;
      }
      return;
    }
    const state = cloudShadowState(tick);
    // Mirrored for `tintAt`, which has to answer with the same shadow these
    // sprites are about to draw — and bumps the revision so the scenery is
    // re-tinted as the cloud drifts over it.
    if (state.alpha !== this.cloudAlpha || state.progress !== this.cloudProgress) {
      this.cloudAlpha = state.alpha;
      this.cloudProgress = state.progress;
      this.revision += 1;
    }
    this.cells.forEach((cell, index) => {
      const sprite = this.cloudSprites[index];
      if (sprite === undefined) {
        return;
      }
      sprite.alpha = state.alpha;
      if (state.visible) {
        const placement = cloudPlacement(cell, state.progress);
        sprite.position.set(placement.x, placement.y);
        sprite.width = placement.width;
        sprite.height = placement.height;
      }
    });
  }

  /**
   * Frees the three canvases the constructor generated and uploaded as GPU
   * textures — uniquely this instance's own, never shared with anything
   * else (contrast `viewTextures`'s art atlases, reused across every
   * restart), so nothing else will ever free them if this doesn't.
   * `GameView.destroy` calls this before destroying `container` itself.
   *
   * Skips `Texture.EMPTY` — what the constructor's `createGlowTexture`/
   * `createCloudTexture` fall back to with no `document` (`tests/bench`'s
   * headless `GameView`, this module's own doc comment) — which is a
   * shared singleton every other texture-less sprite in the process also
   * falls back to; destroying it would take all of them down too.
   */
  destroy(): void {
    this.container.destroy({ children: true });
    for (const { texture } of [this.lampShadow, this.lampGlow, this.cloud]) {
      if (texture !== Texture.EMPTY) {
        texture.destroy(true);
      }
    }
  }
}
