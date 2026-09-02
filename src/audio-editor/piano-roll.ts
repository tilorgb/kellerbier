import { getAudioContext, getMasterGain, resumeAudioContext } from '../app/audio/context.js';
import { playTone } from '../app/audio/synth.js';
import type { InstrumentDefinition } from '../app/audio/types.js';
import { defaultRangeFor, midiToNote, noteToMidi } from './pitch.js';
import type { AudioEditorState } from './state.js';

export interface PianoRollHandle {
  destroy(): void;
  /** Plays `note` on `instrument` immediately — MIDI input's live-play hook. */
  preview(instrument: string, note: string): void;
}

/** TS does not retain a nullability narrowing across a later closure boundary (`render` below), even for a `const` — resolving through a function whose return type is already non-null sidesteps that rather than re-asserting at every call site. */
function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('2D canvas context unavailable');
  }
  return ctx;
}

const CELL_WIDTH = 22;
const CELL_HEIGHT = 14;
const LABEL_WIDTH = 56;

/**
 * The Cubase-style loop editor: one piano-roll lane per instrument in
 * `state.loop.lanes`, sharing one beat grid. A cell click toggles a note on
 * or off (and previews it through the real synth,
 * `app/audio/synth.ts`'s `playTone` — the same code the shipped game plays
 * a track with, so what's heard here is what ships), the playhead sweeps
 * across every lane in lock-step during playback, and adding/removing a
 * lane just adds/removes a row of canvas — the notes underneath are the
 * single source of truth (`state.loop.notes`), never per-lane state.
 */
export function createPianoRoll(
  state: AudioEditorState,
  host: HTMLElement,
  instrumentsById: ReadonlyMap<string, InstrumentDefinition>,
): PianoRollHandle {
  const root = document.createElement('div');
  root.className = 'kb-audio-piano-roll';
  host.appendChild(root);

  const lanesContainer = document.createElement('div');
  root.appendChild(lanesContainer);

  const laneHandles = new Map<string, LaneHandle>();

  function render(): void {
    // Remove lanes no longer in `state.loop.lanes`.
    for (const [instrument, handle] of laneHandles) {
      if (!state.loop.lanes.includes(instrument)) {
        handle.destroy();
        laneHandles.delete(instrument);
      }
    }
    // Add/update lanes in order.
    for (const instrument of state.loop.lanes) {
      let handle = laneHandles.get(instrument);
      if (handle === undefined) {
        handle = createLane(instrument, state, preview);
        laneHandles.set(instrument, handle);
      }
      lanesContainer.appendChild(handle.root); // reorders to match `lanes`
      handle.render();
    }
  }

  function preview(instrument: string, note: string): void {
    resumeAudioContext();
    const ctx = getAudioContext();
    const destination = getMasterGain();
    const instrumentDef = instrumentsById.get(instrument);
    if (ctx === null || destination === null || instrumentDef === undefined) {
      return;
    }
    playTone(ctx, destination, instrumentDef, note, ctx.currentTime, 0.35, 1);
  }

  const unsubscribe = state.subscribe(render);
  render();

  return {
    destroy(): void {
      unsubscribe();
      for (const handle of laneHandles.values()) {
        handle.destroy();
      }
      root.remove();
    },
    preview,
  };
}

interface LaneHandle {
  readonly root: HTMLElement;
  render(): void;
  destroy(): void;
}

