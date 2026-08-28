import type { PixelEditorState } from './state.js';

/**
 * Zoom fits the canvas to roughly this many CSS pixels on its longer side,
 * rather than a single fixed factor — `docs/DECISIONS.md` #26 raised the
 * boss ceiling to 160×160, and 160 at the old fixed 16x zoom is a
 * 2560×2560px canvas: technically scrollable (`.kb-pixel-canvas-wrap`'s
 * `overflow: auto`) but useless for actually drawing, since most of the
 * sprite is off-screen at any one time. A 16×16 tile still lands near its
 * old fixed zoom (512/16 = 32, close enough to the old 16 to feel familiar);
 * a 160×160 boss lands at 3x instead, which actually fits.
 */
const TARGET_CANVAS_PX = 512;
const MIN_ZOOM = 2;
const MAX_ZOOM = 32;

function zoomFor(width: number, height: number): number {
  const fit = Math.floor(TARGET_CANVAS_PX / Math.max(width, height));
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
}

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
  /** Sets the canvas's own background colour — what shows through a transparent pixel. `null` restores the default dark theme background. */
  setBackgroundColor(color: string | null): void;
}

/**
 * The pixel canvas itself: a real `<canvas>` (not the room editor's
 * absolutely-positioned `<div>` grid, since a sprite is bitmap data rather
 * than a handful of typed cells) zoomed up with `image-rendering: pixelated`
 * so painting one authored pixel reads as a crisp square rather than a
 * blurred scale artifact.
 *
 * Painting calls `state.paintPixel` (writes `state.selectedColor`, itself
 * only ever set from the palette panel's swatches, or fully-transparent) or,
 * for the `shade` tool, `state.shadeArea` (nudges already-painted pixels
 * along `palette.mjs`'s derived shade ramps) — see `docs/DECISIONS.md` #25's
 * "there is no off-palette pixel to lint for after the fact, because the
 * picker never offers one", extended by #28 to the shading brush's derived
 * tones instead of hand-picked ones.
 */
export function createGridPanel(state: PixelEditorState, host: HTMLElement): GridHandle {
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
    const zoom = zoomFor(state.width, state.height);
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
    if (state.tool === 'shade') {
      state.shadeArea(x, y);
    } else {
      state.paintPixel(x, y);
    }
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
    setBackgroundColor(color: string | null): void {
      canvas.style.backgroundColor = color ?? '';
    },
  };
}
