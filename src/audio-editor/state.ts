import type { InstrumentDefinition, NoteEvent, TrackDefinition } from '../app/audio/types.js';

/**
 * One note in the loop being composed — the editor's own shape, close to
 * `NoteEvent` but with a stable `id` (for click-to-select/delete on the
 * piano roll) and always a single pitch, never a chord: a chord is just
 * several notes sharing a beat and an instrument, the same way playing one
 * on a real keyboard would enter it.
 */
export interface LoopNote {
  readonly id: number;
  instrument: string;
  beat: number;
  durationBeats: number;
  note: string;
  velocity: number;
}

/**
 * A Cubase-style "pattern": a fixed-length loop with one lane per
 * instrument in use, each lane holding whichever of `notes` name that
 * instrument. `lanes` is tracked separately from `notes` so an instrument
 * can have an empty lane open (about to record into it) without a note
 * artificially holding it there.
 */
export interface EditorLoop {
  loopBeats: number;
  /** 30 = 120 BPM, matching `content/enemies/blaskapellist.ts`'s grid — the editor's default, not a requirement. */
  ticksPerBeat: number;
  lanes: string[];
  notes: LoopNote[];
}

export function blankLoop(): EditorLoop {
  return { loopBeats: 8, ticksPerBeat: 30, lanes: ['accordion'], notes: [] };
}

/**
 * A named, single-instrument loop saved for reuse — "the tuba part",
 * composed and kept on its own, independently of whatever is currently
 * being combined into the working loop. Persisted to `localStorage` (per
 * browser, not through the server — this is a scratch workspace, not
 * shipped content; the working loop it gets combined into is what actually
 * saves to `content/audio/tracks.ts`, via the existing track panel).
 */
export interface SavedInstrumentLoop {
  readonly name: string;
  readonly instrument: string;
  readonly loopBeats: number;
  readonly notes: readonly Omit<LoopNote, 'id'>[];
}

const LOOP_LIBRARY_STORAGE_KEY = 'kellerbier-audio-editor-loop-library';

function loadLoopLibrary(): SavedInstrumentLoop[] {
  try {
    const raw = window.localStorage.getItem(LOOP_LIBRARY_STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedInstrumentLoop[]) : [];
  } catch {
    // Private browsing, a full quota, a hand-edited/corrupt value — a
    // scratch workspace starting empty beats the whole editor failing to boot.
    return [];
  }
}

function persistLoopLibrary(loops: readonly SavedInstrumentLoop[]): void {
  try {
    window.localStorage.setItem(LOOP_LIBRARY_STORAGE_KEY, JSON.stringify(loops));
  } catch {
    // Same reasoning as `loadLoopLibrary` — losing the save silently is
    // better than an uncaught exception out of a click handler.
  }
}

type Listener = () => void;

/**
 * The editor's whole mutable state — one loop being composed, the live
 * track/instrument catalog loaded from the server, and playback/record
 * transport flags. One instance per boot, `subscribe`d by every panel, the
 * same shape `src/editor/state.ts`'s `EditorState` already uses.
 */
export class AudioEditorState {
  instruments: InstrumentDefinition[] = [];
  tracks: TrackDefinition[] = [];
  loop: EditorLoop = blankLoop();
  selectedInstrumentId = 'accordion';
  selectedTrackId: string | null = null;
  /** Duration a newly-placed note gets, in beats — the piano roll's "note length" control. Drag-resize (`resizeNote`) overrides it per note afterward. */
  defaultNoteDurationBeats = 0.5;
  isPlaying = false;
  /** Current playback position, in beats from loop start — the piano roll's playhead. */
  playheadBeat = 0;
  recordArmed = false;
  bpm = 120;
  savedLoops: SavedInstrumentLoop[] = typeof window === 'undefined' ? [] : loadLoopLibrary();

  private nextNoteId = 1;
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  addLane(instrument: string): void {
    if (!this.loop.lanes.includes(instrument)) {
      this.loop.lanes.push(instrument);
      this.notify();
    }
  }

  removeLane(instrument: string): void {
    this.loop.lanes = this.loop.lanes.filter((id) => id !== instrument);
    this.loop.notes = this.loop.notes.filter((note) => note.instrument !== instrument);
    this.notify();
  }

  /** Adds a note, or — if one already sits at this exact instrument/beat/pitch — removes it (a toggle, for a single grid click). */
  toggleNote(instrument: string, beat: number, note: string, durationBeats: number): void {
    const existing = this.loop.notes.find(
      (n) => n.instrument === instrument && n.beat === beat && n.note === note,
    );
    if (existing !== undefined) {
      this.loop.notes = this.loop.notes.filter((n) => n.id !== existing.id);
    } else {
      this.loop.notes.push({
        id: this.nextNoteId++,
        instrument,
        beat,
        durationBeats,
        note,
        velocity: 1,
      });
    }
    this.notify();
  }

  /** Upsert, unlike `toggleNote` — MIDI recording always wants a note placed, never removed by landing on one that's already there. */
  setNote(
    instrument: string,
    beat: number,
    note: string,
    durationBeats: number,
    velocity = 1,
  ): void {
    this.loop.notes = this.loop.notes.filter(
      (n) => !(n.instrument === instrument && n.beat === beat && n.note === note),
    );
    this.loop.notes.push({
      id: this.nextNoteId++,
      instrument,
      beat,
      durationBeats,
      note,
      velocity,
    });
    this.notify();
  }

