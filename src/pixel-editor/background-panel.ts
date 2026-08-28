import { floorBackgroundSwatches } from '../../tools/art/palette.mjs';
import { floorTagForBucket } from '../../tools/art/spec.mjs';
import type { GridHandle } from './canvas.js';
import type { PixelEditorState } from './state.js';

export interface BackgroundPanelHandle {
  destroy(): void;
}

interface BackgroundOption {
  readonly id: string;
  readonly label: string;
  /** `null` means "the editor's own default dark theme background" — `canvas.ts`'s `setBackgroundColor(null)`. */
  readonly color: string | null;
}

const FIXED_BACKGROUNDS: readonly BackgroundOption[] = [
  { id: 'dark', label: 'Dark (default)', color: null },
  { id: 'black', label: 'Black', color: '#000000' },
  { id: 'white', label: 'White', color: '#ffffff' },
];

function hexOf(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * A sprite reads very differently against black, white, or the actual floor
 * it will be drawn over — the same reason `legibility-panel.ts` checks a
 * projectile against `floorBackgroundSwatches` rather than just the palette
 * in the abstract. This offers those same swatches as real backgrounds to
 * paint over, live, so an author can see a character or tile the way it
 * will actually sit in the room while still drawing it, not just after
 * saving and reloading the game.
 */
export function createBackgroundPanel(
  state: PixelEditorState,
  grid: GridHandle,
  host: HTMLElement,
): BackgroundPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-pixel-panel';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Canvas background';
  root.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'kb-pixel-bg-row';
  root.appendChild(row);

  let activeId = FIXED_BACKGROUNDS[0]?.id ?? 'dark';

  function optionsFor(bucketId: string): readonly BackgroundOption[] {
    const floorTag = floorTagForBucket(bucketId);
    if (floorTag === null) {
      return FIXED_BACKGROUNDS;
    }
    const floorOptions = floorBackgroundSwatches(floorTag).map(
      (color, index): BackgroundOption => ({
        id: `floor-${String(index)}`,
        label: `Floor colour ${String(index + 1)}`,
        color: hexOf(color),
      }),
    );
    return [...FIXED_BACKGROUNDS, ...floorOptions];
  }

  function render(): void {
    row.replaceChildren();
    for (const option of optionsFor(state.bucketId)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'kb-pixel-bg-swatch';
      button.title = option.label;
      button.style.background = option.color ?? 'var(--kb-color-surface-0)';
      button.classList.toggle('kb-pixel-bg-active', option.id === activeId);
      button.addEventListener('click', () => {
        activeId = option.id;
        grid.setBackgroundColor(option.color);
        render();
      });
      row.appendChild(button);
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
