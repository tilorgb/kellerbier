/**
 * Internal resolution and integer scaling.
 *
 * The simulation and every sprite live in a fixed 640x360 pixel space. The
 * canvas is the size of the window, and the *game* inside it is scaled by a
 * whole number of device pixels, so one game pixel is always an exact NxN block
 * of screen pixels. Non-integer scaling on 32px tiles produces uneven pixel
 * widths and the art direction falls apart, so this is a hard rule rather than
 * a preference.
 *
 * The canvas is full-size rather than 640x360-and-stretched because the game is
 * not the only thing drawn on it. Debug panels, and later the menus, are text,
 * and text rendered into a 640x360 buffer has eight pixels of glyph height to
 * work with however large the window is. Those layers are drawn outside the
 * scaled container, at the display's own resolution.
 */

export const INTERNAL_WIDTH = 640;
export const INTERNAL_HEIGHT = 360;

/**
 * Whole-number zoom the room is drawn at.
 *
 * The room is authored in half the internal resolution and blown up by this,
 * which is what decides how large the player reads against the space they are
 * dodging in: a body of a fixed pixel size covers twice as much of a room half
 * the size. At 1x the player was a fortieth of the room's width and the room
 * felt enormous; at 2x they are a twentieth, which is roughly where the genre
 * sits.
 *
 * Whole-number for the same reason the canvas scale is: a sprite drawn at 1.5x
 * has some pixels one screen pixel wide and some two, and pixel art stops
 * reading as pixel art. `PLAYFIELD_WIDTH * WORLD_ZOOM === INTERNAL_WIDTH` is
 * pinned by a test.
 */
export const WORLD_ZOOM = 2;

/**
 * Internal pixels one authored sprite pixel covers, for anything that *is* a
 * thing rather than a readout: a body, a corpse, a pickup.
 *
 * One. That is the whole rule, and the point of stating it as a constant is
 * that it used to be nine different numbers.
 *
 * Before this, `EntityView` sized every body by `radius / (texture.height / 2)`
 * — on-screen size derived from the collider, with the sprite's own height as
 * the divisor. It was introduced (`docs/DECISIONS.md` #27) so a taller redraw
 * would not make a character taller on screen, and for height it did exactly
 * that. But the same factor was then applied to *width*, where nothing
 * constrained it: widening a canvas widened the body on screen one-for-one,
 * with no change to what could be hit. "Draw it with more detail" and "make it
 * bigger" were the same request, and the roster ended up drawn at twelve
 * different pixel sizes — most of them fractional, which this module's own
 * opening paragraph calls a hard rule rather than a preference. See
 * `docs/DECISIONS.md` #45.
 *
 * So: on-screen size is what was authored, and only what was authored. A
 * sprite's canvas *is* its size in internal pixels. Detail is bought by
 * drawing more of them; size is changed by drawing a bigger canvas. The two
 * questions finally have two different answers.
 */
export const ACTOR_PIXELS_PER_UNIT = WORLD_ZOOM;

/** What `ACTOR_PIXELS_PER_UNIT` means as a Pixi scale. Whole-pixel by construction. */
export const ACTOR_SPRITE_SCALE = 1 / ACTOR_PIXELS_PER_UNIT;

/**
 * The coarser grid a 16px tile draws on: covering `ROOM_TILE_UNITS` world
 * units, that is two internal pixels per authored pixel.
 *
 * Deliberately not the same as `ACTOR_SPRITE_SCALE` by default — a background
 * that repeats identically and unnoticed carries less detail than the things
 * acting in front of it. Since `docs/DECISIONS.md` #48, that is a per-tile
 * choice rather than a fixed one: `tools/art/spec.mjs` allows a tile to be
 * authored at 32x32 instead, and `render/room.ts`'s `tileRect` puts *that*
 * tile on `ACTOR_SPRITE_SCALE`'s 1:1 grid instead of this one, derived from
 * the texture's own width rather than hardcoded — so this constant still
 * describes every tile that stays at 16, which is most of them, without
 * describing all of them any more. Kept here rather than only in `room.ts`
 * so anything else drawing 16px tile art (a destructible barrel, say) can
 * draw at the same size as the identical sprite standing next to it.
 */
export const TILE_SPRITE_SCALE = 1;

export interface Viewport {
  /** Whole-number scale factor applied to the canvas element. */
  readonly scale: number;
  /** On-screen size of the scaled canvas, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Letterbox bars left over on each axis, in CSS pixels. */
  readonly letterboxX: number;
  readonly letterboxY: number;
}

/**
 * Largest whole-number scale at which the internal resolution still fits the
 * window, floored at 1 — a window smaller than 640x360 crops rather than
 * producing a blurry sub-pixel scale.
 *
 * `forcedScale`, in device pixels, is #53's Video-tab override: a player on
 * a very large display where "biggest that fits" reads uncomfortably large,
 * or one who wants more of the room visible, pins a smaller whole number
 * instead of the auto-fit maximum. Still floored at 1 and still whole —
 * `resolution.ts`'s own hard rule against a fractional scale applies to a
 * chosen scale exactly as it does to a computed one. Choosing a scale
 * larger than the window fits is allowed (the letterbox fields below simply
 * clamp to 0, i.e. the game crops) rather than silently overridden, since a
 * player who explicitly asked for it presumably has a reason.
 */
export function computeViewport(
  windowWidth: number,
  windowHeight: number,
  internalWidth: number = INTERNAL_WIDTH,
  internalHeight: number = INTERNAL_HEIGHT,
  forcedScale?: number,
): Viewport {
  const fit = Math.min(windowWidth / internalWidth, windowHeight / internalHeight);
  const scale =
    forcedScale !== undefined ? Math.max(1, Math.floor(forcedScale)) : Math.max(1, Math.floor(fit));
  const width = internalWidth * scale;
  const height = internalHeight * scale;
  return {
    scale,
    width,
    height,
    letterboxX: Math.max(0, windowWidth - width),
    letterboxY: Math.max(0, windowHeight - height),
  };
}

/**
 * Where the scaled game sits inside a full-window canvas.
 *
 * Everything here is in CSS pixels, because that is the space Pixi's stage is
 * in when the renderer is told the display's pixel ratio. The whole-number
 * constraint is applied in *device* pixels and then converted back, which is
 * the only ordering that actually holds: a scale that is a whole number of CSS
 * pixels on a 1.5x display is one and a half device pixels, and the art is
 * being resampled again.
 */
export interface GameLayout {
  /** Scale to apply to the game container, in CSS pixels. */
  readonly scale: number;
  /** Top-left of the game inside the canvas, in CSS pixels. */
  readonly originX: number;
  readonly originY: number;
}

export function computeGameLayout(
  windowWidth: number,
  windowHeight: number,
  pixelRatio = 1,
  /** #53's Video-tab scale override, in CSS pixels — `'auto'` or omitted is today's fit-to-window behaviour. */
  forcedScale?: number,
): GameLayout {
  const ratio = pixelRatio > 0 ? pixelRatio : 1;
  const viewport = computeViewport(
    windowWidth * ratio,
    windowHeight * ratio,
    INTERNAL_WIDTH,
    INTERNAL_HEIGHT,
    forcedScale === undefined ? undefined : forcedScale * ratio,
  );
  return {
    scale: viewport.scale / ratio,
    originX: Math.round(viewport.letterboxX / 2) / ratio,
    originY: Math.round(viewport.letterboxY / 2) / ratio,
  };
}