  removeNoteById(id: number): void {
    this.loop.notes = this.loop.notes.filter((note) => note.id !== id);
    this.notify();
  }

  resizeNote(id: number, durationBeats: number): void {
    const note = this.loop.notes.find((n) => n.id === id);
    if (note !== undefined) {
      note.durationBeats = Math.max(0.05, Math.min(durationBeats, this.loop.loopBeats - note.beat));
      this.notify();
    }
  }

  clearLoop(): void {
    this.loop.notes = [];
    this.notify();
  }

  setLoopBeats(loopBeats: number): void {
    this.loop.loopBeats = Math.max(1, loopBeats);
    this.loop.notes = this.loop.notes.filter((note) => note.beat < this.loop.loopBeats);
    this.notify();
  }

  loadTracksAndInstruments(tracks: TrackDefinition[], instruments: InstrumentDefinition[]): void {
    this.tracks = tracks;
    this.instruments = instruments;
    this.notify();
  }

  /** Saves `instrument`'s current notes in the working loop as a named, reusable loop. Overwrites a loop already saved under `name`. */
  saveLaneAsLoop(name: string, instrument: string): void {
    const notes = this.loop.notes
      .filter((note) => note.instrument === instrument)
      .map(({ id: _id, ...rest }) => rest);
    const saved: SavedInstrumentLoop = { name, instrument, loopBeats: this.loop.loopBeats, notes };
    this.savedLoops = [...this.savedLoops.filter((loop) => loop.name !== name), saved];
    persistLoopLibrary(this.savedLoops);
    this.notify();
  }

  deleteSavedLoop(name: string): void {
    this.savedLoops = this.savedLoops.filter((loop) => loop.name !== name);
    persistLoopLibrary(this.savedLoops);
    this.notify();
  }

  /**
   * Brings a saved loop into the working loop — "the final track where
   * each instrument comes together": adds a lane for its instrument if one
   * isn't open yet, and replaces that lane's notes with the saved ones
   * (not merged alongside whatever was already there, so clicking "add" a
   * second time updates the lane instead of doubling its notes). Notes
   * that would land past the working loop's own length are dropped, the
   * same "wouldn't fit" rule `mergeLoopIntoTrack` applies when a loop goes
   * into a shipped track.
   */
  addSavedLoopToWorkingLoop(name: string): void {
    const saved = this.savedLoops.find((loop) => loop.name === name);
    if (saved === undefined) {
      return;
    }
    this.loop.notes = this.loop.notes.filter((note) => note.instrument !== saved.instrument);
    for (const note of saved.notes) {
      if (note.beat + note.durationBeats > this.loop.loopBeats) {
        continue;
      }
      this.loop.notes.push({ ...note, id: this.nextNoteId++ });
    }
    this.addLane(saved.instrument);
    this.notify();
  }
}

let importedNoteId = -1;

/**
 * `NoteEvent[]` (as saved in `content/audio/tracks.ts`, chords included) ->
 * an `EditorLoop` the piano roll can show — "load this track into the
 * looper" for editing an existing track directly, the inverse of
 * `mergeLoopIntoTrack`. Chord events (`note: string[]`) split into one
 * `LoopNote` per pitch at the same beat/instrument, since the editor's own
 * model never carries a chord as one note (see `LoopNote`'s doc comment).
 */
export function eventsToLoop(
  events: readonly NoteEvent[],
  loopBeats: number,
  ticksPerBeat: number,
): EditorLoop {
  const notes: LoopNote[] = [];
  const lanes: string[] = [];
  for (const event of events) {
    if (!lanes.includes(event.instrument)) {
      lanes.push(event.instrument);
    }
    const pitches: readonly string[] = typeof event.note === 'string' ? [event.note] : event.note;
    for (const pitch of pitches) {
      notes.push({
        id: importedNoteId--,
        instrument: event.instrument,
        beat: event.beat,
        durationBeats: event.durationBeats,
        note: pitch,
        velocity: event.velocity ?? 1,
      });
    }
  }
  return { loopBeats, ticksPerBeat, lanes: lanes.length > 0 ? lanes : ['accordion'], notes };
}

export function loopNoteToEvent(note: LoopNote): NoteEvent {
  return {
    beat: note.beat,
    durationBeats: note.durationBeats,
    instrument: note.instrument,
    note: note.note,
    velocity: note.velocity,
  };
}

/**
 * The current loop's notes, offset by `atBeat`, merged onto an existing
 * track's events — "add this piece to the track". Notes that would land
 * past `trackLoopBeats` are dropped rather than silently corrupting the
 * track's own loop; the caller surfaces that count so the author can widen
 * the loop or move the offset instead.
 */
export function mergeLoopIntoTrack(
  existingEvents: readonly NoteEvent[],
  loop: EditorLoop,
  atBeat: number,
  trackLoopBeats: number,
): { events: NoteEvent[]; dropped: number } {
  const merged = [...existingEvents];
  let dropped = 0;
  for (const note of loop.notes) {
    const beat = note.beat + atBeat;
    if (beat + note.durationBeats > trackLoopBeats) {
      dropped += 1;
      continue;
    }
    merged.push({ ...loopNoteToEvent(note), beat });
  }
  return { events: merged, dropped };
}
