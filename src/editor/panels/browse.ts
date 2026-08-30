import { ROOM_TEMPLATES } from '../../content/rooms/index.js';
import { renderRoomThumbnail } from './thumbnail.js';

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

interface RoomSummary {
  readonly id: string;
  readonly shape: string;
  readonly floorTags: readonly string[];
  readonly specialRole: string | null;
  /** The lowercased haystack `filterRooms` searches — built once per render rather than per keystroke. */
  readonly searchText: string;
}

/**
 * Every room currently in `src/content/rooms/` (via `ROOM_TEMPLATES`'s glob
 * import), each with a small rendered thumbnail (`thumbnail.ts`) of its
 * actual layout, a text filter to search by id/shape/floor tag, and Load and
 * Duplicate buttons — the AC's "browse and duplicate existing rooms", made
 * to actually work by *looking* rather than reading a wall of filenames.
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

  const filterInput = document.createElement('input');
  filterInput.type = 'text';
  filterInput.placeholder = 'Filter by id, shape, floor tag…';
  filterInput.className = 'kb-editor-browse-filter';
  root.appendChild(filterInput);

  const countLabel = document.createElement('p');
  countLabel.className = 'kb-editor-browse-count';
  root.appendChild(countLabel);

  const grid = document.createElement('div');
  grid.className = 'kb-editor-browse-grid';
  root.appendChild(grid);

  let summaries: readonly { readonly raw: unknown; readonly summary: RoomSummary }[] = [];

  function readSummaries(): void {
    summaries = ROOM_TEMPLATES.map((raw) => ({ raw, summary: summarize(raw) }));
  }

  function renderCards(): void {
    const query = filterInput.value.trim().toLowerCase();
    const matches =
      query === ''
        ? summaries
        : summaries.filter(({ summary }) => summary.searchText.includes(query));

    grid.replaceChildren();
    countLabel.textContent =
      query === ''
        ? `${String(summaries.length)} room${summaries.length === 1 ? '' : 's'}`
        : `${String(matches.length)} of ${String(summaries.length)} rooms`;

    for (const { raw, summary } of matches) {
      const card = document.createElement('div');
      card.className = 'kb-editor-browse-card';

      card.appendChild(renderRoomThumbnail(raw));

      const label = document.createElement('span');
      label.className = 'kb-editor-browse-card-label';
      label.textContent = summary.id;
      label.title = summary.id;

      const meta = document.createElement('span');
      meta.className = 'kb-editor-browse-card-meta';
      meta.textContent = [summary.shape, summary.specialRole, ...summary.floorTags]
        .filter((part): part is string => part !== null && part !== '')
        .join(' · ');

      const actions = document.createElement('div');
      actions.className = 'kb-editor-browse-card-actions';
      const loadButton = document.createElement('button');
      loadButton.type = 'button';
      loadButton.textContent = 'Load';
      loadButton.addEventListener('click', () => {
        callbacks.onLoad(raw);
      });
      const duplicateButton = document.createElement('button');
      duplicateButton.type = 'button';
      duplicateButton.textContent = 'Duplicate';
      duplicateButton.addEventListener('click', () => {
        callbacks.onDuplicate(raw);
      });
      actions.append(loadButton, duplicateButton);

      card.append(label, meta, actions);
      grid.appendChild(card);
    }

    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'kb-editor-browse-empty';
      empty.textContent = query === '' ? 'No rooms authored yet.' : `No room matches "${query}".`;
      grid.appendChild(empty);
    }
  }

  filterInput.addEventListener('input', renderCards);

  readSummaries();
  renderCards();

  return {
    destroy(): void {
      root.remove();
    },
    refresh(): void {
      readSummaries();
      renderCards();
    },
  };
}

function summarize(value: unknown): RoomSummary {
  if (typeof value !== 'object' || value === null) {
    return { id: '(unknown)', shape: '?', floorTags: [], specialRole: null, searchText: '' };
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '(unknown)';
  const metadata = record.metadata;
  const metadataRecord =
    typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>) : {};
  const shape = 'shape' in metadataRecord ? String(metadataRecord.shape) : '?';
  const floorTags = Array.isArray(metadataRecord.floorTags)
    ? metadataRecord.floorTags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const specialRole =
    typeof metadataRecord.specialRole === 'string' ? metadataRecord.specialRole : null;
  const searchText = [id, shape, specialRole ?? '', ...floorTags].join(' ').toLowerCase();
  return { id, shape, floorTags, specialRole, searchText };
}
