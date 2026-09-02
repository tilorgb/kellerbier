import { injectDevUiTokens } from '../dev-ui/tokens.js';
import { fetchInstruments, fetchTracks } from './api-client.js';
import { createBarksPanel } from './barks-panel.js';
import { createEnemyCategoryPanel } from './enemy-category-panel.js';
import { createLoopLibraryPanel } from './loop-library-panel.js';
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
.kb-audio-hint { margin: -4px 0 10px; color: var(--kb-color-text-subtle); font-size: 11px; line-height: 1.4; }

.kb-audio-panel-wide { max-width: 720px; }
.kb-audio-enemy-table { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; max-height: 480px; overflow-y: auto; }
.kb-audio-enemy-row {
  display: flex; align-items: center; gap: 8px; padding: 4px 6px;
  border-radius: var(--kb-radius-sm); background: var(--kb-color-surface-2);
}
.kb-audio-enemy-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kb-audio-enemy-row select { width: 100px; }
.kb-audio-enemy-row button {
  font: inherit; color: var(--kb-color-text); background: var(--kb-color-surface-3);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 3px 8px; cursor: pointer;
}

.kb-audio-loop-list { display: flex; flex-direction: column; gap: 4px; }
.kb-audio-loop-row {
  display: flex; align-items: center; gap: 8px; padding: 4px 6px;
  border-radius: var(--kb-radius-sm); background: var(--kb-color-surface-2);
}
.kb-audio-loop-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kb-audio-loop-row button {
  font: inherit; color: var(--kb-color-text); background: var(--kb-color-surface-3);
  border: 1px solid var(--kb-color-surface-4); border-radius: var(--kb-radius-sm);
  padding: 3px 8px; cursor: pointer;
}
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

  // Four tabs, one job each — a track's melody, a one-shot cue's synth
  // parameters, a voice line's motif, and a sorting table are different
  // enough editing tasks that a single crowded page would mean scrolling
  // past three of them to reach the fourth; Cubase keeps the same split
  // (key editor, sample editor, mixer) for the same reason.
  const TAB_IDS = ['music', 'sfx', 'barks', 'enemies'] as const;
  type TabId = (typeof TAB_IDS)[number];
  const TAB_LABELS: Record<TabId, string> = {
    music: '🎵 Music',
    sfx: '🔊 SFX',
    barks: '🗣️ Barks',
    enemies: '👹 Enemy sounds',
  };

  const tabs = document.createElement('div');
  tabs.className = 'kb-audio-tabs';
  root.appendChild(tabs);

  function buildTab(id: TabId): { button: HTMLButtonElement; section: HTMLDivElement } {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = TAB_LABELS[id];
    button.addEventListener('click', () => {
      showTab(id);
    });
    tabs.appendChild(button);

    const section = document.createElement('div');
    section.className = 'kb-audio-section';
    section.hidden = true;
    root.appendChild(section);

    return { button, section };
  }

  const musicTab = buildTab('music');
  const sfxTab = buildTab('sfx');
  const barksTab = buildTab('barks');
  const enemiesTab = buildTab('enemies');
  const musicSection = musicTab.section;
  const sfxSection = sfxTab.section;
  const barksSection = barksTab.section;
  const enemiesSection = enemiesTab.section;
  const allTabs: Record<TabId, { button: HTMLButtonElement; section: HTMLDivElement }> = {
    music: musicTab,
    sfx: sfxTab,
    barks: barksTab,
    enemies: enemiesTab,
  };

  function showTab(tab: TabId): void {
    for (const id of TAB_IDS) {
      allTabs[id].section.hidden = id !== tab;
      allTabs[id].button.classList.toggle('kb-audio-active', id === tab);
    }
  }
  showTab('music');

  const state = new AudioEditorState();

  const [tracks, instruments] = await Promise.all([fetchTracks(), fetchInstruments()]);
  state.loadTracksAndInstruments(tracks, instruments);
  state.selectedTrackId = tracks[0]?.id ?? null;
  const instrumentsById = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  createSfxPanel(sfxSection, instrumentsById);
  createBarksPanel(barksSection, instrumentsById);
  createEnemyCategoryPanel(enemiesSection, instrumentsById);

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

  const durationLabel = document.createElement('label');
  durationLabel.textContent = 'Note length';
  const durationSelect = document.createElement('select');
  // "Beats" is a quarter note here, the usual convention — 0.5 beats is an
  // eighth note, 4 beats a whole note.
  const DURATION_OPTIONS: readonly { beats: number; label: string }[] = [
    { beats: 0.125, label: '1/32' },
    { beats: 0.25, label: '1/16' },
    { beats: 0.5, label: '1/8' },
    { beats: 1, label: '1/4' },
    { beats: 2, label: '1/2' },
    { beats: 4, label: 'whole' },
    { beats: 8, label: 'double' },
  ];
  for (const option of DURATION_OPTIONS) {
    const el = document.createElement('option');
    el.value = String(option.beats);
    el.textContent = `${option.label} note`;
    durationSelect.appendChild(el);
  }
  durationSelect.value = String(state.defaultNoteDurationBeats);
  durationSelect.addEventListener('change', () => {
    state.defaultNoteDurationBeats = Number.parseFloat(durationSelect.value) || 0.5;
  });
  durationLabel.appendChild(durationSelect);
  transport.appendChild(durationLabel);

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

  function onSaveLane(instrument: string): void {
    const suggested = `${instrument} loop`;
    const name = window.prompt('Save this lane as a loop named:', suggested);
    if (name === null || name.trim().length === 0) {
      return;
    }
    state.saveLaneAsLoop(name.trim(), instrument);
  }

  const pianoRollHost = document.createElement('div');
  musicSection.appendChild(pianoRollHost);
  const pianoRoll = createPianoRoll(state, pianoRollHost, instrumentsById, onSaveLane);

  const panelsRow = document.createElement('div');
  panelsRow.style.display = 'flex';
  panelsRow.style.gap = '12px';
  panelsRow.style.flexWrap = 'wrap';
  musicSection.appendChild(panelsRow);
  createTrackPanel(state, panelsRow);
  createLoopLibraryPanel(state, panelsRow);

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
