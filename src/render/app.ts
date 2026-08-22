import { Application, TextureSource } from 'pixi.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, computeViewport } from './resolution.js';

/** The colour behind everything — cellar dark, not black. */
export const BACKGROUND_COLOUR = 0x14101a;

/**
 * Boots Pixi at the fixed internal resolution and mounts its canvas in `host`.
 *
 * Every texture defaults to nearest-neighbour filtering: no smoothing is applied
 * to any texture anywhere in the game, ever.
 */
export async function createRenderer(host: HTMLElement): Promise<Application> {
  TextureSource.defaultOptions.scaleMode = 'nearest';

  const app = new Application();
  await app.init({
    width: INTERNAL_WIDTH,
    height: INTERNAL_HEIGHT,
    background: BACKGROUND_COLOUR,
    antialias: false,
    roundPixels: true,
    // The backing store stays at the internal resolution; scaling is done by
    // the CSS transform in `applyViewport`, so device pixel ratio must not
    // secretly resize the canvas underneath us.
    resolution: 1,
    autoDensity: false,
    preference: 'webgl',
  });

  const canvas = app.canvas;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';
  host.appendChild(canvas);

  return app;
}

/** Sizes the canvas element to the largest integer scale the window allows. */
export function applyViewport(
  canvas: HTMLCanvasElement,
  windowWidth: number,
  windowHeight: number,
): void {
  const viewport = computeViewport(windowWidth, windowHeight);
  canvas.style.width = `${String(viewport.width)}px`;
  canvas.style.height = `${String(viewport.height)}px`;
}

/**
 * Keeps the canvas at an integer scale as the window resizes.
 * Returns a teardown function.
 */
export function trackWindowSize(canvas: HTMLCanvasElement): () => void {
  const onResize = (): void => {
    applyViewport(canvas, window.innerWidth, window.innerHeight);
  };
  onResize();
  window.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
  };
}
