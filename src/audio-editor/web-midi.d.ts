/**
 * Minimal Web MIDI API ambient types — not part of TypeScript's shipped
 * `lib.dom.d.ts` (`tsconfig.json`'s `"lib"` list), and this editor only
 * ever touches this one small slice of it (`midi.ts`).
 */

interface MIDIPort extends EventTarget {
  readonly id: string;
  readonly name: string | null;
  readonly type: 'input' | 'output';
  readonly state: 'connected' | 'disconnected';
}

interface MIDIMessageEvent extends Event {
  readonly data: Uint8Array | null;
}

interface MIDIInput extends MIDIPort {
  readonly type: 'input';
  onmidimessage: ((event: MIDIMessageEvent) => void) | null;
  addEventListener(type: 'midimessage', listener: (event: MIDIMessageEvent) => void): void;
  removeEventListener(type: 'midimessage', listener: (event: MIDIMessageEvent) => void): void;
}

interface MIDIConnectionEvent extends Event {
  readonly port: MIDIPort | null;
}

interface MIDIAccess extends EventTarget {
  readonly inputs: ReadonlyMap<string, MIDIInput>;
  addEventListener(type: 'statechange', listener: (event: MIDIConnectionEvent) => void): void;
}

interface Navigator {
  requestMIDIAccess?: () => Promise<MIDIAccess>;
}
