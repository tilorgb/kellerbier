import { listSprites, type SpriteSummary } from './api-client.js';

export interface BrowsePanelHandle {
  destroy(): void;
  /** Re-reads the sprite list from the server — call after a save, so a just-saved sprite appears without a reload. */
  refresh(): void;
}

export interface BrowsePanelCallbacks {
  readonly onLoad: (sprite: SpriteSummary) => void;
}

/** Every sprite currently under `assets/sprites/`, with a Load button for each — the AC's "without leaving the browser". */
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

  const list = document.createElement('div');
  root.appendChild(list);

  async function refresh(): Promise<void> {
    const sprites = await listSprites();
    list.replaceChildren();
    if (sprites.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No sprites authored yet.';
      list.appendChild(empty);
      return;
    }
    for (const sprite of sprites) {
      const row = document.createElement('div');
      row.className = 'kb-pixel-browse-row';

      const label = document.createElement('span');
      label.textContent = `${sprite.bucketId}/${sprite.category}/${sprite.name}${sprite.hasAnimation ? ' (anim)' : ''}`;

      const loadButton = document.createElement('button');
      loadButton.type = 'button';
      loadButton.textContent = 'Load';
      loadButton.addEventListener('click', () => {
        callbacks.onLoad(sprite);
      });

      row.append(label, loadButton);
      list.appendChild(row);
    }
  }

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
