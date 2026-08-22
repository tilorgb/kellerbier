import { Graphics, type Renderer, type Texture } from 'pixi.js';

/**
 * Placeholder art, generated rather than drawn.
 *
 * Everything here is a stand-in until the art pipeline lands in #34. It is
 * generated into a texture once at boot rather than drawn as a `Graphics` per
 * entity, because a few thousand `Graphics` objects break sprite batching and
 * the draw-call budget along with it.
 */

/** A filled circle with a lighter rim, the size a projectile is drawn at. */
export function createBlobTexture(
  renderer: Renderer,
  radius: number,
  fill: number,
  rim: number,
): Texture {
  const graphics = new Graphics();
  graphics.circle(radius, radius, radius).fill(fill);
  graphics.circle(radius, radius, Math.max(1, radius - 1)).stroke({ width: 1, color: rim });
  const texture = renderer.generateTexture({ target: graphics, resolution: 1 });
  graphics.destroy();
  return texture;
}
