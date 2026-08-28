import { floorBackgroundSwatches } from '../../tools/art/palette.mjs';
import { FLOOR_BUCKETS } from '../../tools/art/spec.mjs';
import type { GridPanelHandle } from './grid.js';

export interface BackgroundPanelHandle {
  destroy(): void;
}

interface BackgroundOption {
  readonly id: string;
  readonly label: string;
  /** `null` means "the editor's own default grey" — `grid.ts`'s `setBackgroundColor(null)`. */
  readonly color: string | null;
}

function hexOf(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

const OPTIONS: readonly BackgroundOption[] = [
  { id: 'dark', label: 'Dark (default)', color: null },
  { id: 'black', label: 'Black', color: '#000000' },
  { id: 'white', label: 'White', color: '#ffffff' },
  ...FLOOR_BUCKETS.map((bucket): BackgroundOption => ({
    id: bucket.floorTag,
    label: bucket.name,
    color: hexOf(floorBackgroundSwatches(bucket.floorTag)[0] ?? 0x000000),
  })),
];

/**
 * A quick "what floor's mood does this layout read like" preview: tints
 * every empty tile cell with a floor's actual dominant background colour
 * (`palette.mjs`'s `floorBackgroundSwatches`, the same swatches the pixel
 * editor's own background panel offers) instead of the fixed placeholder
 * grey — the room's own wall/obstacle cells are untouched, since the point
 * is reading the open floor space, not restyling the whole grid.
 */
export function createBackgroundPanel(
  grid: GridPanelHandle,
  host: HTMLElement,
): BackgroundPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-editor-panel';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Grid background';
  root.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'kb-editor-bg-row';
  root.appendChild(row);

  let activeId = OPTIONS[0]?.id ?? 'dark';

  function render(): void {
    row.replaceChildren();
    for (const option of OPTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kb-editor-bg-swatch';
      button.title = option.label;
      button.style.background = option.color ?? 'var(--kb-color-surface-0)';
      button.classList.toggle('kb-editor-bg-active', option.id === activeId);
      button.addEventListener('click', () => {
        activeId = option.id;
        grid.setBackgroundColor(option.color);
        render();
      });
      row.appendChild(button);
    }
  }
  render();

  return {
    destroy(): void {
      root.remove();
    },
  };
}
