import type { RoomShape } from '../content/rooms/definition.js';
import { injectDevUiTokens } from '../dev-ui/tokens.js';
import { saveRoom } from './api-client.js';
import { createBrowsePanel } from './panels/browse.js';
import { createMetadataPanel } from './panels/metadata.js';
import { createSpawnGroupsPanel } from './panels/spawn-groups.js';
import { createValidationPanel } from './panels/validation.js';
import { SHAPES } from './definitions.js';
import { createBackgroundPanel } from './background-panel.js';
import { createGridPanel } from './grid.js';
import { createLiveRoomSync, isEmbedded } from './live-room-sync.js';
import { type PlaytestHandle, createPlaytest } from './playtest.js';
import { EditorState, createBlankDraft, fromRoomTemplate, toTemplateJSON } from './state.js';

const STYLE = `
.kb-editor-root {
  display: flex; gap: 16px; padding: 12px; box-sizing: border-box;
  min-height: 100vh; font: 13px/1.4 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-surface-1);
}
.kb-editor-root * { box-sizing: border-box; }
.kb-editor-column { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.kb-editor-left { flex: 0 0 auto; }
.kb-editor-right { flex: 1 1 320px; min-width: 280px; max-width: 420px; overflow-y: auto; max-height: 100vh; }

/*
 * This page is opened both as its own tab and docked in the game shell's
 * split view (app/editor-dock.ts), whose divider the user can drag
 * arbitrarily narrow — an iframe's media queries respond to its own
 * rendered width, so this reflows live as the divider moves, no
 * coordination with the parent page needed. Below the breakpoint the two
 * columns stack instead of sitting side by side, and the room grid (below,
 * .kb-editor-grid-panel) scrolls horizontally within its own box rather
 * than forcing the whole page wider than the docked panel.
 */
@media (max-width: 640px) {
  .kb-editor-root { flex-direction: column; min-height: 0; }
  .kb-editor-left { width: 100%; }
  .kb-editor-right { width: 100%; max-width: none; min-width: 0; max-height: none; overflow-y: visible; }
}

.kb-editor-panel {
  background: var(--kb-color-panel-editor); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 10px 12px;
}
.kb-editor-panel h2 {
  margin: 0 0 8px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--kb-color-text-dim); font-weight: normal;
}
.kb-editor-panel label { display: block; margin-bottom: 6px; }
.kb-editor-panel input[type='text'], .kb-editor-panel input[type='number'], .kb-editor-panel select {
  width: 100%; background: var(--kb-color-surface-3); color: var(--kb-color-text);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 3px 5px; font: inherit; margin-top: 2px;
}
.kb-editor-panel button {
  font: inherit; color: var(--kb-color-text); background: var(--kb-color-surface-3);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 4px 8px; cursor: pointer;
}
.kb-editor-panel button:hover { background: var(--kb-color-surface-3-hover); }
.kb-editor-doors { display: flex; gap: 10px; margin-bottom: 8px; }
.kb-editor-bg-row { display: flex; flex-wrap: wrap; gap: 6px; }
.kb-editor-bg-swatch { width: 26px; height: 26px; padding: 0; border: 2px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm); cursor: pointer; }
.kb-editor-bg-active { outline: 2px solid var(--kb-color-accent); outline-offset: 1px; }
.kb-editor-doors label { display: flex; align-items: center; gap: 4px; margin: 0; }

.kb-editor-cell-tabs { display: flex; gap: 6px; }
.kb-editor-cell-tabs button.kb-editor-tab-active { background: var(--kb-color-surface-4); }

.kb-editor-grid-panel {
  background: var(--kb-color-panel-editor); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 10px; max-width: 100%; overflow: auto;
}
.kb-editor-toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.kb-editor-tool {
  font: inherit; color: var(--kb-color-text); background: var(--kb-color-surface-3);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 4px 8px; cursor: pointer;
}
.kb-editor-tool:hover { background: var(--kb-color-surface-3-hover); }
.kb-editor-tool-active {
  background: var(--kb-color-accent); color: var(--kb-color-surface-1);
  border-color: var(--kb-color-accent);
}
.kb-editor-tool-option {
  font: inherit; background: var(--kb-color-surface-3); color: var(--kb-color-text);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm); padding: 3px 5px;
}

.kb-editor-grid-wrap { position: relative; }
.kb-editor-tile-layer { position: relative; background: var(--kb-color-surface-0); }
.kb-editor-tile {
  position: absolute; background: var(--kb-editor-tile-bg, var(--kb-color-surface-3));
  border: 1px solid var(--kb-color-surface-2);
  cursor: crosshair;
}
.kb-editor-tile-wall { background: var(--kb-color-surface-4-alt); }
.kb-editor-tile-drag { outline: 2px solid var(--kb-color-accent); outline-offset: -2px; }
.kb-editor-marker-layer { position: absolute; top: 0; left: 0; pointer-events: none; }
.kb-editor-marker { position: absolute; width: 10px; height: 10px; border-radius: 50%; }
.kb-editor-marker-enemy { background: var(--kb-color-warn); }
.kb-editor-marker-pickup { background: var(--kb-color-marker-pickup); }
.kb-editor-marker-prop { background: var(--kb-color-marker-prop); }
.kb-editor-marker-hazard {
  position: absolute; background: var(--kb-color-warn-bg); border: 1px solid var(--kb-color-warn);
  border-radius: 0; width: auto; height: auto;
}

.kb-editor-spawn-group { border-top: 1px solid var(--kb-color-surface-4); padding-top: 8px; margin-top: 8px; }
.kb-editor-spawn-choice { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
.kb-editor-inline-label {
  display: flex; align-items: center; gap: 4px; margin: 0; font-size: 11px; color: var(--kb-color-text-dim);
}
.kb-editor-inline-label select, .kb-editor-inline-label input { width: auto; }

.kb-editor-browse-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.kb-editor-browse-row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.kb-editor-validation-ok { color: var(--kb-color-ok); }
.kb-editor-validation-error { color: var(--kb-color-warn); }

.kb-editor-actions { display: flex; gap: 8px; }
.kb-editor-status { min-height: 1.4em; color: var(--kb-color-text-dim); }

.kb-editor-playtest-overlay {
  position: fixed; inset: 0; z-index: 50; background: var(--kb-color-surface-0);
}
.kb-editor-playtest-exit {
  position: fixed; top: 10px; right: 10px; z-index: 51; font: 12px var(--kb-font-mono);
  color: var(--kb-color-text); background: var(--kb-color-surface-3); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-sm); padding: 6px 10px; cursor: pointer;
}
`;

