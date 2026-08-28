import { injectDevUiTokens } from '../dev-ui/tokens.js';
import {
  base64ToBytes,
  bytesToBase64,
  loadSprite,
  saveSprite,
  type SpriteSummary,
} from './api-client.js';
import { createBrowsePanel } from './browse-panel.js';
import { createGridPanel } from './canvas.js';
import { createFramesPanel } from './frames-panel.js';
import { createLegibilityPanel } from './legibility-panel.js';
import { type LiveStatus, createLivePreviewClient } from './live-preview-client.js';
import { createPalettePanel } from './palette-panel.js';
import { PixelEditorState } from './state.js';
import {
  ALL_BUCKET_IDS,
  CATEGORY_FOLDERS,
  FLOOR_BUCKETS,
  type SpriteCategory,
} from '../../tools/art/spec.mjs';

const CATEGORIES = Object.keys(CATEGORY_FOLDERS) as SpriteCategory[];
const SAFE_NAME = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * Saving writes straight into `assets/sprites/`, which the art pipeline's
 * dev plugin (`tools/art/dev-plugin.mjs`, #34) watches and reacts to with an
 * unconditional `full-reload` over the shared Vite websocket — every open
 * page, this tool included, gets `location.reload()`'d so the game's own
 * atlas picks up the new art. Left alone, that means every Save here would
 * also blow away this tool's own in-progress canvas a moment later. Rather
 * than touch #34's shared plugin (other pages genuinely do want that
 * reload), this tool snapshots its own state into `sessionStorage` right
 * before the reload lands and restores it on the next boot — the reload
 * still happens, it just becomes invisible to whoever is drawing.
 */
const SNAPSHOT_KEY = 'kb-pixel-editor-snapshot';

interface EditorSnapshot {
  readonly bucketId: string;
  readonly category: SpriteCategory;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly frames: readonly string[];
  readonly activeFrameIndex: number;
  readonly frameDurationMs: number;
  readonly loop: boolean;
  readonly onionSkin: boolean;
  readonly dirty: boolean;
  readonly status: string;
}

function readSnapshot(): EditorSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (raw === null) {
      return null;
    }
    sessionStorage.removeItem(SNAPSHOT_KEY);
    return JSON.parse(raw) as EditorSnapshot;
  } catch {
    return null;
  }
}

const STYLE = `
.kb-pixel-root {
  display: flex; gap: 16px; padding: 12px; box-sizing: border-box;
  min-height: 100vh; font: 13px/1.4 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-surface-1);
}
.kb-pixel-root * { box-sizing: border-box; }
.kb-pixel-column { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.kb-pixel-left { flex: 0 0 auto; }
.kb-pixel-right { flex: 1 1 320px; min-width: 280px; max-width: 420px; overflow-y: auto; max-height: 100vh; }

/*
 * This page is opened both as its own tab and docked in the game shell's
 * split view (app/editor-dock.ts), whose divider the user can drag
 * arbitrarily narrow — an iframe's media queries respond to its own
 * rendered width, so this reflows live as the divider moves, no
 * coordination with the parent page needed. Below the breakpoint, the two
 * columns stack instead of sitting side by side, and the canvas/frame
 * strips scroll horizontally within their own box (below) rather than
 * forcing the whole page wider than the docked panel.
 */
@media (max-width: 640px) {
  .kb-pixel-root { flex-direction: column; min-height: 0; }
  .kb-pixel-left { width: 100%; }
  .kb-pixel-right { width: 100%; max-width: none; min-width: 0; max-height: none; overflow-y: visible; }
}

.kb-pixel-panel {
  background: var(--kb-color-panel-editor); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 10px 12px;
}
.kb-pixel-panel h2 {
  margin: 0 0 8px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--kb-color-text-dim); font-weight: normal;
}
.kb-pixel-panel label { display: block; margin-bottom: 6px; }
.kb-pixel-panel input[type='text'], .kb-pixel-panel select {
  width: 100%; background: var(--kb-color-surface-3); color: var(--kb-color-text);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 3px 5px; font: inherit; margin-top: 2px;
}
.kb-pixel-panel button {
  font: inherit; color: var(--kb-color-text); background: var(--kb-color-surface-3);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 4px 8px; cursor: pointer;
}
.kb-pixel-panel button:hover { background: var(--kb-color-surface-3-hover); }

.kb-pixel-target-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.kb-pixel-target-row select, .kb-pixel-target-row input { width: auto; flex: 1 1 100px; }

.kb-pixel-canvas-wrap {
  background: var(--kb-color-surface-0); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 12px;
  display: inline-block; max-width: 100%; overflow: auto;
}
.kb-pixel-canvas {
  image-rendering: pixelated; cursor: crosshair; display: block;
  background-color: var(--kb-color-surface-0);
  background-image:
    linear-gradient(to right, rgba(216, 207, 196, 0.12) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(216, 207, 196, 0.12) 1px, transparent 1px);
  touch-action: none;
}

.kb-pixel-tool-row { display: flex; gap: 6px; margin-bottom: 8px; }
.kb-pixel-tool-active { background: var(--kb-color-accent); color: var(--kb-color-surface-1); border-color: var(--kb-color-accent); }

.kb-pixel-swatches { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
.kb-pixel-swatch { width: 24px; height: 24px; padding: 0; border: 2px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm); cursor: pointer; }
.kb-pixel-swatch-active { outline: 2px solid var(--kb-color-accent); outline-offset: 1px; }

.kb-pixel-frame-strip { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.kb-pixel-frame-thumb {
  padding: 3px; display: flex; flex-direction: column; align-items: center; gap: 2px;
  background: var(--kb-color-surface-2);
}
.kb-pixel-frame-thumb canvas { width: 32px; height: 32px; image-rendering: pixelated; background: var(--kb-color-surface-0); }
.kb-pixel-frame-thumb-active { outline: 2px solid var(--kb-color-accent); }
.kb-pixel-frame-controls { display: flex; gap: 6px; margin-bottom: 8px; }
.kb-pixel-frame-options { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.kb-pixel-inline-label { display: flex; align-items: center; gap: 4px; margin: 0; font-size: 11px; color: var(--kb-color-text-dim); }
.kb-pixel-inline-label input[type='number'] { width: 60px; background: var(--kb-color-surface-3); color: var(--kb-color-text); border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm); padding: 2px 4px; }

.kb-pixel-legibility-ok { color: var(--kb-color-ok); margin: 2px 0; }
.kb-pixel-legibility-fail { color: var(--kb-color-warn); margin: 2px 0; }

.kb-pixel-browse-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.kb-pixel-browse-row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.kb-pixel-actions { display: flex; gap: 8px; }
.kb-pixel-status { min-height: 1.4em; color: var(--kb-color-text-dim); }
.kb-pixel-live-status { min-height: 1.4em; margin: 4px 0 0; color: var(--kb-color-text-dim); font-size: 12px; }
.kb-pixel-live-status-live { color: var(--kb-color-ok); }
`;

