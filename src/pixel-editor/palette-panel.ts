import { pickableColorsFor } from '../../tools/art/palette.mjs';
import { MAX_BRUSH_RADIUS, MIN_BRUSH_RADIUS, type PixelEditorState } from './state.js';

export interface PalettePanelHandle {
  destroy(): void;
}

/**
 * The palette panel: the swatches it renders
 * (`pickableColorsFor(bucketId, tier)`) are the *only* colours a click can ever
 * hand to `state.selectedColor` — there is no free-form colour picker anywhere
 * in this tool. That is the actual "cannot save an off-palette pixel" guarantee
 * (`docs/DECISIONS.md` #24): the picker never offers a colour outside the
 * bucket's legal set for the sprite's tier (#214 — a background sprite sees
 * only the quiet derived swatches), so `state.paintPixel` can never write one. The `shade` tool (`docs/DECISIONS.md`
 * #27) never reads `selectedColor` at all — it derives a lighter/darker tone
 * of whatever a pixel already is — so it needs no swatch of its own, just
 * the brush-size control this panel also owns.
 */
export function createPalettePanel(state: PixelEditorState, host: HTMLElement): PalettePanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-pixel-panel';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Palette';
  root.appendChild(heading);

  const toolRow = document.createElement('div');
  toolRow.className = 'kb-pixel-tool-row';
  const penButton = document.createElement('button');
  penButton.type = 'button';
  penButton.textContent = 'Pen';
  const eraserButton = document.createElement('button');
  eraserButton.type = 'button';
  eraserButton.textContent = 'Eraser';
  const shadeButton = document.createElement('button');
  shadeButton.type = 'button';
  shadeButton.textContent = 'Shade';
  shadeButton.title = 'Drag over already-painted pixels to nudge some lighter, some darker';
  toolRow.append(penButton, eraserButton, shadeButton);
  root.appendChild(toolRow);

  // Only meaningful for `shade` — `pen`/`eraser` always touch one pixel.
  const brushRow = document.createElement('label');
  brushRow.className = 'kb-pixel-brush-row';
  const brushLabel = document.createElement('span');
  brushLabel.textContent = 'Brush size';
  const brushInput = document.createElement('input');
  brushInput.type = 'range';
  brushInput.min = String(MIN_BRUSH_RADIUS);
  brushInput.max = String(MAX_BRUSH_RADIUS);
  brushInput.value = String(state.brushRadius);
  brushRow.append(brushLabel, brushInput);
  root.appendChild(brushRow);

  const swatchGrid = document.createElement('div');
  swatchGrid.className = 'kb-pixel-swatches';
  root.appendChild(swatchGrid);

  penButton.addEventListener('click', () => {
    state.tool = 'pen';
    state.notify();
  });
  eraserButton.addEventListener('click', () => {
    state.tool = 'eraser';
    state.notify();
  });
  shadeButton.addEventListener('click', () => {
    state.tool = 'shade';
    state.notify();
  });
  brushInput.addEventListener('input', () => {
    state.brushRadius = Number(brushInput.value);
  });

  function render(): void {
    penButton.classList.toggle('kb-pixel-tool-active', state.tool === 'pen');
    eraserButton.classList.toggle('kb-pixel-tool-active', state.tool === 'eraser');
    shadeButton.classList.toggle('kb-pixel-tool-active', state.tool === 'shade');
    brushRow.style.display = state.tool === 'shade' ? 'flex' : 'none';

    swatchGrid.replaceChildren();
    const colors = [...pickableColorsFor(state.bucketId, state.tier)].sort((a, b) => a - b);
    for (const color of colors) {
      const hex = `#${color.toString(16).padStart(6, '0')}`;
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'kb-pixel-swatch';
      swatch.style.background = hex;
      swatch.title = hex;
      swatch.classList.toggle(
        'kb-pixel-swatch-active',
        state.tool === 'pen' && state.selectedColor === color,
      );
      swatch.addEventListener('click', () => {
        state.selectedColor = color;
        state.tool = 'pen';
        state.notify();
      });
      swatchGrid.appendChild(swatch);
    }
  }

  const unsubscribe = state.subscribe(render);
  render();

  return {
    destroy(): void {
      unsubscribe();
      root.remove();
    },
  };
}
