import { DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, type Texture } from 'three';
import { ACTOR_PIXELS_PER_UNIT } from '../resolution.js';

/**
 * The lantern on the wall of a lantern room (#424): `wald-lantern`, a storm
 * lantern (`tools/art/authoring/build-wald-objects.mjs`).
 *
 * The art is in Der Wald's own greys and whites — the floor's palette has no
 * warm colour — and is tinted here instead, so the iron comes out bronze and
 * the glass the colour of the flame behind it, the way a lantern lit from
 * inside looks. Unlit: it is the light, and must not go dark with the room.
 */

/** The tile's name in the art bundle. */
export const LANTERN_TILE = 'wald-lantern';
/** The tile's canvas, in authored pixels. */
const CANVAS_WIDTH = 16;
const CANVAS_HEIGHT = 16;
/** The flame's colour, multiplied over the sprite. */
const LANTERN_TINT = 0xffb866;

/** How far above its bottom edge the sprite's centre sits, in room units — to hang it by its base. */
export const LANTERN_HALF_HEIGHT = CANVAS_HEIGHT / ACTOR_PIXELS_PER_UNIT / 2;

/** One lantern quad at the game's sprite scale, cut out by alpha. Hidden, and blank until `setLanternArt` gives it its tile. */
export function buildLanternSprite(): Mesh {
  const sprite = new Mesh(
    new PlaneGeometry(CANVAS_WIDTH / ACTOR_PIXELS_PER_UNIT, CANVAS_HEIGHT / ACTOR_PIXELS_PER_UNIT),
    new MeshBasicMaterial({
      color: LANTERN_TINT,
      alphaTest: 0.5,
      transparent: true,
      opacity: 0,
      side: DoubleSide,
      forceSinglePass: true,
      toneMapped: false,
    }),
  );
  sprite.visible = false;
  return sprite;
}

/** Gives a lantern quad its art. Without it (the headless bench, a bundle that lacks the tile) the quad stays invisible and only the light shows. */
export function setLanternArt(sprite: Mesh, texture: Texture | undefined): void {
  const material = sprite.material as MeshBasicMaterial;
  material.map = texture ?? null;
  material.opacity = texture === undefined ? 0 : 1;
  material.transparent = texture === undefined;
  material.needsUpdate = true;
}