function boot(): void {
  const host = document.getElementById('editor');
  if (host === null) {
    throw new Error('Missing #editor host element in editor.html');
  }

  injectDevUiTokens();

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'kb-editor-root';
  host.appendChild(root);

  const left = document.createElement('div');
  left.className = 'kb-editor-column kb-editor-left';
  root.appendChild(left);

  const right = document.createElement('div');
  right.className = 'kb-editor-column kb-editor-right';
  root.appendChild(right);

  const state = new EditorState(createBlankDraft('1x1'));
  // The shape the currently-loaded draft had when the live room sync
  // (below) loaded it from the running game — `null` for anything loaded
  // any other way (New room, Browse). `Apply to running game` refuses a
  // shape change against this, since compiling a template against a real
  // floor-grid placement built for a different shape throws.
  let liveRoomShape: RoomShape | null = null;

  const newRow = document.createElement('div');
  newRow.className = 'kb-editor-panel';
  const newShapeSelect = document.createElement('select');
  for (const info of SHAPES) {
    const option = document.createElement('option');
    option.value = info.shape;
    option.textContent = info.label;
    newShapeSelect.appendChild(option);
  }
  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.textContent = 'New room';
  newButton.addEventListener('click', () => {
    if (state.dirty && !window.confirm('Discard unsaved changes and start a new room?')) {
      return;
    }
    liveRoomShape = null;
    state.load(createBlankDraft(newShapeSelect.value as RoomShape));
  });
  newRow.append(newShapeSelect, newButton);
  left.appendChild(newRow);

  const cellTabs = document.createElement('div');
  cellTabs.className = 'kb-editor-cell-tabs';
  left.appendChild(cellTabs);

  const gridHost = document.createElement('div');
  left.appendChild(gridHost);
  const grid = createGridPanel(state, gridHost);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'kb-editor-panel kb-editor-actions';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Save';
  const playtestButton = document.createElement('button');
  playtestButton.type = 'button';
  playtestButton.textContent = 'Playtest';
  actionsRow.append(saveButton, playtestButton);
  const embedded = isEmbedded();
  let applyButton: HTMLButtonElement | null = null;
  if (embedded) {
    applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.textContent = 'Apply to running game';
    actionsRow.appendChild(applyButton);
  }
  left.appendChild(actionsRow);

  const status = document.createElement('p');
  status.className = 'kb-editor-status';
  left.appendChild(status);

  createBackgroundPanel(grid, right);
  createMetadataPanel(state, right);
  createSpawnGroupsPanel(state, right);
  const validationPanel = createValidationPanel(state, right);
  const browsePanel = createBrowsePanel(right, {
    onLoad: (raw) => {
      if (state.dirty && !window.confirm('Discard unsaved changes and load this room?')) {
        return;
      }
      liveRoomShape = null;
      state.load(fromRoomTemplate(raw));
    },
    onDuplicate: (raw) => {
      if (state.dirty && !window.confirm('Discard unsaved changes and duplicate this room?')) {
        return;
      }
      liveRoomShape = null;
      state.load(fromRoomTemplate(raw, ''));
    },
  });

  // The docked half of #108's "load the room I'm actually standing in, edit
  // it live" follow-up.
  const liveRoomSync = createLiveRoomSync(
    (templateJson) => {
      if (templateJson === null) {
        status.textContent =
          "Current room can't be edited live (it's a staircase) — starting blank.";
        return;
      }
      const draft = fromRoomTemplate(templateJson);
      liveRoomShape = draft.shape;
      state.load(draft);
      status.textContent = `Loaded the room you're standing in (${draft.id}).`;
    },
    (result) => {
      if (result.ok) {
        status.textContent = 'Applied to the running game.';
      } else {
        status.textContent = `Apply failed: ${result.error ?? 'unknown error'}`;
      }
    },
  );
  if (embedded) {
    liveRoomSync.requestCurrentRoom();
  }

  applyButton?.addEventListener('click', () => {
    if (!validationPanel.isValid()) {
      status.textContent = 'Fix the validation error before applying.';
      return;
    }
    if (liveRoomShape !== null && state.draft.shape !== liveRoomShape) {
      status.textContent = `Can't apply a shape change live (loaded as ${liveRoomShape}) — Save instead.`;
      return;
    }
    status.textContent = 'Applying…';
    liveRoomSync.applyToRunningGame(toTemplateJSON(state.draft));
  });

  function renderCellTabs(): void {
    cellTabs.replaceChildren();
    if (state.draft.cells.length <= 1) {
      return;
    }
    state.draft.cells.forEach((_cell, index) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.textContent = `Cell ${String(index + 1)}`;
      tab.classList.toggle('kb-editor-tab-active', index === state.activeCellIndex);
      tab.addEventListener('click', () => {
        state.setActiveCellIndex(index);
      });
      cellTabs.appendChild(tab);
    });
  }
  state.subscribe(renderCellTabs);
  renderCellTabs();

  saveButton.addEventListener('click', () => {
    void (async () => {
      if (state.draft.id.trim() === '') {
        status.textContent = 'Give the room an id before saving.';
        return;
      }
      if (!validationPanel.isValid()) {
        status.textContent = 'Fix the validation error before saving.';
        return;
      }
      status.textContent = 'Saving…';
      const result = await saveRoom(state.draft.id, toTemplateJSON(state.draft));
      if (result.ok) {
        state.markClean();
        status.textContent =
          result.via === 'file-export'
            ? `Saved ${state.draft.id}.json — move it into src/content/rooms/ if it isn't there already.`
            : `Saved src/content/rooms/${state.draft.id}.json.`;
        browsePanel.refresh();
      } else {
        status.textContent = `Save failed: ${result.error ?? 'unknown error'}`;
      }
    })();
  });

  let activePlaytest: PlaytestHandle | null = null;
  playtestButton.addEventListener('click', () => {
    if (!validationPanel.isValid()) {
      status.textContent = 'Fix the validation error before playtesting.';
      return;
    }
    void (async () => {
      activePlaytest?.destroy();
      activePlaytest = await createPlaytest(
        document.body,
        toTemplateJSON(state.draft),
        state.draft.shape,
        1,
      );
    })();
  });
}

boot();
