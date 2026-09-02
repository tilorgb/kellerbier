import type { AudioEditorState } from './state.js';

export interface LoopLibraryPanelHandle {
  destroy(): void;
}

/**
 * The "combine" half of "modify each instrument's loop individually, then
 * add it to the final track where they come together": every lane's 💾
 * button (`piano-roll.ts`) saves that instrument's notes here, under a
 * name, independently of whatever else is being worked on; this panel
 * lists what's saved and lets any of them be brought into the working loop
 * — the same multi-lane composition the track panel then inserts into a
 * shipped track. A loop can be reworked and re-saved under its own name as
 * many times as it takes before it's ready to combine.
 */
export function createLoopLibraryPanel(
  state: AudioEditorState,
  host: HTMLElement,
): LoopLibraryPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-audio-panel';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Loop library';
  root.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'kb-audio-hint';
  hint.textContent =
    "Saved from a lane's 💾 button. \"Add\" brings a saved loop into the working loop above, replacing that instrument's lane if it's already open.";
  root.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'kb-audio-loop-list';
  root.appendChild(list);

  function render(): void {
    list.innerHTML = '';
    if (state.savedLoops.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'kb-audio-hint';
      empty.textContent = 'Nothing saved yet.';
      list.appendChild(empty);
      return;
    }
    for (const loop of state.savedLoops) {
      const row = document.createElement('div');
      row.className = 'kb-audio-loop-row';

      const label = document.createElement('span');
      label.className = 'kb-audio-loop-label';
      label.textContent = `${loop.name} — ${loop.instrument}, ${String(loop.notes.length)} note${loop.notes.length === 1 ? '' : 's'}, ${String(loop.loopBeats)} beats`;
      row.appendChild(label);

      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.textContent = '+ Add';
      addButton.addEventListener('click', () => {
        state.addSavedLoopToWorkingLoop(loop.name);
      });
      row.appendChild(addButton);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = '🗑';
      deleteButton.title = 'Delete this saved loop';
      deleteButton.addEventListener('click', () => {
        state.deleteSavedLoop(loop.name);
      });
      row.appendChild(deleteButton);

      list.appendChild(row);
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