function createLane(
  instrument: string,
  state: AudioEditorState,
  preview: (instrument: string, note: string) => void,
): LaneHandle {
  const root = document.createElement('div');
  root.className = 'kb-audio-lane';

  const header = document.createElement('div');
  header.className = 'kb-audio-lane-header';
  const title = document.createElement('span');
  title.textContent = instrument;
  header.appendChild(title);
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.textContent = '✕';
  removeButton.title = 'Remove lane';
  removeButton.addEventListener('click', () => {
    state.removeLane(instrument);
  });
  header.appendChild(removeButton);
  root.appendChild(header);

  const scroller = document.createElement('div');
  scroller.className = 'kb-audio-lane-scroller';
  root.appendChild(scroller);

  const canvas = document.createElement('canvas');
  scroller.appendChild(canvas);
  const ctx2d = get2dContext(canvas);

  const [lowMidi, highMidi] = defaultRangeFor(instrument);

  function stepsPerBeat(): number {
    return 2;
  }

  function rowCount(): number {
    return highMidi - lowMidi + 1;
  }

  function columnCount(): number {
    return Math.round(state.loop.loopBeats * stepsPerBeat());
  }

  function render(): void {
    const cols = columnCount();
    const rows = rowCount();
    canvas.width = LABEL_WIDTH + cols * CELL_WIDTH;
    canvas.height = rows * CELL_HEIGHT;
    scroller.style.height = `${String(Math.min(rows * CELL_HEIGHT, 220))}px`;

    ctx2d.fillStyle = '#1b1622';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);

    // Pitch-row labels and alternating black/white-key shading.
    for (let row = 0; row < rows; row++) {
      const midi = highMidi - row;
      const name = midiToNote(midi);
      const isBlackKey = name.includes('#');
      ctx2d.fillStyle = isBlackKey ? '#14101a' : '#241d2e';
      ctx2d.fillRect(LABEL_WIDTH, row * CELL_HEIGHT, cols * CELL_WIDTH, CELL_HEIGHT);
      ctx2d.fillStyle = name.startsWith('C') && !isBlackKey ? '#f0c46a' : '#8a7f74';
      ctx2d.font = '9px ui-monospace, monospace';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(name, 4, row * CELL_HEIGHT + CELL_HEIGHT / 2);
    }

    // Beat grid lines — a brighter line every beat, dim within it.
    ctx2d.strokeStyle = '#3d3348';
    for (let col = 0; col <= cols; col++) {
      const x = LABEL_WIDTH + col * CELL_WIDTH;
      ctx2d.lineWidth = col % stepsPerBeat() === 0 ? 1.5 : 0.5;
      ctx2d.beginPath();
      ctx2d.moveTo(x, 0);
      ctx2d.lineTo(x, canvas.height);
      ctx2d.stroke();
    }

    // This lane's notes.
    for (const note of state.loop.notes) {
      if (note.instrument !== instrument) {
        continue;
      }
      const midi = noteToMidi(note.note);
      if (midi < lowMidi || midi > highMidi) {
        continue;
      }
      const row = highMidi - midi;
      const x = LABEL_WIDTH + note.beat * stepsPerBeat() * CELL_WIDTH;
      const width = note.durationBeats * stepsPerBeat() * CELL_WIDTH;
      ctx2d.fillStyle = '#f0c46a';
      ctx2d.fillRect(x + 1, row * CELL_HEIGHT + 1, Math.max(2, width - 2), CELL_HEIGHT - 2);
    }

    // Playhead.
    if (state.isPlaying) {
      const x = LABEL_WIDTH + state.playheadBeat * stepsPerBeat() * CELL_WIDTH;
      ctx2d.strokeStyle = '#e0703a';
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.moveTo(x, 0);
      ctx2d.lineTo(x, canvas.height);
      ctx2d.stroke();
    }
  }

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < LABEL_WIDTH) {
      return;
    }
    const col = Math.floor((x - LABEL_WIDTH) / CELL_WIDTH);
    const row = Math.floor(y / CELL_HEIGHT);
    const midi = highMidi - row;
    if (row < 0 || row >= rowCount() || col < 0 || col >= columnCount()) {
      return;
    }
    const beat = col / stepsPerBeat();
    const note = midiToNote(midi);
    state.selectedInstrumentId = instrument;
    state.toggleNote(instrument, beat, note, 1 / stepsPerBeat());
    preview(instrument, note);
  });

  return {
    root,
    render,
    destroy: () => {
      root.remove();
    },
  };
}
