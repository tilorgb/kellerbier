import { loadSprite, listSprites, type SpriteSummary } from './api-client.js';

export interface BrowsePanelHandle {
  destroy(): void;
  /** Re-reads the sprite list from the server — call after a save, so a just-saved sprite appears without a reload. */
  refresh(): void;
}

export interface BrowsePanelCallbacks {
  readonly onLoad: (sprite: SpriteSummary) => void;
}

/** Thumbnails are drawn at native pixel size, then scaled up to this box with `image-rendering: pixelated` — big enough to actually read the art, small enough that a browse grid of them still fits. */
const THUMBNAIL_BOX_PX = 48;

/**
 * Every sprite currently under `assets/sprites/`, each with a rendered
 * thumbnail (its first frame, at native res) and a text filter to search by
 * bucket/category/name — the AC's "without leaving the browser", made to
 * actually work by *looking* for the sprite rather than reading a wall of
 * `bucket/category/name` strings.
 */
export function createBrowsePanel(
  host: HTMLElement,
  callbacks: BrowsePanelCallbacks,
): BrowsePanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-pixel-panel';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Browse sprites';
  root.appendChild(heading);

  const filterInput = document.createElement('input');
  filterInput.type = 'text';
  filterInput.placeholder = 'Filter by bucket, category, name…';
  filterInput.className = 'kb-pixel-browse-filter';
  root.appendChild(filterInput);

  const countLabel = document.createElement('p');
  countLabel.className = 'kb-pixel-browse-count';
  root.appendChild(countLabel);

  const grid = document.createElement('div');
  grid.className = 'kb-pixel-browse-grid';
  root.appendChild(grid);

  let sprites: readonly SpriteSummary[] = [];
  /** Bumped on every `refresh()`, so a thumbnail decode that resolves after a newer refresh started never overwrites a card built for the current list. */
  let generation = 0;

  function searchTextFor(sprite: SpriteSummary): string {
    return `${sprite.bucketId} ${sprite.category} ${sprite.name}`.toLowerCase();
  }

  function renderCards(): void {
    const thisGeneration = generation;
    const query = filterInput.value.trim().toLowerCase();
    const matches =
      query === '' ? sprites : sprites.filter((sprite) => searchTextFor(sprite).includes(query));

    grid.replaceChildren();
    countLabel.textContent =
      query === ''
        ? `${String(sprites.length)} sprite${sprites.length === 1 ? '' : 's'}`
        : `${String(matches.length)} of ${String(sprites.length)} sprites`;

    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'kb-pixel-browse-empty';
      empty.textContent =
        sprites.length === 0
          ? 'No sprites authored yet.'
          : query === ''
            ? 'No sprites authored yet.'
            : `No sprite matches "${query}".`;
      grid.appendChild(empty);
      return;
    }

    for (const sprite of matches) {
      const card = document.createElement('div');
      card.className = 'kb-pixel-browse-card';

      const thumbSlot = document.createElement('div');
      thumbSlot.className = 'kb-pixel-browse-thumb';
      card.appendChild(thumbSlot);
      void renderThumbnail(sprite, thumbSlot, thisGeneration);

      const label = document.createElement('span');
      label.className = 'kb-pixel-browse-card-label';
      label.textContent = sprite.name;
      label.title = `${sprite.bucketId}/${sprite.category}/${sprite.name}`;

      const meta = document.createElement('span');
      meta.className = 'kb-pixel-browse-card-meta';
      meta.textContent =
        `${sprite.bucketId} · ${sprite.category}` + (sprite.hasAnimation ? ' · anim' : '');

      const loadButton = document.createElement('button');
      loadButton.type = 'button';
      loadButton.textContent = 'Load';
      loadButton.addEventListener('click', () => {
        callbacks.onLoad(sprite);
      });

      card.append(label, meta, loadButton);
      grid.appendChild(card);
    }
  }

  async function renderThumbnail(
    sprite: SpriteSummary,
    slot: HTMLElement,
    thisGeneration: number,
  ): Promise<void> {
    const loaded = await loadSprite(sprite.bucketId, sprite.category, sprite.name);
    if (thisGeneration !== generation || loaded === null) {
      return;
    }
    const firstFrame = loaded.frames[0];
    if (firstFrame === undefined) {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.className = 'kb-pixel-browse-thumb-canvas';
    canvas.width = loaded.frameWidth;
    canvas.height = loaded.frameHeight;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      return;
    }
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(firstFrame), loaded.frameWidth, loaded.frameHeight),
      0,
      0,
    );
    // Fit within the box on whichever axis is longer, at a whole-number
    // multiple — a non-integer scale would blur even with `pixelated`, since
    // the browser still has to interpolate between source pixels that no
    // longer land on device-pixel boundaries.
    const fit = Math.max(
      1,
      Math.floor(THUMBNAIL_BOX_PX / Math.max(loaded.frameWidth, loaded.frameHeight)),
    );
    canvas.style.width = `${String(loaded.frameWidth * fit)}px`;
    canvas.style.height = `${String(loaded.frameHeight * fit)}px`;
    slot.replaceChildren(canvas);
  }

  async function refresh(): Promise<void> {
    generation += 1;
    sprites = await listSprites();
    renderCards();
  }

  filterInput.addEventListener('input', renderCards);

  void refresh();

  return {
    destroy(): void {
      root.remove();
    },
    refresh(): void {
      void refresh();
    },
  };
}
