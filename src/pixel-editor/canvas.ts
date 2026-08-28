import type { PixelEditorState } from './state.js';

/**
 * The starting ("fit") zoom targets the smaller of the host column's actual
 * measured width and a fraction of the window's height, not a single fixed
 * constant — a fixed pixel target regardless of how much room is actually
 * available is fine in this page's own full-width tab but wrong the moment
 * it's docked narrow (`app/editor-dock.ts`'s split view, draggable down to
 * `MIN_PANEL_WIDTH`): a too-wide canvas either forces the whole page to
 * scroll horizontally or sits mostly out of view. Capping the height too
 * (`FIT_HEIGHT_FRACTION`) keeps a tall canvas from pushing every panel below
 * it far down the page regardless of how much horizontal room there is.
 */
const FIT_HEIGHT_FRACTION = 0.55;
/** Padding `.kb-pixel-canvas-wrap` applies on each side (`main.ts`'s STYLE) — subtracted from the host's measured width so the fit calc targets the canvas's own available box, not the wrap's outer one. */
const WRAP_PADDING_PX = 12;

/**
 * Fixed zoom levels the +/- buttons step between, rather than a continuous
 * multiplier — chosen after a mouse-wheel version of this shipped and turned
 * out to have two real problems: the wheel also scrolls the page underneath
 * the canvas (nothing here can `preventDefault` its way out of that once the
 * page itself is what's supposed to scroll), and re-centring the view on the
 * cursor on every notch was fragile enough to occasionally scroll the sprite
 * out of the wrap's visible area entirely. Discrete buttons sidestep both:
 * no scroll-anchoring math is needed because each click is a big, predictable
 * jump, not a continuous drag, and the wrap's scroll position is simply reset
 * to the top-left on every change, which is always still inside the canvas.
 */
const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64] as const;

function fitZoomIndex(
  width: number,
  height: number,
  availableWidth: number,
  availableHeight: number,
): number {
  const target = Math.max(32, Math.min(availableWidth, availableHeight));
  const fit = Math.floor(target / Math.max(width, height));
  // The largest level that still fits, so a fresh sprite is never bigger
  // than its available space — falling back to the smallest level (never 0)
  // if even that doesn't fit, since a canvas has to render at some size.
  let index = 0;
  for (let candidate = 0; candidate < ZOOM_LEVELS.length; candidate++) {
    const level = ZOOM_LEVELS[candidate];
    if (level !== undefined && level <= fit) {
      index = candidate;
    }
  }
  return index;
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
 * Zoom starts at a "fit" level computed from the available space (recomputed
 * whenever `host` or the window resizes — the docked split view's divider
 * drag changes `host`'s width without ever firing a window resize, hence the
 * `ResizeObserver`), and the +/- buttons step between `ZOOM_LEVELS` from
 * there. The zoom index resets to the fit level whenever the sprite's own
 * dimensions change (a fresh "New" or a loaded sprite) — carrying a previous
 * sprite's zoom into a differently-sized one has no reason to make sense.
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
  let zoomIndex = 0;
  let lastWidth = state.width;
  let lastHeight = state.height;

  function fitIndex(): number {
    const availableWidth = Math.max(32, host.clientWidth - WRAP_PADDING_PX * 2);
    const availableHeight = Math.max(32, window.innerHeight * FIT_HEIGHT_FRACTION);
    return fitZoomIndex(state.width, state.height, availableWidth, availableHeight);
  }

  function currentZoom(): number {
    return ZOOM_LEVELS[zoomIndex] ?? 1;
  }

  function sizeCanvases(): void {
    if (state.width !== lastWidth || state.height !== lastHeight) {
      zoomIndex = fitIndex();
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

  const zoomRow = document.createElement('div');
  zoomRow.className = 'kb-pixel-zoom-row';
  const zoomOutButton = document.createElement('button');
  zoomOutButton.type = 'button';
  zoomOutButton.textContent = '−';
  zoomOutButton.title = 'Zoom out';
  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'kb-pixel-zoom-label';
  const zoomInButton = document.createElement('button');
  zoomInButton.type = 'button';
  zoomInButton.textContent = '+';
  zoomInButton.title = 'Zoom in';
  zoomRow.append(zoomOutButton, zoomLabel, zoomInButton);
  host.insertBefore(zoomRow, wrap);

  function renderZoomRow(): void {
    zoomLabel.textContent = `${String(currentZoom())}×`;
    zoomOutButton.disabled = zoomIndex <= 0;
    zoomInButton.disabled = zoomIndex >= ZOOM_LEVELS.length - 1;
  }

  // Resets scroll to the top-left on every zoom change rather than trying to
  // re-centre on wherever the view happened to be — with discrete, fairly
  // large jumps between levels (unlike a continuous wheel), the previous
  // scroll offset has no reason to still point at anything meaningful, and
  // the top-left corner is always inside the canvas whatever the zoom.
  zoomOutButton.addEventListener('click', () => {
    zoomIndex = Math.max(0, zoomIndex - 1);
    sizeCanvases();
    renderZoomRow();
    wrap.scrollLeft = 0;
    wrap.scrollTop = 0;
  });
  zoomInButton.addEventListener('click', () => {
    zoomIndex = Math.min(ZOOM_LEVELS.length - 1, zoomIndex + 1);
    sizeCanvases();
    renderZoomRow();
    wrap.scrollLeft = 0;
    wrap.scrollTop = 0;
  });

  // A window `resize` alone misses the docked split view's divider drag,
  // which changes `host`'s width without the window itself resizing —
  // `render/app.ts`'s `trackWindowSize` picks the same `ResizeObserver`
  // approach for the identical reason.
  const onHostResize = (): void => {
    sizeCanvases();
    renderZoomRow();
  };
  const resizeObserver = new ResizeObserver(onHostResize);
  resizeObserver.observe(host);
  window.addEventListener('resize', onHostResize);

  zoomIndex = fitIndex();
  const unsubscribe = state.subscribe(() => {
    render();
    renderZoomRow();
  });
  render();
  renderZoomRow();

  return {
    destroy(): void {
      resizeObserver.disconnect();
      window.removeEventListener('resize', onHostResize);
      unsubscribe();
      zoomRow.remove();
      wrap.remove();
    },
    setBackgroundColor(color: string | null): void {
      canvas.style.backgroundColor = color ?? '';
    },
  };
}
