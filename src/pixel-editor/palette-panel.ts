import { allowedColorsFor } from '../../tools/art/palette.mjs';
import type { PixelEditorState } from './state.js';

export interface PalettePanelHandle {
  destroy(): void;
}

/**
 * The palette panel: the swatches it renders (`allowedColorsFor(bucketId)`)
 * are the *only* colours a click can ever hand to `state.selectedColor` —
 * there is no free-form colour picker anywhere in this tool. That is the
 * actual "cannot save an off-palette pixel" guarantee (`docs/DECISIONS.md`
 * #24): the picker never offers a colour outside the bucket's legal set, so
 * `state.paintPixel` can never write one.
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
  toolRow.append(penButton, eraserButton);
  root.appendChild(toolRow);

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

  function render(): void {
    penButton.classList.toggle('kb-pixel-tool-active', state.tool === 'pen');
    eraserButton.classList.toggle('kb-pixel-tool-active', state.tool === 'eraser');

    swatchGrid.replaceChildren();
    const colors = [...allowedColorsFor(state.bucketId)].sort((a, b) => a - b);
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
