/**
 * Note name <-> MIDI note number, shared by the piano roll (row <-> pitch)
 * and MIDI input (device note number <-> pitch). `app/audio/synth.ts` only
 * ever needs name -> Hz; this is the inverse direction that a grid of rows
 * and a physical keyboard both need, kept here rather than duplicated in both.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SEMITONE_FROM_C: Readonly<Record<string, number>> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};
const NOTE_PATTERN = /^([A-G])(#|b)?(-?\d+)$/;

export function noteToMidi(name: string): number {
  const match = NOTE_PATTERN.exec(name);
  if (match === null) {
    throw new Error(`not a note: "${name}"`);
  }
  const [, letter, accidental, octaveText] = match;
  if (letter === undefined || octaveText === undefined) {
    throw new Error(`not a note: "${name}"`);
  }
  const key = accidental === undefined ? letter : `${letter}${accidental}`;
  const semitone = SEMITONE_FROM_C[key];
  if (semitone === undefined) {
    throw new Error(`not a note: "${name}"`);
  }
  return (Number.parseInt(octaveText, 10) + 1) * 12 + semitone;
}

export function midiToNote(midi: number): string {
  const semitone = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[semitone];
  if (name === undefined) {
    throw new Error(`impossible semitone: ${String(semitone)}`);
  }
  return `${name}${String(octave)}`;
}

/** A sensible default piano-roll pitch range (low..high MIDI, inclusive) per instrument, by register. */
const DEFAULT_RANGE_BY_INSTRUMENT: Readonly<Record<string, readonly [number, number]>> = {
  tuba: [noteToMidi('C1'), noteToMidi('C3')],
  accordion: [noteToMidi('C3'), noteToMidi('C5')],
  clarinet: [noteToMidi('C3'), noteToMidi('C5')],
  'brass-stab': [noteToMidi('C3'), noteToMidi('C5')],
  bell: [noteToMidi('C4'), noteToMidi('C6')],
};

export function defaultRangeFor(instrumentId: string): readonly [number, number] {
  return DEFAULT_RANGE_BY_INSTRUMENT[instrumentId] ?? [noteToMidi('C3'), noteToMidi('C5')];
}
