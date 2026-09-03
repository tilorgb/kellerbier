import { fetchTracks, saveTrackEvents, saveTrackSample } from './api-client.js';
import { createSampleEditorPanel } from './sample-editor-panel.js';
import { eventsToLoop, mergeLoopIntoTrack } from './state.js';
import type { AudioEditorState } from './state.js';

export interface TrackPanelHandle {
  destroy(): void;
}

/**
 * "Add this piece to the track": pick a track, either load it wholesale
 * into the looper for direct editing, or keep composing the current loop
 * and insert it at a chosen beat offset — then Save writes
 * `content/audio/tracks.ts` through `tools/audio-editor/server.mjs`.
 *
 * Saving always re-fetches the track's current events first rather than
 * trusting whatever this panel last loaded, so two edits in the same
 * session (or a hand-edit of the file while the editor is open) never
 * silently clobber each other.
 */
export function createTrackPanel(state: AudioEditorState, host: HTMLElement): TrackPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-audio-panel';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Track';
  root.appendChild(heading);

  const select = document.createElement('select');
  root.appendChild(select);

  const offsetLabel = document.createElement('label');
  offsetLabel.textContent = 'Insert at beat';
  const offsetInput = document.createElement('input');
  offsetInput.type = 'number';
  offsetInput.step = '0.5';
  offsetInput.value = '0';
  offsetLabel.appendChild(offsetInput);
  root.appendChild(offsetLabel);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'kb-audio-button-row';
  root.appendChild(buttonRow);

  const loadButton = document.createElement('button');
  loadButton.type = 'button';
  loadButton.textContent = 'Load track into looper';
  buttonRow.appendChild(loadButton);

  const insertButton = document.createElement('button');
  insertButton.type = 'button';
  insertButton.textContent = 'Insert loop + save';
  buttonRow.appendChild(insertButton);

  const status = document.createElement('div');
  status.className = 'kb-audio-status';
  root.appendChild(status);

  const sampleEditor = createSampleEditorPanel(root, {
    getCurrentSample: () => state.tracks.find((track) => track.id === select.value)?.sample,
    saveSample: async (sample) => {
      await saveTrackSample(select.value, sample);
      state.tracks = await fetchTracks();
      state.notify();
    },
  });

  function renderOptions(): void {
    select.innerHTML = '';
    for (const track of state.tracks) {
      const option = document.createElement('option');
      option.value = track.id;
      option.textContent = `${track.title} (${track.id})`;
      select.appendChild(option);
    }
    if (state.selectedTrackId !== null) {
      select.value = state.selectedTrackId;
    }
  }

  select.addEventListener('change', () => {
    state.selectedTrackId = select.value;
    sampleEditor.refresh();
  });

  loadButton.addEventListener('click', () => {
    const track = state.tracks.find((t) => t.id === select.value);
    if (track === undefined) {
      return;
    }
    state.selectedTrackId = track.id;
    state.loop = eventsToLoop(track.events, track.loopBeats, track.ticksPerBeat);
    state.bpm = Math.round(3600 / track.ticksPerBeat);
    setStatus(`Loaded "${track.title}" — ${String(track.events.length)} events.`, false);
    state.notify();
  });

  insertButton.addEventListener('click', () => {
    void insertAndSave();
  });

  async function insertAndSave(): Promise<void> {
    const trackId = select.value;
    const trackMeta = state.tracks.find((t) => t.id === trackId);
    if (trackMeta === undefined) {
      return;
    }
    const offset = Number.parseFloat(offsetInput.value) || 0;
    insertButton.disabled = true;
    setStatus('Saving…', false);
    try {
      // Fresh copy, so a save doesn't clobber an edit made elsewhere since this panel last loaded.
      const freshTracks = await fetchTracks();
      const fresh = freshTracks.find((t) => t.id === trackId);
      if (fresh === undefined) {
        throw new Error(`track "${trackId}" no longer exists`);
      }
      const { events, dropped } = mergeLoopIntoTrack(
        fresh.events,
        state.loop,
        offset,
        fresh.loopBeats,
      );
      await saveTrackEvents(trackId, events);
      state.tracks = await fetchTracks();
      const warning =
        dropped > 0 ? ` (${String(dropped)} note(s) dropped — past the track's loop)` : '';
      setStatus(`Saved "${fresh.title}".${warning}`, dropped > 0);
      state.notify();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      insertButton.disabled = false;
    }
  }

  function setStatus(text: string, isWarning: boolean): void {
    status.textContent = text;
    status.classList.toggle('kb-audio-status-warn', isWarning);
  }

  const unsubscribe = state.subscribe(renderOptions);
  renderOptions();

  return {
    destroy(): void {
      unsubscribe();
      sampleEditor.destroy();
      root.remove();
    },
  };
}
