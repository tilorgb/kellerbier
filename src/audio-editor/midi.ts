import { resumeAudioContext } from '../app/audio/context.js';
import { midiToNote } from './pitch.js';
import type { AudioEditorState } from './state.js';

export interface MidiInputHandle {
  destroy(): void;
  /** Device names currently connected, for the picker to list. */
  deviceNames(): string[];
}

const STEPS_PER_BEAT = 2;

/**
 * Web MIDI input (types in `web-midi.d.ts` — not part of TypeScript's
 * shipped DOM lib): a connected keyboard plays live through whichever
 * instrument is selected (`state.selectedInstrumentId`) via `preview`, and —
 * while both "record" is armed and the loop is playing — a note-on lands in
 * the loop at the playhead's position, quantized to the same grid the piano
 * roll draws (`STEPS_PER_BEAT`).
 *
 * `navigator.requestMIDIAccess` is refused by some browsers/contexts
 * (no HTTPS, no permission, not implemented at all) — `createMidiInput`
 * degrades to "no devices" rather than throwing either way, the same
 * "off-browser is a no-op" contract `app/audio/context.ts` already keeps.
 */
export function createMidiInput(
  state: AudioEditorState,
  preview: (instrument: string, note: string) => void,
): MidiInputHandle {
  const activeInputs = new Set<MIDIInput>();

  function handleMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (data === null || data.length < 3) {
      return;
    }
    const [status, noteNumber, velocity] = data;
    const command = (status ?? 0) & 0xf0;
    const isNoteOn = command === 0x90 && (velocity ?? 0) > 0;
    if (!isNoteOn) {
      return;
    }
    resumeAudioContext();
    const note = midiToNote(noteNumber ?? 60);
    preview(state.selectedInstrumentId, note);

    if (state.recordArmed && state.isPlaying) {
      const beat = Math.round(state.playheadBeat * STEPS_PER_BEAT) / STEPS_PER_BEAT;
      state.setNote(
        state.selectedInstrumentId,
        beat % state.loop.loopBeats,
        note,
        1 / STEPS_PER_BEAT,
      );
    }
  }

  function attach(input: MIDIInput): void {
    if (activeInputs.has(input)) {
      return;
    }
    activeInputs.add(input);
    input.addEventListener('midimessage', handleMessage);
  }

  function detach(input: MIDIInput): void {
    activeInputs.delete(input);
    input.removeEventListener('midimessage', handleMessage);
  }

  if (typeof navigator.requestMIDIAccess === 'function') {
    navigator
      .requestMIDIAccess()
      .then((access) => {
        for (const input of access.inputs.values()) {
          attach(input);
        }
        access.addEventListener('statechange', (event) => {
          const port = event.port;
          if (port?.type !== 'input') {
            return;
          }
          const input = port as MIDIInput;
          if (port.state === 'connected') {
            attach(input);
          } else {
            detach(input);
          }
        });
      })
      .catch(() => {
        // No permission, no device, or the browser doesn't implement it —
        // the picker simply reports zero devices; live-play still works via
        // the on-screen piano roll and grid clicks either way.
      });
  }

  return {
    destroy(): void {
      for (const input of [...activeInputs]) {
        detach(input);
      }
    },
    deviceNames(): string[] {
      return [...activeInputs].map((input) => input.name ?? 'MIDI device');
    },
  };
}
