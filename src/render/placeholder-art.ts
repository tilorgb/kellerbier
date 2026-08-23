import { Graphics, type Renderer, type Texture } from 'pixi.js';

/**
 * Placeholder art, generated rather than drawn.
 *
 * Everything here is a stand-in until the art pipeline lands in #34. It is
 * generated into a texture once at boot rather than drawn as a `Graphics` per
 * entity, because a few thousand `Graphics` objects break sprite batching and
 * the draw-call budget along with it.
 */

/**
 * A hollow ring, drawn once and scaled per telegraph.
 *
 * Generated at a generous radius and scaled down rather than up, because a ring
 * scaled past its own resolution is a ring with a soft edge, and a soft warning
 * is one the player reads late.
 */
export function createRingTexture(renderer: Renderer, radius: number, color: number): Texture {
  const graphics = new Graphics();
  graphics.circle(radius, radius, radius - 1).stroke({ width: 2, color });
  const texture = renderer.generateTexture({ target: graphics, resolution: 1 });
  graphics.destroy();
  return texture;
}

/**
 * A mug outline, filled from the bottom by `fill`.
 *
 * White throughout, like the ring and blob above — the HUD tints it per pool
 * (red, soul, eternal) rather than generating a texture per colour. `fill` is
 * one of exactly three values because the health it draws is half-Maß
 * granular: a mug is empty, half, or full, never anything between.
 */
export function createMugTexture(
  renderer: Renderer,
  width: number,
  height: number,
  fill: 'empty' | 'half' | 'full',
): Texture {
  const graphics = new Graphics();
  graphics.roundRect(0.5, 0.5, width - 1, height - 1, 1.5).stroke({ width: 1, color: 0xffffff });
  if (fill !== 'empty') {
    const fillHeight = fill === 'full' ? height - 3 : (height - 3) / 2;
    graphics
      .roundRect(2, height - 1.5 - fillHeight, width - 4, fillHeight, 1)
      .fill({ color: 0xffffff });
  }
  const texture = renderer.generateTexture({ target: graphics, resolution: 1 });
  graphics.destroy();
  return texture;
}

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