function bucketLabel(bucketId: string): string {
  if (bucketId === 'common') {
    return 'Common (shared)';
  }
  const bucket = FLOOR_BUCKETS.find((entry) => entry.id === bucketId);
  return bucket === undefined ? bucketId : `${bucket.name} (${bucketId})`;
}

function boot(): void {
  const host = document.getElementById('pixel-editor');
  if (host === null) {
    throw new Error('Missing #pixel-editor host element in pixel-editor.html');
  }

  injectDevUiTokens();

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'kb-pixel-root';
  host.appendChild(root);

  const left = document.createElement('div');
  left.className = 'kb-pixel-column kb-pixel-left';
  root.appendChild(left);

  const right = document.createElement('div');
  right.className = 'kb-pixel-column kb-pixel-right';
  root.appendChild(right);

  const [defaultBucketId] = ALL_BUCKET_IDS;
  const [defaultCategory] = CATEGORIES;
  if (defaultBucketId === undefined || defaultCategory === undefined) {
    throw new Error('no sprite buckets or categories configured');
  }

  const snapshot = readSnapshot();
  const state = new PixelEditorState(
    snapshot?.bucketId ?? defaultBucketId,
    snapshot?.category ?? defaultCategory,
  );
  if (snapshot !== null) {
    state.bucketId = snapshot.bucketId;
    state.category = snapshot.category;
    state.loadFrames(
      snapshot.frames.map(base64ToBytes),
      snapshot.width,
      snapshot.height,
      snapshot.frameDurationMs,
      snapshot.loop,
    );
    state.activeFrameIndex = snapshot.activeFrameIndex;
    state.onionSkin = snapshot.onionSkin;
    state.dirty = snapshot.dirty;
  }

  const targetPanel = document.createElement('div');
  targetPanel.className = 'kb-pixel-panel';
  left.appendChild(targetPanel);

  const targetRow = document.createElement('div');
  targetRow.className = 'kb-pixel-target-row';
  targetPanel.appendChild(targetRow);

  const bucketSelect = document.createElement('select');
  for (const bucketId of ALL_BUCKET_IDS) {
    const option = document.createElement('option');
    option.value = bucketId;
    option.textContent = bucketLabel(bucketId);
    bucketSelect.appendChild(option);
  }

  const categorySelect = document.createElement('select');
  for (const category of CATEGORIES) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  }

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'sprite-name';

  if (snapshot !== null) {
    bucketSelect.value = snapshot.bucketId;
    categorySelect.value = snapshot.category;
    nameInput.value = snapshot.name;
  }

  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.textContent = 'New';
  newButton.addEventListener('click', () => {
    if (state.dirty && !window.confirm('Discard unsaved changes and start a new sprite?')) {
      return;
    }
    state.reset(bucketSelect.value, categorySelect.value as SpriteCategory);
    nameInput.value = '';
  });

  targetRow.append(bucketSelect, categorySelect, nameInput, newButton);

  const gridHost = document.createElement('div');
  left.appendChild(gridHost);
  createGridPanel(state, gridHost);

  const livePreviewStatus = document.createElement('p');
  livePreviewStatus.className = 'kb-pixel-live-status';
  left.appendChild(livePreviewStatus);
  function renderLiveStatus(liveStatus: LiveStatus): void {
    if (window.parent === window) {
      livePreviewStatus.textContent = '';
      return;
    }
    if (liveStatus === 'live') {
      livePreviewStatus.textContent = '● Live in the running game';
      livePreviewStatus.className = 'kb-pixel-live-status kb-pixel-live-status-live';
    } else if (liveStatus === 'not-wired') {
      livePreviewStatus.textContent = '○ Not wired into the running game yet';
      livePreviewStatus.className = 'kb-pixel-live-status';
    } else {
      livePreviewStatus.textContent = '';
    }
  }
  createLivePreviewClient(state, () => nameInput.value.trim(), renderLiveStatus);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'kb-pixel-panel kb-pixel-actions';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Save';
  actionsRow.appendChild(saveButton);
  left.appendChild(actionsRow);

  const status = document.createElement('p');
  status.className = 'kb-pixel-status';
  left.appendChild(status);
  if (snapshot !== null) {
    status.textContent = snapshot.status;
  }

  createPalettePanel(state, right);
  createFramesPanel(state, right);
  createLegibilityPanel(state, right);
  const browsePanel = createBrowsePanel(right, {
    onLoad: (sprite: SpriteSummary) => {
      if (state.dirty && !window.confirm('Discard unsaved changes and load this sprite?')) {
        return;
      }
      void (async () => {
        const loaded = await loadSprite(sprite.bucketId, sprite.category, sprite.name);
        if (loaded === null) {
          status.textContent = `Could not load ${sprite.bucketId}/${sprite.category}/${sprite.name}.`;
          return;
        }
        bucketSelect.value = sprite.bucketId;
        categorySelect.value = sprite.category;
        nameInput.value = sprite.name;
        state.bucketId = sprite.bucketId;
        state.category = sprite.category as SpriteCategory;
        state.loadFrames(
          loaded.frames.slice(),
          loaded.frameWidth,
          loaded.frameHeight,
          loaded.frameDurationMs,
          loaded.loop,
        );
        status.textContent = `Loaded ${sprite.bucketId}/${sprite.category}/${sprite.name}.`;
      })();
    },
  });

  saveButton.addEventListener('click', () => {
    void (async () => {
      const name = nameInput.value.trim();
      if (!SAFE_NAME.test(name)) {
        status.textContent = 'Give the sprite a name (lowercase letters, digits, hyphens).';
        return;
      }
      status.textContent = 'Saving…';
      const result = await saveSprite(state.bucketId, state.category, name, {
        frameWidth: state.width,
        frameHeight: state.height,
        frames: state.frames,
        frameDurationMs: state.frameDurationMs,
        loop: state.loop,
      });
      if (result.ok) {
        state.markClean();
        const folder = CATEGORY_FOLDERS[state.category];
        const fileName = state.frames.length > 1 ? `${name}.strip.png` : `${name}.png`;
        status.textContent =
          result.via === 'file-export'
            ? `Saved ${fileName}${state.frames.length > 1 ? ' and its .anim.json' : ''} — ` +
              `move it into assets/sprites/${state.bucketId}/${folder}/ if it isn't there already.`
            : `Saved assets/sprites/${state.bucketId}/${folder}/${fileName}.`;
        browsePanel.refresh();
      } else {
        status.textContent = `Save failed: ${result.error ?? 'unknown error'}`;
      }
    })();
  });

  import.meta.hot?.on('vite:beforeFullReload', () => {
    try {
      const toSnapshot: EditorSnapshot = {
        bucketId: state.bucketId,
        category: state.category,
        name: nameInput.value,
        width: state.width,
        height: state.height,
        frames: state.frames.map(bytesToBase64),
        activeFrameIndex: state.activeFrameIndex,
        frameDurationMs: state.frameDurationMs,
        loop: state.loop,
        onionSkin: state.onionSkin,
        dirty: state.dirty,
        status: status.textContent,
      };
      sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(toSnapshot));
    } catch {
      // sessionStorage can throw (private browsing, quota) — losing the
      // snapshot just means this Save's reload behaves like any other did
      // before this tool existed.
    }
  });
}

boot();
