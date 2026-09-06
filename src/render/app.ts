import { SRGBColorSpace, WebGLRenderer } from 'three';
import { UiLayer } from './gfx/index.js';
import { APP_BACKGROUND_COLOUR } from './palette.js';
import {
  type GameLayout,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  computeGameLayout,
} from './resolution.js';

/**
 * Booting the one renderer and mounting its canvas.
 *
 * ## One canvas, two passes
 *
 * The world is a three.js scene drawn with a perspective camera; the HUD,
 * menus and screens are a 2D tree (`render/gfx/`) drawn over it with an
 * orthographic camera in the same frame. One `WebGLRenderer`, one canvas, two
 * `render()` calls a frame — the second without clearing.
 *
 * ## The canvas is the internal frame
 *
 * The canvas is exactly `INTERNAL_WIDTH × INTERNAL_HEIGHT` device pixels and
 * CSS scales it up by a whole number (`computeGameLayout`), nearest-neighbour.
 * That is the same integer-upscale contract `resolution.ts` always had, with
 * the scaling moved from a Pixi container onto the element: every texel of
 * pixel art lands on a whole block of screen pixels, lighting and shadows get
 * the same chunky grain as the sprites they fall on, and the GPU draws a
 * 640×360 image whatever the monitor is.
 *
 * The one thing this gives up is the old "HUD at display resolution" rule
 * (`render/ui/font.ts`'s doc comment used to lean on it): the HUD now draws
 * at internal pixels like everything else. It reads the same on screen — a
 * UI pixel was already one internal pixel — it just no longer gets extra
 * device pixels on a 4K monitor it could not use for pixel art anyway.
 */
export interface GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  /** The 2D pass drawn over the world. Its frame is the internal resolution. */
  readonly ui: UiLayer;
  /** Draw one frame: the caller's world pass, then the UI pass. */
  render(world: () => void): void;
  destroy(): void;
}

function hostBox(host: HTMLElement): { width: number; height: number } {
  const rect = host.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

export function createRenderer(host: HTMLElement): GameRenderer {
  const canvas = document.createElement('canvas');
  canvas.width = INTERNAL_WIDTH;
  canvas.height = INTERNAL_HEIGHT;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';
  host.appendChild(canvas);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(INTERNAL_WIDTH, INTERNAL_HEIGHT, false);
  renderer.setClearColor(APP_BACKGROUND_COLOUR, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;

  const ui = new UiLayer();
  ui.resize(INTERNAL_WIDTH, INTERNAL_HEIGHT);

  return {
    renderer,
    canvas,
    ui,
    render(world) {
      renderer.autoClear = true;
      renderer.sortObjects = true;
      world();
      ui.render(renderer);
    },
    destroy() {
      ui.destroy();
      renderer.dispose();
      canvas.remove();
    },
  };
}

/** Scales the canvas element to `layout` — a whole number of CSS pixels per internal pixel. */
export function applyGameLayout(
  canvas: HTMLCanvasElement,
  hostWidth: number,
  hostHeight: number,
  pixelRatio = 1,
  forcedScale?: number,
): GameLayout {
  const layout = computeGameLayout(hostWidth, hostHeight, pixelRatio, forcedScale);
  canvas.style.width = `${String(Math.round(INTERNAL_WIDTH * layout.scale * 1000) / 1000)}px`;
  canvas.style.height = `${String(Math.round(INTERNAL_HEIGHT * layout.scale * 1000) / 1000)}px`;
  return layout;
}

export interface WindowSizeTracker {
  dispose(): void;
  relayout(): void;
}

/**
 * Keeps the canvas scaled to `host`'s box. Observes the host, not the
 * window: the editor dock (`app/editor-dock.ts`) shrinks the game pane
 * without the window changing.
 */
export function trackWindowSize(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  onLayout: (layout: GameLayout) => void,
  getForcedScale?: () => number | undefined,
): WindowSizeTracker {
  const onResize = (): void => {
    const { width, height } = hostBox(host);
    const ratio = window.devicePixelRatio || 1;
    onLayout(applyGameLayout(canvas, width, height, ratio, getForcedScale?.()));
  };
  onResize();
  const observer = new ResizeObserver(onResize);
  observer.observe(host);
  return {
    dispose: () => {
      observer.disconnect();
    },
    relayout: onResize,
  };
}

/**
 * Converts a CSS-pixel point on the canvas into internal pixels — the frame
 * both the UI layer and the world camera's viewport are measured in.
 */
export function canvasToFrame(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  out: { x: number; y: number },
): void {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? INTERNAL_WIDTH / rect.width : 1;
  const scaleY = rect.height > 0 ? INTERNAL_HEIGHT / rect.height : 1;
  out.x = (clientX - rect.left) * scaleX;
  out.y = (clientY - rect.top) * scaleY;
}
