import { Application, type Container, TextureSource } from 'pixi.js';
import { type GameLayout, computeGameLayout } from './resolution.js';

/** The colour behind everything — cellar dark, not black. */
export const BACKGROUND_COLOUR = 0x14101a;

/**
 * `host`'s own box in CSS pixels — what the renderer is sized to, rather than
 * `window.innerWidth`/`innerHeight` directly. `host` fills the whole window
 * in the shipped game, so historically the two were interchangeable; they
 * stop being the same the moment `host` shares the window with anything else
 * (`app/editor-dock.ts`'s split view puts an iframe panel next to it), and a
 * host not yet laid out (0x0, vanishingly rare but not impossible for the
 * very first read) falls back to the window rather than booting a zero-size
 * renderer.
 */
function hostBox(host: HTMLElement): { width: number; height: number } {
  const rect = host.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Boots Pixi at `host`'s own resolution and mounts its canvas in it.
 *
 * The backing store is the size of `host` rather than the game's 640x360.
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

  const { width, height } = hostBox(host);
  const app = new Application();
  await app.init({
    width,
    height,
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
 * Returns the layout it applied, because the HUD and other screen-space
 * overlays need the same numbers to position themselves and nothing else
 * knows them.
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
 * Keeps the canvas filling `host` and the game at a whole-number scale
 * inside it. Returns a teardown function.
 *
 * A `ResizeObserver` on `host` rather than a `window` `resize` listener:
 * a window resize always changes `host`'s own box too, so this still covers
 * that case, but it *also* covers `host` changing size on its own — the
 * split view's divider being dragged, or its panel opening/closing — which a
 * `window`-only listener would never see since the window itself hasn't
 * resized.
 */
export function trackWindowSize(
  app: Application,
  game: Container,
  host: HTMLElement,
  onLayout: (layout: GameLayout) => void,
): () => void {
  const onResize = (): void => {
    const { width, height } = hostBox(host);
    const ratio = window.devicePixelRatio || 1;
    app.renderer.resolution = ratio;
    app.renderer.resize(width, height);
    onLayout(applyGameLayout(game, width, height, ratio));
  };
  onResize();
  const observer = new ResizeObserver(onResize);
  observer.observe(host);
  return () => {
    observer.disconnect();
  };
}
