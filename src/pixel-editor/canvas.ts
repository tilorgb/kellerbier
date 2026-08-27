import type { PixelEditorState } from './state.js';

const DEFAULT_ZOOM = 16;

/** TS does not retain a nullability narrowing across a later closure boundary (`render` below), even for a `const` — resolving through a function whose return type is already non-null sidesteps that rather than re-asserting at every call site. */
function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('2D canvas context unavailable');
  }
  return ctx;
}
/** How dim the previous frame reads behind the active one — visible enough to trace, faint enough not to be mistaken for real content. */
const ONION_SKIN_ALPHA = 0.35;

export interface GridHandle {
  destroy(): void;
}

/**
 * The pixel canvas itself: a real `<canvas>` (not the room editor's
 * absolutely-positioned `<div>` grid, since a sprite is bitmap data rather
 * than a handful of typed cells) zoomed up with `image-rendering: pixelated`
 * so painting one authored pixel reads as a crisp square rather than a
 * blurred scale artifact.
 *
 * Painting only ever calls `state.paintPixel`, which only ever writes
 * `state.selectedColor` (itself only ever set from the palette panel's
 * swatches) or fully-transparent — see `docs/DECISIONS.md` #24's "there is
 * no off-palette pixel to lint for after the fact, because the picker never
 * offers one".
 */
export function createGridPanel(
  state: PixelEditorState,
  host: HTMLElement,
  zoom = DEFAULT_ZOOM,
): GridHandle {
  const wrap = document.createElement('div');
  wrap.className = 'kb-pixel-canvas-wrap';
  host.appendChild(wrap);

  const canvas = document.createElement('canvas');
  canvas.className = 'kb-pixel-canvas';
  wrap.appendChild(canvas);

  const ctx = get2dContext(canvas);
  ctx.imageSmoothingEnabled = false;

  // One reusable offscreen canvas per layer — `putImageData` replaces pixels
  // outright and ignores `globalAlpha`, so dimming the onion-skin layer and
  // properly alpha-compositing the active layer on top both need a
  // `drawImage` pass from an offscreen source instead.
  const onionLayer = document.createElement('canvas');
  const onionCtx = get2dContext(onionLayer);
  const activeLayer = document.createElement('canvas');
  const activeCtx = get2dContext(activeLayer);

  let painting = false;

  function sizeCanvases(): void {
    for (const target of [canvas, onionLayer, activeLayer]) {
      target.width = state.width;
      target.height = state.height;
    }
    canvas.style.width = `${String(state.width * zoom)}px`;
    canvas.style.height = `${String(state.height * zoom)}px`;
    canvas.style.backgroundSize = `${String(zoom)}px ${String(zoom)}px`;
  }

  function render(): void {
    sizeCanvases();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const onionFrame = state.onionSkinFrame;
    if (onionFrame !== null) {
      onionCtx.putImageData(
        new ImageData(new Uint8ClampedArray(onionFrame), state.width, state.height),
        0,
        0,
      );
      ctx.globalAlpha = ONION_SKIN_ALPHA;
      ctx.drawImage(onionLayer, 0, 0);
      ctx.globalAlpha = 1;
    }

    activeCtx.clearRect(0, 0, activeLayer.width, activeLayer.height);
    activeCtx.putImageData(
      new ImageData(new Uint8ClampedArray(state.activeFrame), state.width, state.height),
      0,
      0,
    );
    ctx.drawImage(activeLayer, 0, 0);
  }

  function pixelFromEvent(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.floor((event.clientX - rect.left) * scaleX),
      y: Math.floor((event.clientY - rect.top) * scaleY),
    };
  }

  function paintFromEvent(event: PointerEvent): void {
    const { x, y } = pixelFromEvent(event);
    state.paintPixel(x, y);
  }

  function onPointerDown(event: PointerEvent): void {
    painting = true;
    canvas.setPointerCapture(event.pointerId);
    paintFromEvent(event);
  }
  function onPointerMove(event: PointerEvent): void {
    if (painting) {
      paintFromEvent(event);
    }
  }
  function onPointerUp(event: PointerEvent): void {
    painting = false;
    canvas.releasePointerCapture(event.pointerId);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  // Pixel art is drawn one pixel at a time; the browser's own drag-to-select
  // gesture on a canvas element is never wanted here.
  canvas.addEventListener('dragstart', (event) => {
    event.preventDefault();
  });
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  const unsubscribe = state.subscribe(render);
  render();

  return {
    destroy(): void {
      unsubscribe();
      wrap.remove();
    },
  };
}
