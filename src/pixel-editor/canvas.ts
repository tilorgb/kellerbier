import type { PixelEditorState } from './state.js';

/**
 * The "fit" zoom (no wheel zoom applied yet) targets the smaller of the
 * host column's actual measured width and a fraction of the window's
 * height, not a single fixed constant — a fixed 512px target (this
 * function's previous shape) is exactly `.kb-pixel-canvas-wrap`'s own
 * fixed footprint regardless of how much room is actually available, which
 * is fine in this page's own full-width tab but wrong the moment it's
 * docked narrow (`app/editor-dock.ts`'s split view, draggable down to
 * `MIN_PANEL_WIDTH`): a 512px-wide canvas in a 280px panel either forces
 * the whole page to scroll horizontally or (worse) sits mostly out of view,
 * which is exactly the "I can't find Save/Browse below the canvas" shape a
 * boxed-in canvas produces. Capping the height too (`FIT_HEIGHT_FRACTION`)
 * keeps a tall canvas from pushing every panel below it (Palette, Frames,
 * Browse sprites) far down the page regardless of how much horizontal room
 * there is.
 */
const FIT_HEIGHT_FRACTION = 0.55;
const MIN_ZOOM = 1;
const MAX_ZOOM = 64;
/** Wheel notches needed to roughly double the zoom — small enough that one scroll tick reads as a nudge, not a jump. */
const WHEEL_ZOOM_STEP = 1.15;
const MIN_ZOOM_MULTIPLIER = 1;
const MAX_ZOOM_MULTIPLIER = 32;
/** Padding `.kb-pixel-canvas-wrap` applies on each side (`main.ts`'s STYLE) — subtracted from the host's measured width so the fit calc targets the canvas's own available box, not the wrap's outer one. */
const WRAP_PADDING_PX = 12;

function fitZoom(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
): number {
  const target = Math.max(32, Math.min(availableWidth, availableHeight));
  const fit = Math.floor(target / Math.max(width, height));
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
 *
 * Zoom is two numbers multiplied together, not one: a "fit" zoom (`fitZoom`)
 * that keeps the whole sprite visible without scrolling, recomputed whenever
 * `host` or the window resizes (`ResizeObserver` plus a `resize` listener —
 * the docked split view's divider drag changes `host`'s width without ever
 * firing a window resize, so the observer is the one that actually matters
 * day to day), and a user-driven multiplier the mouse wheel adjusts on top of
 * it, for genuinely getting in close on a boss-sized canvas. The multiplier
 * resets to 1 whenever the sprite's own dimensions change (a fresh "New" or a
 * loaded sprite) — carrying a previous sprite's zoom into a differently-sized
 * one has no reason to make sense.
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
  let zoomMultiplier = MIN_ZOOM_MULTIPLIER;
  let lastWidth = state.width;
  let lastHeight = state.height;

  function baseZoom(): number {
    const availableWidth = Math.max(32, host.clientWidth - WRAP_PADDING_PX * 2);
    const availableHeight = Math.max(32, window.innerHeight * FIT_HEIGHT_FRACTION);
    return fitZoom(state.width, state.height, availableWidth, availableHeight);
  }

  function currentZoom(): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(baseZoom() * zoomMultiplier)));
  }

  function sizeCanvases(): void {
    if (state.width !== lastWidth || state.height !== lastHeight) {
      zoomMultiplier = MIN_ZOOM_MULTIPLIER;
      lastWidth = state.width;
      lastHeight = state.height;
    }
    for (const target of [canvas, onionLayer, activeLayer]) {
      target.width = state.width;
      target.height = state.height;
    }
    const zoom = currentZoom();
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

  /**
   * Zooms in/out under the cursor rather than always from the top-left
   * corner: without re-centring on the point that was under the pointer
   * before the resize, a zoom-in on, say, the bottom-right of a boss canvas
   * would immediately scroll that spot out of view — the opposite of what
   * "zoom in for detail" is for. `wrap.scroll{Left,Top}` are content-space
   * (unaffected by the wrap's own padding), so the cursor's content-space
   * position before and after the zoom change is what has to line up.
   */
  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const cursorX = event.clientX - rect.left + wrap.scrollLeft;
    const cursorY = event.clientY - rect.top + wrap.scrollTop;
    const previousZoom = currentZoom();
    zoomMultiplier =
      event.deltaY < 0
        ? Math.min(MAX_ZOOM_MULTIPLIER, zoomMultiplier * WHEEL_ZOOM_STEP)
        : Math.max(MIN_ZOOM_MULTIPLIER, zoomMultiplier / WHEEL_ZOOM_STEP);
    sizeCanvases();
    const ratio = currentZoom() / previousZoom;
    wrap.scrollLeft = cursorX * ratio - (event.clientX - rect.left);
    wrap.scrollTop = cursorY * ratio - (event.clientY - rect.top);
  }
  wrap.addEventListener('wheel', onWheel, { passive: false });

  // A window `resize` alone misses the docked split view's divider drag,
  // which changes `host`'s width without the window itself resizing —
  // `render/app.ts`'s `trackWindowSize` picks the same `ResizeObserver`
  // approach for the identical reason.
  const resizeObserver = new ResizeObserver(sizeCanvases);
  resizeObserver.observe(host);
  window.addEventListener('resize', sizeCanvases);

  const unsubscribe = state.subscribe(render);
  render();

  return {
    destroy(): void {
      resizeObserver.disconnect();
      window.removeEventListener('resize', sizeCanvases);
      wrap.removeEventListener('wheel', onWheel);
      unsubscribe();
      wrap.remove();
    },
    setBackgroundColor(color: string | null): void {
      canvas.style.backgroundColor = color ?? '';
    },
  };
}
