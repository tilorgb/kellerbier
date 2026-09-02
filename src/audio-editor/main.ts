import { injectDevUiTokens } from '../dev-ui/tokens.js';
import { fetchInstruments, fetchTracks } from './api-client.js';
import { createMidiInput } from './midi.js';
import { createLoopPlayer } from './playback.js';
import { createPianoRoll } from './piano-roll.js';
import { createSfxPanel } from './sfx-panel.js';
import { AudioEditorState } from './state.js';
import { createTrackPanel } from './track-panel.js';

const STYLE = `
.kb-audio-root {
  display: flex; flex-direction: column; gap: 12px; padding: 12px; box-sizing: border-box;
  min-height: 100vh; font: 13px/1.4 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-surface-1);
}
.kb-audio-root * { box-sizing: border-box; }

.kb-audio-tabs { display: flex; gap: 8px; }
.kb-audio-tabs button {
  font: inherit; color: var(--kb-color-text-dim); background: var(--kb-color-surface-3);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 6px 14px; cursor: pointer;
}
.kb-audio-tabs button.kb-audio-active { background: var(--kb-color-accent); color: #241d2e; }
.kb-audio-section { display: flex; flex-direction: column; gap: 12px; }
.kb-audio-section[hidden] { display: none; }

.kb-audio-transport {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  background: var(--kb-color-panel-editor); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 8px 12px;
}
.kb-audio-transport button {
  font: inherit; color: var(--kb-color-text); background: var(--kb-color-surface-3);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 5px 10px; cursor: pointer;
}
.kb-audio-transport button.kb-audio-active { background: var(--kb-color-accent); color: #241d2e; }
.kb-audio-transport label { display: flex; align-items: center; gap: 4px; }
.kb-audio-transport input[type='number'] { width: 56px; }
.kb-audio-transport select, .kb-audio-transport input {
  font: inherit; background: var(--kb-color-surface-3); color: var(--kb-color-text);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm); padding: 3px 6px;
}
.kb-audio-midi-devices { color: var(--kb-color-text-dim); font-size: 11px; }

.kb-audio-piano-roll { display: flex; flex-direction: column; gap: 6px; }
.kb-audio-lane {
  background: var(--kb-color-panel-editor); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 6px; overflow: hidden;
}
.kb-audio-lane-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.kb-audio-lane-header span { color: var(--kb-color-accent); text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; }
.kb-audio-lane-header button {
  font: inherit; color: var(--kb-color-text-dim); background: transparent; border: none; cursor: pointer;
}
.kb-audio-lane-scroller { overflow: auto; }
.kb-audio-lane canvas { display: block; cursor: pointer; }

.kb-audio-panel {
  background: var(--kb-color-panel-editor); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 10px 12px; max-width: 480px;
}
.kb-audio-panel h2 {
  margin: 0 0 8px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--kb-color-text-dim); font-weight: normal;
}
.kb-audio-panel h3 {
  margin: 10px 0 6px; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--kb-color-accent); font-weight: normal; border-top: 1px solid var(--kb-color-surface-4);
  padding-top: 8px;
}
.kb-audio-panel select { width: 100%; margin-bottom: 8px; }
.kb-audio-panel label { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.kb-audio-panel input { width: 80px; }
.kb-audio-button-row { display: flex; gap: 8px; flex-wrap: wrap; }
.kb-audio-button-row button {
  font: inherit; color: var(--kb-color-text); background: var(--kb-color-surface-3);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 5px 10px; cursor: pointer;
}
.kb-audio-status { margin-top: 8px; color: var(--kb-color-ok); font-size: 12px; }
.kb-audio-status-warn { color: var(--kb-color-warn); }
`;

function injectStyle(): void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
}

