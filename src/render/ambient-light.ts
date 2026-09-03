import { Container, Sprite, Texture } from 'pixi.js';
import type { RoomRect } from '../sim/room/geometry.js';
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
 * The room span both `lampPlacement` and `cloudPlacement` size their sprite
 * against never exceeds one screen's worth of world units — the same
 * `viewWidth`/`viewHeight` `GameView.followOffset` computes the camera's pan
 * range from (#243). A `1x1` room's own span already sits under this, so the
 * clamp is a no-op there and nothing about either floor's original
 * single-screen rooms changes; a `2x2`/`L`/`T` room (`sim/room/geometry.ts`'s
 * `voidRects`) is wider and/or taller than one screen, and sizing a sprite
 * off its full span there produced a falloff several screens wide — soft-
 * edged in its own texture, but the blur/gradient is a fixed fraction of the
 * *texture*, so stretched that far it reads as a hard-edged shadow box that
 * only ever shows part of itself, and the camera panning with the player
 * made that visible slice look like it was tracking them from off-screen.
 * Reported on Floor 2 first (the cloud, easier to notice mid-drift) but the
 * exact same bug in Floor 1's static lamp falloff, sized the same uncapped
 * way — both floors generate rooms through the one shared procedural shape
 * generator (`content/floors/definition.ts`'s `ROOM_GEN_FLOOR_OVERRIDES`),
 * so neither is special-cased out of a `2x2`/`L`/`T` shape.
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
function createGlowTexture(
  rgb: string,
  innerAlpha: number,
  outerAlpha: number,
  innerStop: number,
  outerStop: number = Math.SQRT2,
): Texture {
  // No DOM at all — the frame-time benchmark (`tests/bench/scene.ts`) builds
  // a `GameView` in plain Node, same reasoning as `inked-bounds.ts`'s own
  // `scratchContext` guard.
  if (typeof document === 'undefined') {
    return Texture.EMPTY;
  }
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
    centre * outerStop,
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
function createCloudTexture(rgb: string): Texture {
  // No DOM at all — same `tests/bench` reasoning as `createGlowTexture`'s own guard.
  if (typeof document === 'undefined') {
    return Texture.EMPTY;
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

/**
 * Where and how big Floor 1's falloff sprite sits, centred on the room.
 *
 * `frame`'s own span is capped to `ROOM_SPAN_CAP_WIDTH`/`_HEIGHT` before
 * `KELLER_COVERAGE` widens it (#243) — the same clamp `cloudPlacement`
 * applies, and for the identical reason: a `2x2`/`L`/`T` room's full frame is
 * bigger than one screen, and sizing the bulb's falloff off that uncapped
 * span produced the exact same oversized "shadow box" the cloud did, just
 * static rather than drifting. Capping first and multiplying by the
 * coverage factor after keeps a `1x1` room's own falloff exactly as before
 * (its frame already sits under the cap) while a sprawling room gets a
 * normal, screen-sized pool of light instead of one stretched across
 * several screens.
 */
export function lampPlacement(room: RoomRect): Placement {
  const centre = roomCentre(room);
  const frame = frameSize(room);
  return {
    x: centre.x,
    y: centre.y,
    width: Math.min(frame.width, ROOM_SPAN_CAP_WIDTH) * KELLER_COVERAGE,
    height: Math.min(frame.height, ROOM_SPAN_CAP_HEIGHT) * KELLER_COVERAGE,
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
  const roomWidth = room.maxX - room.minX;
  const roomHeight = room.maxY - room.minY;
  const width = Math.min(roomWidth, ROOM_SPAN_CAP_WIDTH) * CLOUD_WIDTH_FRACTION;
  const height = Math.min(roomHeight, ROOM_SPAN_CAP_HEIGHT) * CLOUD_HEIGHT_FRACTION;
  const travel = roomWidth + width;
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

  private readonly lampShadowTexture: Texture;
  private readonly lampGlowTexture: Texture;
  private readonly cloudTexture: Texture;
  /** The darkening vignette — drawn first, so the additive glow painted after it never gets darkened back down. */
  private readonly lampShadowSprite: Sprite;
  /** The bulb's own warm pool of light, `blendMode: 'add'` — see `KELLER_GLOW_REACH`'s own doc comment for why it fades out well short of the shadow's own falloff. */
  private readonly lampGlowSprite: Sprite;
  private readonly cloudSprite: Sprite;
  private floorNumber = 0;
  private room: RoomRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private reducedMotion = false;

  constructor() {
    this.lampShadowTexture = createGlowTexture(
      KELLER_SHADOW_RGB,
      KELLER_CENTRE_ALPHA,
      KELLER_EDGE_ALPHA,
      KELLER_INNER_STOP,
    );
    this.lampGlowTexture = createGlowTexture(
      KELLER_GLOW_RGB,
      KELLER_GLOW_PEAK_ALPHA,
      0,
      KELLER_INNER_STOP,
      KELLER_GLOW_REACH,
    );
    this.cloudTexture = createCloudTexture(CLOUD_SHADOW_RGB);

    this.lampShadowSprite = new Sprite(this.lampShadowTexture);
    this.lampShadowSprite.anchor.set(0.5);
    this.lampShadowSprite.alpha = 0;
    this.container.addChild(this.lampShadowSprite);

    this.lampGlowSprite = new Sprite(this.lampGlowTexture);
    this.lampGlowSprite.anchor.set(0.5);
    this.lampGlowSprite.blendMode = 'add';
    this.lampGlowSprite.alpha = 0;
    this.container.addChild(this.lampGlowSprite);

    this.cloudSprite = new Sprite(this.cloudTexture);
    this.cloudSprite.anchor.set(0.5);
    this.cloudSprite.blendMode = 'multiply';
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
      this.lampShadowSprite.position.set(lamp.x, lamp.y);
      this.lampShadowSprite.width = lamp.width;
      this.lampShadowSprite.height = lamp.height;
      this.lampShadowSprite.alpha = 1;
      this.lampGlowSprite.position.set(lamp.x, lamp.y);
      this.lampGlowSprite.width = lamp.width;
      this.lampGlowSprite.height = lamp.height;
      this.lampGlowSprite.alpha = 1;
    } else {
      this.lampShadowSprite.alpha = 0;
      this.lampGlowSprite.alpha = 0;
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
