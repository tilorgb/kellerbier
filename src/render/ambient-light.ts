import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { RoomRect } from '../sim/room/geometry.js';
import { TICKS_PER_SECOND } from '../sim/time.js';

/**
 * Ambient per-floor lighting, world-space so it pans and shakes with the room
 * rather than the screen (contrast `render/vignette.ts`, which follows the
 * player). Two effects, one per authored floor, both requested as a "nice
 * touch" rather than a mechanic — neither reads `GameSim` state beyond the
 * floor number and the tick counter, and neither can affect a replay.
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
const KELLER_SHADOW_COLOUR = 'rgba(12, 9, 6, 1)';
const KELLER_SHADOW_FILL = 0x0c0906;
/** Cool, desaturated blue-grey — a cloud's shadow, not a storm front. */
const CLOUD_SHADOW_COLOUR = 'rgba(28, 40, 52, 1)';

/**
 * How much of the gradient's radius stays fully transparent before the fade
 * to `KELLER_SHADOW_COLOUR` begins. Small: `KELLER_CENTRE_ALPHA` already
 * carries "the whole cellar is darker," so the gradient's own job is just the
 * extra edge falloff, and a small flat centre keeps that falloff reading as
 * continuous rather than a hard-edged disc.
 */
const KELLER_INNER_STOP = 0.08;
/** The cellar's uniform darkening, present everywhere including dead centre. */
const KELLER_CENTRE_ALPHA = 0.16;
/** Total darkening at the gradient's outer edge — `KELLER_CENTRE_ALPHA` plus the falloff's own share. */
const KELLER_EDGE_ALPHA = 0.62;
/**
 * The gradient sprite's size relative to the room's own interior span.
 * Bigger than `1` so the falloff's outer edge sits past the room's real
 * edge rather than exactly on it — the wall midpoints read as dim rather
 * than pitch black, and the corners (further out on both axes) are what
 * actually reaches `KELLER_EDGE_ALPHA`, which is the "brightest in the
 * centre, darkest in the corners" read a single bulb overhead actually has.
 */
const KELLER_COVERAGE = 1.5;

const CLOUD_INNER_STOP = 0.15;
/** Never more than this much shadow — "very subtle... shouldn't disturb." */
const CLOUD_MAX_ALPHA = 0.14;
/** How wide/tall the shadow patch is relative to the room, less than `1` so it reads as a discrete cloud rather than the whole sky dimming at once. */
const CLOUD_WIDTH_FRACTION = 0.9;
const CLOUD_HEIGHT_FRACTION = 0.75;
/** How often a cloud starts crossing. Long enough that "occasional" is the honest word for it. */
const CLOUD_CYCLE_TICKS = TICKS_PER_SECOND * 50;
/** How long one crossing takes, start to finish — a slow drift, not a blink. */
const CLOUD_CROSS_TICKS = TICKS_PER_SECOND * 16;
/** Fraction of the crossing spent fading in and, mirrored, fading out — no hard pop at either end. */
const CLOUD_FADE_FRACTION = 0.25;

/**
 * A square radial-gradient texture: transparent out to `innerStop` (a
 * fraction of the radius), fading to opaque `colour` at the edge. Generated
 * once via `<canvas>`, same reasoning as `vignette.ts`'s own gradient — a
 * soft radial fade is a Canvas 2D gradient, not a shape, and not worth a
 * shader. Kept local rather than shared with `Vignette`: the two callers
 * want different edge colours baked into the pixels, and a shared helper
 * would just move the parameter around rather than remove any real
 * duplication.
 */
function createRadialFadeTexture(innerStop: number, colour: string, size = 512): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    // No 2D context is a headless/test environment, not a real failure.
    return Texture.from(canvas);
  }
  const centre = size / 2;
  const transparent = colour.replace(/[\d.]+\)$/, '0)');
  // Canvas gradients paint their last stop's colour for every radius past it
  // rather than stopping there, so an outer radius short of the texture's own
  // corner leaves the four corners a flat, fully-opaque block once stretched
  // onto a sprite whose bounds aren't cropped away (as `Vignette`'s oversized
  // sprite happens to crop its own). Ending the fade at the corner radius
  // instead means the gradient still has somewhere to go all the way out to
  // every pixel this texture can be stretched to.
  const outerRadius = centre * Math.SQRT2;
  const gradient = context.createRadialGradient(
    centre,
    centre,
    size * innerStop,
    centre,
    centre,
    outerRadius,
  );
  gradient.addColorStop(0, transparent);
  gradient.addColorStop(1, colour);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
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

/** Where and how big Floor 1's falloff sprite sits, centred on the room. */
export function lampPlacement(room: RoomRect): Placement {
  const centre = roomCentre(room);
  return {
    x: centre.x,
    y: centre.y,
    width: (room.maxX - room.minX) * KELLER_COVERAGE,
    height: (room.maxY - room.minY) * KELLER_COVERAGE,
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
  private readonly baseDarken = new Graphics();
  private readonly lampSprite: Sprite;
  private readonly cloudSprite: Sprite;
  private floorNumber = 0;
  private room: RoomRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private reducedMotion = false;

  constructor() {
    this.lampTexture = createRadialFadeTexture(KELLER_INNER_STOP, KELLER_SHADOW_COLOUR);
    this.cloudTexture = createRadialFadeTexture(CLOUD_INNER_STOP, CLOUD_SHADOW_COLOUR);

    this.container.addChild(this.baseDarken);

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

    this.baseDarken.clear();
    if (floorNumber === KELLER_FLOOR) {
      this.baseDarken
        .rect(room.minX, room.minY, room.maxX - room.minX, room.maxY - room.minY)
        .fill(KELLER_SHADOW_FILL);
      this.baseDarken.alpha = KELLER_CENTRE_ALPHA;
      const lamp = lampPlacement(room);
      this.lampSprite.position.set(lamp.x, lamp.y);
      this.lampSprite.width = lamp.width;
      this.lampSprite.height = lamp.height;
      this.lampSprite.alpha = KELLER_EDGE_ALPHA - KELLER_CENTRE_ALPHA;
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
