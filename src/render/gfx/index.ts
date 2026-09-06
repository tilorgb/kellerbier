/**
 * The 2D scene-graph vocabulary the HUD, menus and screens are written in,
 * drawn by three.js as an orthographic pass over the 3D world.
 *
 * It is deliberately the same small vocabulary those files always used —
 * `Container`, `Sprite`, `NineSliceSprite`, `BitmapText`, `Graphics`,
 * `Texture` — because the screen-space half of the game had nothing to gain
 * from being rewritten when the world went 3D; it only had to stop depending
 * on a second renderer. See `docs/DECISIONS.md` on the switch to one renderer.
 */
export { Container, ObservablePoint, type PointLike, type PointerEventName } from './container.js';
export { Graphics, type FillStyle, type StrokeStyle } from './graphics.js';
export { UiLayer } from './layer.js';
export { NineSliceSprite, QuadGeometry, Sprite, flatMaterial } from './sprite.js';
export {
  BitmapText,
  BitmapTextStyle,
  type BitmapFont,
  type BitmapGlyph,
  type BitmapTextStyleOptions,
  bitmapFontInstalled,
  installedBitmapFontCount,
  registerBitmapFont,
} from './text.js';
export {
  Rectangle,
  Texture,
  TextureSource,
  loadTexture,
  textureFromImage,
  textureFromPixels,
  textureFromRgba,
} from './texture.js';