async function boot(): Promise<void> {
  injectDevUiTokens();
  injectStyle();

  const host = document.getElementById('audio-editor');
  if (host === null) {
    throw new Error('#audio-editor host missing');
  }

  const root = document.createElement('div');
  root.className = 'kb-audio-root';
  host.appendChild(root);

  const tabs = document.createElement('div');
  tabs.className = 'kb-audio-tabs';
  root.appendChild(tabs);
  const musicTabButton = document.createElement('button');
  musicTabButton.type = 'button';
  musicTabButton.textContent = '🎵 Music';
  tabs.appendChild(musicTabButton);
  const sfxTabButton = document.createElement('button');
  sfxTabButton.type = 'button';
  sfxTabButton.textContent = '🔊 SFX';
  tabs.appendChild(sfxTabButton);

  const musicSection = document.createElement('div');
  musicSection.className = 'kb-audio-section';
  root.appendChild(musicSection);
  const sfxSection = document.createElement('div');
  sfxSection.className = 'kb-audio-section';
  sfxSection.hidden = true;
  root.appendChild(sfxSection);

  function showTab(tab: 'music' | 'sfx'): void {
    musicSection.hidden = tab !== 'music';
    sfxSection.hidden = tab !== 'sfx';
    musicTabButton.classList.toggle('kb-audio-active', tab === 'music');
    sfxTabButton.classList.toggle('kb-audio-active', tab === 'sfx');
  }
  musicTabButton.addEventListener('click', () => {
    showTab('music');
  });
  sfxTabButton.addEventListener('click', () => {
    showTab('sfx');
  });
  showTab('music');

  const state = new AudioEditorState();

  const [tracks, instruments] = await Promise.all([fetchTracks(), fetchInstruments()]);
  state.loadTracksAndInstruments(tracks, instruments);
  state.selectedTrackId = tracks[0]?.id ?? null;
  const instrumentsById = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  createSfxPanel(sfxSection, instrumentsById);

  const transport = document.createElement('div');
  transport.className = 'kb-audio-transport';
  musicSection.appendChild(transport);

  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.textContent = '▶ Play loop';
  transport.appendChild(playButton);

  const recordButton = document.createElement('button');
  recordButton.type = 'button';
  recordButton.textContent = '⏺ Record (MIDI)';
  transport.appendChild(recordButton);

  const bpmLabel = document.createElement('label');
  bpmLabel.textContent = 'BPM';
  const bpmInput = document.createElement('input');
  bpmInput.type = 'number';
  bpmInput.min = '30';
  bpmInput.max = '300';
  bpmInput.value = String(state.bpm);
  bpmInput.addEventListener('input', () => {
    state.bpm = Number.parseInt(bpmInput.value, 10) || 120;
  });
  bpmLabel.appendChild(bpmInput);
  transport.appendChild(bpmLabel);

  const loopBeatsLabel = document.createElement('label');
  loopBeatsLabel.textContent = 'Loop beats';
  const loopBeatsInput = document.createElement('input');
  loopBeatsInput.type = 'number';
  loopBeatsInput.min = '1';
  loopBeatsInput.max = '64';
  loopBeatsInput.value = String(state.loop.loopBeats);
  loopBeatsInput.addEventListener('change', () => {
    state.setLoopBeats(Number.parseInt(loopBeatsInput.value, 10) || 8);
  });
  loopBeatsLabel.appendChild(loopBeatsInput);
  transport.appendChild(loopBeatsLabel);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear loop';
  clearButton.addEventListener('click', () => {
    state.clearLoop();
  });
  transport.appendChild(clearButton);

  const laneLabel = document.createElement('label');
  laneLabel.textContent = 'Add lane';
  const laneSelect = document.createElement('select');
  for (const instrument of instruments) {
    const option = document.createElement('option');
    option.value = instrument.id;
    option.textContent = instrument.name;
    laneSelect.appendChild(option);
  }
  laneSelect.addEventListener('change', () => {
    state.selectedInstrumentId = laneSelect.value;
  });
  laneLabel.appendChild(laneSelect);
  transport.appendChild(laneLabel);

  const addLaneButton = document.createElement('button');
  addLaneButton.type = 'button';
  addLaneButton.textContent = '+ lane';
  addLaneButton.addEventListener('click', () => {
    state.addLane(laneSelect.value);
  });
  transport.appendChild(addLaneButton);

  const midiStatus = document.createElement('span');
  midiStatus.className = 'kb-audio-midi-devices';
  transport.appendChild(midiStatus);

  const pianoRollHost = document.createElement('div');
  musicSection.appendChild(pianoRollHost);
  const pianoRoll = createPianoRoll(state, pianoRollHost, instrumentsById);

  const panelsRow = document.createElement('div');
  panelsRow.style.display = 'flex';
  panelsRow.style.gap = '12px';
  panelsRow.style.flexWrap = 'wrap';
  musicSection.appendChild(panelsRow);
  createTrackPanel(state, panelsRow);

  const player = createLoopPlayer(state, instrumentsById);
  playButton.addEventListener('click', () => {
    if (state.isPlaying) {
      player.stop();
    } else {
      player.start();
    }
  });

  recordButton.addEventListener('click', () => {
    state.recordArmed = !state.recordArmed;
    state.notify();
  });

  const midi = createMidiInput(state, (instrument, note) => {
    pianoRoll.preview(instrument, note);
  });
  function refreshMidiStatus(): void {
    const names = midi.deviceNames();
    midiStatus.textContent =
      names.length > 0 ? `MIDI: ${names.join(', ')}` : 'MIDI: no device connected';
  }
  window.setInterval(refreshMidiStatus, 1500);
  refreshMidiStatus();

  state.subscribe(() => {
    playButton.textContent = state.isPlaying ? '■ Stop' : '▶ Play loop';
    playButton.classList.toggle('kb-audio-active', state.isPlaying);
    recordButton.classList.toggle('kb-audio-active', state.recordArmed);
    if (document.activeElement !== bpmInput) {
      bpmInput.value = String(state.bpm);
    }
    if (document.activeElement !== loopBeatsInput) {
      loopBeatsInput.value = String(state.loop.loopBeats);
    }
  });
}

void boot();
