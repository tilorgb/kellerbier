import { Sprite, type Texture } from 'pixi.js';
import { GROUND_SHADOW } from './palette.js';
import { inkedBottomY } from './inked-bounds.js';

/**
 * The one place the "everything the player interacts with on the floor casts a
 * shadow" rule (`docs/DECISIONS.md` #61) turns into pixels.
 *
 * Before this, three renderers each did their own slightly different version
 * of it: `EntityView` for enemies/pickups, `PlayerView` for Alois, and a
 * hardcoded wider ellipse for a boss — with the destructible targets in
 * `EntityView`, the placed Bierfassl and the planted Maibaum casting nothing
 * at all. This function is what they all call now, so the shadow under a
 * barrel matches the one under the enemy standing next to it.
 *
 * It does not position the sprite — the caller owns that, because "the body's
 * feet" is in a different coordinate space for each of them (a child of the
 * player container at local `(0, …)`, a world-space entry in `EntityView`'s
 * shadow layer, the Maibaum at its own base). `groundShadowFeetY` is the
 * shared bit of that maths for anything drawn centre-anchored.
 */

export type GroundShadowWeight = 'body' | 'boss';

/**
 * Sizes and tints `shadow` to an ellipse `shadowWidth` world units across.
 * The caller passes the *real* width the shadow should read at — narrower
 * than the sprite's padded canvas, wider for a big body — because the canvas
 * since #45 says nothing about the footprint. Anchor is centred; the caller
 * sets `position`.
 */
export function styleGroundShadow(
  shadow: Sprite,
  texture: Texture,
  shadowWidth: number,
  weight: GroundShadowWeight = 'body',
): void {
  shadow.texture = texture;
  shadow.anchor.set(0.5);
  shadow.visible = true;
  const width = Math.max(1, shadowWidth);
  const texW = texture.width || 1;
  const texH = texture.height || 1;
  shadow.scale.set(width / texW, (width * GROUND_SHADOW.aspect) / texH);
  shadow.alpha = weight === 'boss' ? GROUND_SHADOW.bossAlpha : GROUND_SHADOW.bodyAlpha;
}

/** A ready-made centred shadow sprite — for renderers that keep their own pool of them. */
export function createGroundShadow(texture: Texture): Sprite {
  const shadow = new Sprite(texture);
  shadow.anchor.set(0.5);
  return shadow;
}

/**
 * World Y a body's shadow centre sits at: under the **last opaque row of its
 * art**, not its canvas edge and not its collider (`docs/DECISIONS.md` #61).
 *
 * `sprite` is drawn centre-anchored at `centreY` and scaled by `scale`
 * (authored pixel → world unit), so the drawing's bottom edge is
 * `(inkedBottomY - frameHeight / 2) * scale` below the centre.
 * `GROUND_SHADOW.contactInset` then lifts it a hair so the ellipse straddles
 * the contact line rather than hanging entirely below the feet.
 */
export function groundShadowFeetY(centreY: number, texture: Texture, scale: number): number {
  const drawnBottom = (inkedBottomY(texture) - texture.frame.height / 2) * scale;
  return centreY + drawnBottom - GROUND_SHADOW.contactInset;
}
