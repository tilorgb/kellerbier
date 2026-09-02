import { Container, Sprite, Texture } from 'pixi.js';
import type { RoomRect } from '../sim/room/geometry.js';
import { TICKS_PER_SECOND } from '../sim/time.js';

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

/** Warm, barely-off-black — a bare bulb's shadow, not a neutral grey one. */
const KELLER_SHADOW_RGB = '12, 9, 6';
/** Cool, desaturated blue-grey — a cloud's shadow, not a storm front. */
const CLOUD_SHADOW_RGB = '28, 40, 52';

/**
 * How much of the gradient's radius is spent easing from `KELLER_CENTRE_ALPHA`
 * to `KELLER_EDGE_ALPHA` before the flat centre begins — small, so the bulb
 * reads as one continuous pool of light rather than a hard-edged disc.
 */
const KELLER_INNER_STOP = 0.08;
/** The cellar's darkening directly under the bulb — never fully lit, "the whole cellar is darker." */
const KELLER_CENTRE_ALPHA = 0.16;
/** The darkening the falloff reaches by the gradient's outer edge. */
const KELLER_EDGE_ALPHA = 0.64;
/**
 * The falloff sprite's size relative to the room's *full authored frame*
 * (`sim/room/geometry.ts`'s `roomFrameSize` — interior plus the wall margin
 * on every side), not just the interior play area: a bulb overhead lights
 * the nearby wall too, not only the floor, and sizing off the frame is what
 * lets the glow reach that wall band with the same falloff rather than
 * stopping dead at the floor's own edge. Bigger than `1` on top of that so
 * the sprite's own rectangular bounds sit past the frame's corners — with a
 * texture whose fade already reaches its own corner (see
 * `createGlowTexture`), that keeps the one hard edge that necessarily exists
 * (a `Sprite` is always a rectangle) off the visible frame entirely.
 */
const KELLER_COVERAGE = 1.3;

/** Never more than this much shadow — "very subtle... shouldn't disturb." */
const CLOUD_MAX_ALPHA = 0.16;
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
 * The outer stop sits at the corner radius (`size/2 * √2`), not the more
 * usual inscribed-circle radius (`size/2`): canvas gradients paint their
 * last stop's colour for every radius past it rather than stopping there, so
 * an inscribed-circle outer stop leaves the texture's own four corners a
 * flat, uniform block once stretched onto a sprite — invisible on a sprite
 * cropped well inside its own bounds (nothing here is), but a visible
 * hard-edged rectangle on one that isn't. Ending the fade at the corner
 * instead means every pixel this texture can be stretched to is still part
 * of one continuous gradient, which is what actually reads as round.
 */
