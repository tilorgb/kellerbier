/**
 * Render layers.
 *
 * Everything is on the default layer 0. Things that *stand in the room* — every
 * character, pickup, corpse, boulder, prop, projectile and particle — are also
 * put on `ACTOR_LAYER`, and `GameView.render` draws that layer a second time,
 * over the room architecture with the depth buffer cleared.
 *
 * Why: a standing sprite is a quad leaned back by the camera's elevation, so at
 * 65° it lies almost flat and its head sits ~14 units *north* of its feet — well
 * inside the back wall's box. A single 3D pass has the wall's depth eat the
 * head. The second pass composites the sprites on top of the room the way the
 * 2D renderer's painter's-order draw did; within the pass they still sort
 * against each other by depth, so one body still stands behind another.
 *
 * Clearing the depth buffer for that whole second pass is what fixes the
 * north-wall head-clip, but taken alone it throws out *every* wall's
 * occlusion, not just the one causing the problem — a body standing right at
 * the south (or east/west) wall, which is *closer* to the camera than the
 * room behind it, should read as partly hidden behind it the way a real
 * foreground wall would. The lean only ever pushes a sprite's head *north*
 * (further from the camera), so only wall/void geometry a body can stand
 * immediately south of — the room's own north wall, and any `voidRects` box
 * that reaches the interior's north edge — carries the head-clip risk. Every
 * other wall is safe to occlude actors normally, so it also carries
 * `OCCLUDER_LAYER`: `GameView.render` depth-only-renders that layer into the
 * cleared buffer before drawing actors, so they depth-test against it without
 * the north wall ever being part of that test.
 */
export const ACTOR_LAYER = 1;

/** See `ACTOR_LAYER`'s doc comment: wall/void geometry safe to occlude a standing sprite. */
export const OCCLUDER_LAYER = 2;
