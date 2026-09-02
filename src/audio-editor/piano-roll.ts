import { getAudioContext, getMasterGain, resumeAudioContext } from '../app/audio/context.js';
import { playTone } from '../app/audio/synth.js';
import type { InstrumentDefinition } from '../app/audio/types.js';
import { defaultRangeFor, midiToNote } from './pitch.js';
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
const RESIZE_HANDLE_PX = 6;
const MIN_DURATION_BEATS = 0.125;

/** One row of the grid — a pitch for a tonal lane, a drum voice for a percussion one. */
interface Row {
  /** What gets written into `LoopNote.note` — a pitch name, or a `DrumVoice.id`. */
  key: string;
  label: string;
  /** Tonal: the row is a natural-note ("white key") row. Percussion: alternate rows, for readability, no musical meaning. */
  accent: boolean;
}

function rowsFor(instrument: InstrumentDefinition): Row[] {
  if (instrument.kind === 'percussion') {
    return instrument.voices.map((voice, index) => ({
      key: voice.id,
      label: voice.label,
      accent: index % 2 === 0,
    }));
  }
  const [lowMidi, highMidi] = defaultRangeFor(instrument.id);
  const rows: Row[] = [];
  for (let midi = highMidi; midi >= lowMidi; midi -= 1) {
    const name = midiToNote(midi);
    rows.push({ key: name, label: name, accent: name.startsWith('C') && !name.includes('#') });
  }
  return rows;
}

/**
 * The Cubase-style loop editor: one piano-roll lane per instrument in
 * `state.loop.lanes`, sharing one beat grid. A cell click adds a note at
 * `state.defaultNoteDurationBeats` (and previews it through the real synth,
 * `app/audio/synth.ts`'s `playTone` — the same code the shipped game plays
 * a track with, so what's heard here is what ships); dragging an existing
 * note's right edge changes its length instead of adding a new one.
 *
 * A percussion lane (`InstrumentDefinition.kind === 'percussion'`) draws
 * its `DrumVoice`s as fixed rows instead of a pitch range — `rowsFor`
 * is the one place that branches on `kind`; everything below it works off
 * `Row.key`, tonal or not.
 *
 * The playhead sweeps across every lane in lock-step during playback, and
 * every edit — including mid-playback, clicking a cell or dragging a note
 * while the loop plays — lands in `state.loop.notes` immediately, which
 * `playback.ts`'s scheduler reads fresh every animation frame; there is no
 * "stop to edit" mode.
 */
