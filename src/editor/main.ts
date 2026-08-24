import type { RoomShape } from '../content/rooms/definition.js';
import { saveRoom } from './api-client.js';
import { createBrowsePanel } from './panels/browse.js';
import { createMetadataPanel } from './panels/metadata.js';
import { createSpawnGroupsPanel } from './panels/spawn-groups.js';
import { createValidationPanel } from './panels/validation.js';
import { SHAPES } from './definitions.js';
import { createGridPanel } from './grid.js';
import { type PlaytestHandle, createPlaytest } from './playtest.js';
import { EditorState, createBlankDraft, fromRoomTemplate, toTemplateJSON } from './state.js';

const STYLE = `
.kb-editor-root {
  display: flex; gap: 16px; padding: 12px; box-sizing: border-box;
  min-height: 100vh; font: 13px/1.4 ui-monospace, monospace; color: #d8cfc4;
  background: #14101a;
}
.kb-editor-root * { box-sizing: border-box; }
.kb-editor-column { display: flex; flex-direction: column; gap: 12px; }
.kb-editor-left { flex: 0 0 auto; }
.kb-editor-right { flex: 1 1 320px; min-width: 280px; max-width: 420px; overflow-y: auto; max-height: 100vh; }

.kb-editor-panel {
  background: rgba(27, 22, 34, 0.9); border: 1px solid #3d3348; border-radius: 4px; padding: 10px 12px;
}
.kb-editor-panel h2 {
  margin: 0 0 8px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a7f74;
  font-weight: normal;
}
.kb-editor-panel label { display: block; margin-bottom: 6px; }
.kb-editor-panel input[type='text'], .kb-editor-panel input[type='number'], .kb-editor-panel select {
  width: 100%; background: #241d2e; color: #d8cfc4; border: 1px solid #3d3348; border-radius: 3px;
  padding: 3px 5px; font: inherit; margin-top: 2px;
}
.kb-editor-panel button {
  font: inherit; color: #d8cfc4; background: #241d2e; border: 1px solid #3d3348; border-radius: 3px;
  padding: 4px 8px; cursor: pointer;
}
.kb-editor-panel button:hover { background: #2f2639; }
.kb-editor-doors { display: flex; gap: 10px; margin-bottom: 8px; }
.kb-editor-doors label { display: flex; align-items: center; gap: 4px; margin: 0; }

.kb-editor-cell-tabs { display: flex; gap: 6px; }
.kb-editor-cell-tabs button.kb-editor-tab-active { background: #3d3348; }

.kb-editor-grid-panel { background: rgba(27, 22, 34, 0.9); border: 1px solid #3d3348; border-radius: 4px; padding: 10px; }
.kb-editor-toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.kb-editor-tool { font: inherit; color: #d8cfc4; background: #241d2e; border: 1px solid #3d3348; border-radius: 3px; padding: 4px 8px; cursor: pointer; }
.kb-editor-tool:hover { background: #2f2639; }
.kb-editor-tool-active { background: #f0c46a; color: #14101a; border-color: #f0c46a; }
.kb-editor-tool-option { font: inherit; background: #241d2e; color: #d8cfc4; border: 1px solid #3d3348; border-radius: 3px; padding: 3px 5px; }

.kb-editor-grid-wrap { position: relative; }
.kb-editor-tile-layer { position: relative; background: #0b0a0d; }
.kb-editor-tile { position: absolute; background: #241d2e; border: 1px solid #1b1622; cursor: crosshair; }
.kb-editor-tile-wall { background: #4a3f57; }
.kb-editor-tile-drag { outline: 2px solid #f0c46a; outline-offset: -2px; }
.kb-editor-marker-layer { position: absolute; top: 0; left: 0; pointer-events: none; }
.kb-editor-marker { position: absolute; width: 10px; height: 10px; border-radius: 50%; }
.kb-editor-marker-enemy { background: #e0703a; }
.kb-editor-marker-pickup { background: #6ab0c9; }
.kb-editor-marker-prop { background: #b08056; }
.kb-editor-marker-hazard { position: absolute; background: rgba(224, 112, 58, 0.35); border: 1px solid #e0703a; border-radius: 0; width: auto; height: auto; }

.kb-editor-spawn-group { border-top: 1px solid #3d3348; padding-top: 8px; margin-top: 8px; }
.kb-editor-spawn-choice { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
.kb-editor-inline-label { display: flex; align-items: center; gap: 4px; margin: 0; font-size: 11px; color: #8a7f74; }
.kb-editor-inline-label select, .kb-editor-inline-label input { width: auto; }

.kb-editor-browse-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.kb-editor-browse-row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.kb-editor-validation-ok { color: #8fbf7a; }
.kb-editor-validation-error { color: #e0703a; }

.kb-editor-actions { display: flex; gap: 8px; }
.kb-editor-status { min-height: 1.4em; color: #8a7f74; }

.kb-editor-playtest-overlay {
  position: fixed; inset: 0; z-index: 50; background: #0b0a0d;
}
.kb-editor-playtest-exit {
  position: fixed; top: 10px; right: 10px; z-index: 51; font: 12px ui-monospace, monospace;
  color: #d8cfc4; background: #241d2e; border: 1px solid #3d3348; border-radius: 3px; padding: 6px 10px;
  cursor: pointer;
}
`;

function boot(): void {
  const host = document.getElementById('editor');
  if (host === null) {
    throw new Error('Missing #editor host element in editor.html');
  }

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
    state.load(createBlankDraft(newShapeSelect.value as RoomShape));
  });
  newRow.append(newShapeSelect, newButton);
  left.appendChild(newRow);

  const cellTabs = document.createElement('div');
  cellTabs.className = 'kb-editor-cell-tabs';
  left.appendChild(cellTabs);

  const gridHost = document.createElement('div');
  left.appendChild(gridHost);
  createGridPanel(state, gridHost);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'kb-editor-panel kb-editor-actions';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Save';
  const playtestButton = document.createElement('button');
  playtestButton.type = 'button';
  playtestButton.textContent = 'Playtest';
  actionsRow.append(saveButton, playtestButton);
  left.appendChild(actionsRow);

  const status = document.createElement('p');
  status.className = 'kb-editor-status';
  left.appendChild(status);

  createMetadataPanel(state, right);
  createSpawnGroupsPanel(state, right);
  const validationPanel = createValidationPanel(state, right);
  const browsePanel = createBrowsePanel(right, {
    onLoad: (raw) => {
      if (state.dirty && !window.confirm('Discard unsaved changes and load this room?')) {
        return;
      }
      state.load(fromRoomTemplate(raw));
    },
    onDuplicate: (raw) => {
      if (state.dirty && !window.confirm('Discard unsaved changes and duplicate this room?')) {
        return;
      }
      state.load(fromRoomTemplate(raw, ''));
    },
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
        status.textContent = `Saved src/content/rooms/${state.draft.id}.json.`;
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
