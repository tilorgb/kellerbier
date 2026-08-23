import { Application, type Container, TextureSource } from 'pixi.js';
import { type GameLayout, computeGameLayout } from './resolution.js';

/** The colour behind everything — cellar dark, not black. */
export const BACKGROUND_COLOUR = 0x14101a;

/**
 * Boots Pixi at the window's own resolution and mounts its canvas in `host`.
 *
 * The backing store is the size of the window rather than the game's 640x360.
 * The game is drawn into a container scaled by a whole number of device pixels,
 * so the art is still one game pixel to an exact NxN block; what the full-size
 * canvas buys is everything drawn *outside* that container — debug panels now,
 * menus later — rendering at the display's resolution instead of at eight
 * pixels of glyph height.
 *
 * Every texture defaults to nearest-neighbour filtering: no smoothing is applied
 * to any texture anywhere in the game, ever.
 */
export async function createRenderer(host: HTMLElement): Promise<Application> {
  TextureSource.defaultOptions.scaleMode = 'nearest';

  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    background: BACKGROUND_COLOUR,
    antialias: false,
    roundPixels: true,
    // The renderer is told the display's pixel ratio and sizes its own backing
    // store from it, which is what makes text land on real device pixels.
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
  });

  const canvas = app.canvas;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';
  host.appendChild(canvas);

  return app;
}

/**
 * Sizes and centres the game container for a window.
 *
 * Returns the layout it applied, because the same numbers convert a mouse
 * position into a place in the room and nothing else knows them.
 */
export function applyGameLayout(
  game: Container,
  windowWidth: number,
  windowHeight: number,
  pixelRatio = 1,
): GameLayout {
  const layout = computeGameLayout(windowWidth, windowHeight, pixelRatio);
  game.scale.set(layout.scale);
  game.position.set(layout.originX, layout.originY);
  return layout;
}

/**
 * Keeps the canvas filling the window and the game at a whole-number scale
 * inside it. Returns a teardown function.
 */
export function trackWindowSize(
  app: Application,
  game: Container,
  onLayout: (layout: GameLayout) => void,
): () => void {
  const onResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = window.devicePixelRatio || 1;
    app.renderer.resolution = ratio;
    app.renderer.resize(width, height);
    onLayout(applyGameLayout(game, width, height, ratio));
  };
  onResize();
  window.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
  };
}
