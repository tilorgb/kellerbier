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
 */
export const ACTOR_LAYER = 1;
