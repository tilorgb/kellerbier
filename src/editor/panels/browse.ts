import { ROOM_TEMPLATES } from '../../content/rooms/index.js';

export interface BrowsePanelHandle {
  destroy(): void;
  /** Re-reads `ROOM_TEMPLATES` — call after a save, so a just-saved room appears without a reload. */
  refresh(): void;
}

export interface BrowsePanelCallbacks {
  /** Loads `raw` for editing, keeping its own id — Save overwrites the same file. */
  readonly onLoad: (raw: unknown) => void;
  /** Loads `raw` for editing with its id cleared — Save writes a new file. */
  readonly onDuplicate: (raw: unknown) => void;
}

/**
 * Every room currently in `src/content/rooms/` (via `ROOM_TEMPLATES`'s glob
 * import), with Load and Duplicate for each — the AC's "browse and duplicate
 * existing rooms".
 */
export function createBrowsePanel(
  host: HTMLElement,
  callbacks: BrowsePanelCallbacks,
): BrowsePanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-editor-panel kb-editor-browse';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Browse rooms';
  root.appendChild(heading);

  const list = document.createElement('div');
  root.appendChild(list);

  function render(): void {
    list.replaceChildren();
    for (const room of ROOM_TEMPLATES) {
      const { id, shape } = summarize(room);
      const row = document.createElement('div');
      row.className = 'kb-editor-browse-row';

      const label = document.createElement('span');
      label.textContent = `${id} (${shape})`;

      const loadButton = document.createElement('button');
      loadButton.type = 'button';
      loadButton.textContent = 'Load';
      loadButton.addEventListener('click', () => {
        callbacks.onLoad(room);
      });

      const duplicateButton = document.createElement('button');
      duplicateButton.type = 'button';
      duplicateButton.textContent = 'Duplicate';
      duplicateButton.addEventListener('click', () => {
        callbacks.onDuplicate(room);
      });

      row.append(label, loadButton, duplicateButton);
      list.appendChild(row);
    }
  }

  render();

  return {
    destroy(): void {
      root.remove();
    },
    refresh: render,
  };
}

function summarize(value: unknown): { id: string; shape: string } {
  if (typeof value !== 'object' || value === null) {
    return { id: '(unknown)', shape: '?' };
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '(unknown)';
  const metadata = record.metadata;
  const shape =
    typeof metadata === 'object' && metadata !== null && 'shape' in metadata
      ? String((metadata as Record<string, unknown>).shape)
      : '?';
  return { id, shape };
}