function createGlowTexture(
  rgb: string,
  innerAlpha: number,
  outerAlpha: number,
  innerStop: number,
): Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    // No 2D context is a headless/test environment, not a real failure.
    return Texture.from(canvas);
  }
  const centre = size / 2;
  const gradient = context.createRadialGradient(
    centre,
    centre,
    size * innerStop,
    centre,
    centre,
    centre * Math.SQRT2,
  );
  gradient.addColorStop(0, `rgba(${rgb}, ${String(innerAlpha)})`);
  gradient.addColorStop(1, `rgba(${rgb}, ${String(outerAlpha)})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return Texture.from(canvas);
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
 * controls how dark the shadow actually reads via `Sprite.alpha`, same as the
 * lamp glow does.
 *
 * Drawn crisp (union of `CLOUD_PUFFS`, no filter) onto an offscreen canvas
 * first and blurred only when that whole silhouette is composited onto the
 * real texture, rather than blurring each circle as it's drawn — blurring
 * per-shape leaves visible extra-soft seams where two feathered edges
 * overlap; blurring the finished union softens only the silhouette's actual
 * outline.
 */
function createCloudTexture(rgb: string): Texture {
  const width = 512;
  const height = 320;
  const blur = Math.round(Math.min(width, height) * CLOUD_BLUR_FRACTION);

  const shape = document.createElement('canvas');
  shape.width = width;
  shape.height = height;
  const shapeContext = shape.getContext('2d');
  if (shapeContext === null) {
    // No 2D context is a headless/test environment, not a real failure.
    return Texture.from(shape);
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
    return Texture.from(canvas);
  }
  context.filter = `blur(${String(blur)}px)`;
  context.drawImage(shape, 0, 0);
  return Texture.from(canvas);
}

/** Rectangle plus size, in room units — what a sprite needs to sit centred over `room` at some fraction of its span. */
interface Placement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function roomCentre(room: RoomRect): { readonly x: number; readonly y: number } {
  return { x: (room.minX + room.maxX) / 2, y: (room.minY + room.maxY) / 2 };
}

/**
 * The room's full authored frame — interior plus the wall margin on every
 * side. Every room has an equal margin on opposite sides
 * (`sim/room/geometry.ts`'s `roomFrameSize`, which this mirrors rather than
 * calls: that function takes a `RoomGeometry`, and everything here only ever
 * needs the four bounds a plain `RoomRect` already carries), so the far
 * margin is always exactly `minX`/`minY` again.
 */
function frameSize(room: RoomRect): { readonly width: number; readonly height: number } {
  return { width: room.minX + room.maxX, height: room.minY + room.maxY };
}

/** Where and how big Floor 1's falloff sprite sits, centred on the room. */
export function lampPlacement(room: RoomRect): Placement {
  const centre = roomCentre(room);
  const frame = frameSize(room);
  return {
    x: centre.x,
    y: centre.y,
    width: frame.width * KELLER_COVERAGE,
    height: frame.height * KELLER_COVERAGE,
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

/** Where and how big the cloud shadow sits at a given point in its crossing — drifting west to east, fully off-room at both ends. */
export function cloudPlacement(room: RoomRect, progress: number): Placement {
  const width = (room.maxX - room.minX) * CLOUD_WIDTH_FRACTION;
  const height = (room.maxY - room.minY) * CLOUD_HEIGHT_FRACTION;
  const travel = room.maxX - room.minX + width;
  return {
    x: room.minX - width / 2 + travel * progress,
    y: roomCentre(room).y,
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
 */
export class AmbientLight {
  readonly container = new Container();

  private readonly lampTexture: Texture;
  private readonly cloudTexture: Texture;
  private readonly lampSprite: Sprite;
  private readonly cloudSprite: Sprite;
  private floorNumber = 0;
  private room: RoomRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private reducedMotion = false;

  constructor() {
    this.lampTexture = createGlowTexture(
      KELLER_SHADOW_RGB,
      KELLER_CENTRE_ALPHA,
      KELLER_EDGE_ALPHA,
      KELLER_INNER_STOP,
    );
    this.cloudTexture = createCloudTexture(CLOUD_SHADOW_RGB);

    this.lampSprite = new Sprite(this.lampTexture);
    this.lampSprite.anchor.set(0.5);
    this.lampSprite.alpha = 0;
    this.container.addChild(this.lampSprite);

    this.cloudSprite = new Sprite(this.cloudTexture);
    this.cloudSprite.anchor.set(0.5);
    this.cloudSprite.alpha = 0;
    this.container.addChild(this.cloudSprite);
  }

  /** `reduceMotion` (#153's accessibility toggle) skips the drifting cloud entirely — it is a slow, non-essential background motion, not a mechanic. */
  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    if (reducedMotion) {
      this.cloudSprite.alpha = 0;
    }
  }

  onRoomChanged(room: RoomRect, floorNumber: number): void {
    this.room = room;
    this.floorNumber = floorNumber;

    if (floorNumber === KELLER_FLOOR) {
      const lamp = lampPlacement(room);
      this.lampSprite.position.set(lamp.x, lamp.y);
      this.lampSprite.width = lamp.width;
      this.lampSprite.height = lamp.height;
      this.lampSprite.alpha = 1;
    } else {
      this.lampSprite.alpha = 0;
    }

    if (floorNumber !== DORF_FLOOR) {
      this.cloudSprite.alpha = 0;
    }
  }

  sync(tick: number): void {
    if (this.floorNumber !== DORF_FLOOR || this.reducedMotion) {
      this.cloudSprite.alpha = 0;
      return;
    }
    const state = cloudShadowState(tick);
    this.cloudSprite.alpha = state.alpha;
    if (state.visible) {
      const placement = cloudPlacement(this.room, state.progress);
      this.cloudSprite.position.set(placement.x, placement.y);
      this.cloudSprite.width = placement.width;
      this.cloudSprite.height = placement.height;
    }
  }
}
