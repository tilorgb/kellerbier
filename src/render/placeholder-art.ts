import { Container, Graphics, Sprite, type Renderer, type Texture } from 'pixi.js';
import { STRUCTURAL_WHITE } from './palette.js';

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
 * A wedge, tip at the texture's left edge and pointing along +x — the shape
 * a directional telegraph (a charge's line, a melee swing's arc, #233)
 * scales non-uniformly out of rather than redrawing per attack: `scale.x`
 * sets how far it reaches, `scale.y` sets how wide, and because the wedge's
 * two edges are straight rather than a true arc, scaling `y` by `k` turns a
 * `halfAngle` wedge into one of `atan(k * tan(halfAngle))` exactly — good for
 * any width the roster ever authors, not just the one this is generated at.
 * Anchor the sprite at `(0, 0.5)` so the tip sits on the body and `rotation`
 * points it at the aim direction.
 */
export function createWedgeTexture(
  renderer: Renderer,
  length: number,
  halfAngle: number,
  color: number,
): Texture {
  const halfWidth = length * Math.tan(halfAngle);
  const graphics = new Graphics()
    .moveTo(0, halfWidth)
    .lineTo(length, 0)
    .lineTo(length, halfWidth * 2)
    .closePath()
    .fill({ color });
  const texture = renderer.generateTexture({ target: graphics, resolution: 1 });
  graphics.destroy();
  return texture;
}

/** A dark outline behind every marker shape, so a pure-white marker still reads against pale shot art. */
const MARKER_OUTLINE_COLOR = 0x000000;

/**
 * A small filled dot with a dark ring around it — half of #53's
 * colourblind-safe projectile marker (`docs/GAME_DESIGN.md` §12), drawn as a
 * texture rather than a per-shot `Graphics` for the same batching reason
 * this whole file exists for. `color` is pure white by convention (the
 * marker's job is a brightness/shape cue that reads regardless of whatever
 * hue the shot underneath it carries), and the dark ring is what keeps that
 * true even against shot art that is *itself* pale — the beer shot's own
 * highlight, say — where a plain white-on-white fill would vanish.
 */
export function createDotMarkerTexture(renderer: Renderer, radius: number, color: number): Texture {
  const graphics = new Graphics()
    .circle(radius, radius, radius)
    .fill({ color: MARKER_OUTLINE_COLOR })
    .circle(radius, radius, radius - 2)
    .fill({ color });
  const texture = renderer.generateTexture({ target: graphics, resolution: 1 });
  graphics.destroy();
  return texture;
}

/**
 * A small outlined diamond, also dark-ringed — the other half of #53's
 * marker pair (`ProjectileTeam.Enemy`'s shape, `createDotMarkerTexture`'s
 * doc comment covers `ProjectileTeam.Player`'s and the outline's own
 * reasoning). Outlined rather than filled so the two read apart by
 * silhouette alone, not just by which one happens to be solid.
 */
export function createDiamondMarkerTexture(
  renderer: Renderer,
  radius: number,
  color: number,
): Texture {
  const path = (g: Graphics): Graphics =>
    g
      .moveTo(radius, 0)
      .lineTo(radius * 2, radius)
      .lineTo(radius, radius * 2)
      .lineTo(0, radius)
      .closePath();
  const graphics = path(new Graphics()).stroke({ width: 4, color: MARKER_OUTLINE_COLOR });
  path(graphics).stroke({ width: 2, color });
  const texture = renderer.generateTexture({ target: graphics, resolution: 1 });
  graphics.destroy();
  return texture;
}

/**
 * A solid-white cutout of `source`, same size and same silhouette — an
 * enemy's own hit flash, rather than the generic round `entityFlash` blob
 * every enemy used to flash as regardless of its actual shape (#37's bug
 * report: Kellerassel and Traktor both flash as a circle wider than either
 * of them). `mask` reads `source`'s alpha channel, so a narrow sprite like
 * Bierratte's stays narrow when it flashes, and only its own opaque pixels
 * turn white rather than its whole bounding box.
 *
 * Tint can't do this — it multiplies the texture underneath, and a
 * multiply can only ever make a colour darker toward the tint, never turn a
 * dark pixel white — which is `flashTexture`'s own doc comment on why the
 * game swaps textures for a flash instead of tinting one. The same
 * reasoning extends here: every enemy needs a *real* white texture of its
 * own shape, not a tint of its real one.
 */
export function createSilhouetteTexture(renderer: Renderer, source: Texture): Texture {
  const fill = new Graphics().rect(0, 0, source.width, source.height).fill(STRUCTURAL_WHITE);
  const mask = new Sprite(source);
  fill.mask = mask;
  const container = new Container();
  container.addChild(fill, mask);
  const texture = renderer.generateTexture({ target: container, resolution: 1 });
  container.destroy({ children: true });
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
  graphics
    .roundRect(0.5, 0.5, width - 1, height - 1, 1.5)
    .stroke({ width: 1, color: STRUCTURAL_WHITE });
  if (fill !== 'empty') {
    const fillHeight = fill === 'full' ? height - 3 : (height - 3) / 2;
    graphics
      .roundRect(2, height - 1.5 - fillHeight, width - 4, fillHeight, 1)
      .fill({ color: STRUCTURAL_WHITE });
  }
  const texture = renderer.generateTexture({ target: graphics, resolution: 1 });
  graphics.destroy();
  return texture;
}

/** A thin rectangular outline — the frame for a fill bar (Promille meter, later cooldowns). */
export function createBarOutlineTexture(
  renderer: Renderer,
  width: number,
  height: number,
): Texture {
  const graphics = new Graphics();
  graphics
    .roundRect(0.5, 0.5, width - 1, height - 1, 1)
    .stroke({ width: 1, color: STRUCTURAL_WHITE });
  const texture = renderer.generateTexture({ target: graphics, resolution: 1 });
  graphics.destroy();
  return texture;
}

/**
 * A 1x1 solid square, meant to be stretched. A bar fill is a `Sprite` whose
 * `width` is set per-frame rather than a `Graphics` redrawn per-frame, so the
 * bar reads the way the rest of this file batches: one draw call, not one
 * shape rebuild, every tick the value changes.
 */
export function createSolidTexture(renderer: Renderer): Texture {
  const graphics = new Graphics();
  graphics.rect(0, 0, 1, 1).fill({ color: STRUCTURAL_WHITE });
  const texture = renderer.generateTexture({ target: graphics, resolution: 1 });
  graphics.destroy();
  return texture;
}

/**
 * A filled diamond (rotated square) — the minimap's treasure-room icon.
 *
 * Distinct silhouette from the boss triangle and shop circle on purpose: the
 * "no information by colour alone" acceptance criterion on #21 applies to
 * icons as much as to fills, so shape carries the meaning and colour is
 * decoration on top of it.
 */
export function createDiamondTexture(renderer: Renderer, radius: number, color: number): Texture {
  const graphics = new Graphics();
  graphics
    .moveTo(radius, 0)
    .lineTo(radius * 2, radius)
    .lineTo(radius, radius * 2)
    .lineTo(0, radius)
    .closePath()
    .fill({ color });
  const texture = renderer.generateTexture({ target: graphics, resolution: 1 });
  graphics.destroy();
  return texture;
}

/** A filled upward triangle — the minimap's boss-room icon. */
export function createTriangleTexture(renderer: Renderer, radius: number, color: number): Texture {
  const graphics = new Graphics();
  graphics
    .moveTo(radius, 0)
    .lineTo(radius * 2, radius * 2)
    .lineTo(0, radius * 2)
    .closePath()
    .fill({ color });
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