export function createPianoRoll(
  state: AudioEditorState,
  host: HTMLElement,
  instrumentsById: ReadonlyMap<string, InstrumentDefinition>,
  onSaveLane: (instrument: string) => void,
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
        const instrumentDef = instrumentsById.get(instrument);
        if (instrumentDef === undefined) {
          continue;
        }
        handle = createLane(instrument, instrumentDef, state, preview, onSaveLane);
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
  instrumentDef: InstrumentDefinition,
  state: AudioEditorState,
  preview: (instrument: string, note: string) => void,
  onSaveLane: (instrument: string) => void,
): LaneHandle {
  const root = document.createElement('div');
  root.className = 'kb-audio-lane';

  const header = document.createElement('div');
  header.className = 'kb-audio-lane-header';
  const title = document.createElement('span');
  title.textContent = instrumentDef.name;
  header.appendChild(title);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = '💾';
  saveButton.title = 'Save this lane as a loop';
  saveButton.addEventListener('click', () => {
    onSaveLane(instrument);
  });
  header.appendChild(saveButton);

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

  const rows = rowsFor(instrumentDef);
  const rowIndexByKey = new Map(rows.map((row, index) => [row.key, index]));

  function stepsPerBeat(): number {
    return 4;
  }

  function columnCount(): number {
    return Math.round(state.loop.loopBeats * stepsPerBeat());
  }

  function render(): void {
    const cols = columnCount();
    canvas.width = LABEL_WIDTH + cols * CELL_WIDTH;
    canvas.height = rows.length * CELL_HEIGHT;
    scroller.style.height = `${String(Math.min(rows.length * CELL_HEIGHT, 220))}px`;

    ctx2d.fillStyle = '#1b1622';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);

    // Row labels and alternating shading.
    rows.forEach((row, index) => {
      ctx2d.fillStyle = row.accent ? '#14101a' : '#241d2e';
      ctx2d.fillRect(LABEL_WIDTH, index * CELL_HEIGHT, cols * CELL_WIDTH, CELL_HEIGHT);
      ctx2d.fillStyle = row.accent ? '#f0c46a' : '#8a7f74';
      ctx2d.font = '9px ui-monospace, monospace';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(row.label, 4, index * CELL_HEIGHT + CELL_HEIGHT / 2);
    });

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
      const row = rowIndexByKey.get(note.note);
      if (row === undefined) {
        continue;
      }
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

  function positionOf(event: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** The note (if any) at this exact row/beat, and whether the click landed on its resize handle (its right edge). */
  function hitTest(
    x: number,
    y: number,
  ): { note: (typeof state.loop.notes)[number]; resizing: boolean } | null {
    const row = Math.floor(y / CELL_HEIGHT);
    if (row < 0 || row >= rows.length) {
      return null;
    }
    const rowEntry = rows[row];
    if (rowEntry === undefined) {
      return null;
    }
    const beat = (x - LABEL_WIDTH) / (stepsPerBeat() * CELL_WIDTH);
    const note = state.loop.notes.find(
      (n) =>
        n.instrument === instrument &&
        n.note === rowEntry.key &&
        beat >= n.beat &&
        beat < n.beat + n.durationBeats,
    );
    if (note === undefined) {
      return null;
    }
    const noteRightX = LABEL_WIDTH + (note.beat + note.durationBeats) * stepsPerBeat() * CELL_WIDTH;
    return { note, resizing: noteRightX - x <= RESIZE_HANDLE_PX };
  }

  // Pointer capture (not window-level mouse listeners) so a drag keeps
  // reporting to this exact canvas even once the pointer leaves it, with
  // nothing to unregister in `destroy()` — the capture ends with the
  // pointer-up on its own.
  let resizingNoteId: number | null = null;
  // `pointerup` clears `resizingNoteId` before the browser's synthetic
  // `click` for the same gesture fires, so the click handler needs its own
  // flag to know "that click was the tail end of a resize drag, not a
  // fresh tap" — otherwise releasing a resize also toggles the note off.
  let justFinishedResize = false;

  canvas.addEventListener('pointerdown', (event) => {
    const { x, y } = positionOf(event);
    if (x < LABEL_WIDTH) {
      return;
    }
    const hit = hitTest(x, y);
    if (hit?.resizing === true) {
      resizingNoteId = hit.note.id;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (resizingNoteId === null) {
      return;
    }
    const { x } = positionOf(event);
    const note = state.loop.notes.find((n) => n.id === resizingNoteId);
    if (note === undefined) {
      resizingNoteId = null;
      return;
    }
    const rawBeat = (x - LABEL_WIDTH) / (stepsPerBeat() * CELL_WIDTH);
    const snapped = Math.round(rawBeat * stepsPerBeat()) / stepsPerBeat();
    const duration = Math.max(MIN_DURATION_BEATS, snapped - note.beat);
    state.resizeNote(note.id, duration);
  });

  canvas.addEventListener('pointerup', (event) => {
    if (resizingNoteId !== null) {
      canvas.releasePointerCapture(event.pointerId);
      justFinishedResize = true;
    }
    resizingNoteId = null;
  });

  canvas.addEventListener('click', (event) => {
    if (justFinishedResize) {
      // The pointer-up that just ended a resize also fires a click; swallow
      // it so releasing a drag doesn't also toggle the note it resized.
      justFinishedResize = false;
      return;
    }
    const { x, y } = positionOf(event);
    if (x < LABEL_WIDTH) {
      return;
    }
    const row = Math.floor(y / CELL_HEIGHT);
    if (row < 0 || row >= rows.length) {
      return;
    }
    const rowEntry = rows[row];
    if (rowEntry === undefined) {
      return;
    }
    const col = Math.floor((x - LABEL_WIDTH) / CELL_WIDTH);
    if (col < 0 || col >= columnCount()) {
      return;
    }
    const beat = col / stepsPerBeat();
    state.selectedInstrumentId = instrument;
    state.toggleNote(instrument, beat, rowEntry.key, state.defaultNoteDurationBeats);
    preview(instrument, rowEntry.key);
  });

  return {
    root,
    render,
    destroy: () => {
      root.remove();
    },
  };
}
