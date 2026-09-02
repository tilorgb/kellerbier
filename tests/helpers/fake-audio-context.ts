/**
 * A minimal, in-memory stand-in for the Web Audio API, for tests that need
 * `app/audio/context.ts`'s real code paths to run past their `ctx === null`
 * guards — this project's own `vitest` config runs under
 * `environment: 'node'` (`vite.config.ts`), which has no `AudioContext` at
 * all, so `getAudioContext()` is otherwise silently a no-op everywhere.
 *
 * Every scheduling method (`setValueAtTime`, `linearRampToValueAtTime`, …)
 * applies its value immediately rather than modelling a real ramp's time
 * course — good enough to prove *what* got scheduled and in what order
 * (`FakeAudioParam.history`), not to reproduce the audible curve. Tests that
 * care about a scheduling *sequence* (a ducking envelope's dip-then-recover,
 * say) read `history` rather than `value` at an arbitrary instant.
 */

export interface RecordedAutomation {
  readonly method:
    | 'setValueAtTime'
    | 'linearRampToValueAtTime'
    | 'exponentialRampToValueAtTime'
    | 'setTargetAtTime'
    | 'cancelScheduledValues';
  readonly value?: number;
  readonly time: number;
}

export class FakeAudioParam {
  value: number;
  readonly history: RecordedAutomation[] = [];

  constructor(initial: number) {
    this.value = initial;
  }

  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.history.push({ method: 'setValueAtTime', value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.history.push({ method: 'linearRampToValueAtTime', value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.history.push({ method: 'exponentialRampToValueAtTime', value, time });
    return this;
  }

  setTargetAtTime(value: number, time: number, _timeConstant: number): this {
    this.value = value;
    this.history.push({ method: 'setTargetAtTime', value, time });
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.history.push({ method: 'cancelScheduledValues', time });
    return this;
  }
}

class FakeAudioNode {
  connections: FakeAudioNode[] = [];
  connected = true;

  connect(destination: FakeAudioNode): FakeAudioNode {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.connected = false;
    this.connections = [];
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1);
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam(350);
  readonly Q = new FakeAudioParam(1);
}

type EndedHandler = (() => void) | null;

export class FakeOscillatorNode extends FakeAudioNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam(440);
  readonly detune = new FakeAudioParam(0);
  onended: EndedHandler = null;
  started = false;
  stopped = false;
  stopTime: number | null = null;

  start(_when?: number): void {
    this.started = true;
  }

  stop(when?: number): void {
    if (this.stopped) {
      throw new DOMExceptionLike('cannot call stop more than once');
    }
    this.stopped = true;
    this.stopTime = when ?? 0;
  }
}

export class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: unknown = null;
  onended: EndedHandler = null;
  started = false;
  stopped = false;

  start(_when?: number, _offset?: number, _duration?: number): void {
    this.started = true;
  }

  stop(_when?: number): void {
    if (this.stopped) {
      throw new DOMExceptionLike('cannot call stop more than once');
    }
    this.stopped = true;
  }
}

class DOMExceptionLike extends Error {}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state: 'running' | 'suspended' | 'closed' = 'running';
  readonly destination = new FakeAudioNode();

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    return new FakeBiquadFilterNode();
  }

  createOscillator(): FakeOscillatorNode {
    return new FakeOscillatorNode();
  }

  createBufferSource(): FakeAudioBufferSourceNode {
    return new FakeAudioBufferSourceNode();
  }

  createBuffer(_channels: number, length: number, sampleRate: number): unknown {
    const data = new Float32Array(length);
    return {
      sampleRate,
      length,
      getChannelData: (): Float32Array => data,
    };
  }

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  /** Advances the fake clock — nothing here auto-fires `onended`; tests that need it call it directly. */
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}

/**
 * Installs a `FakeAudioContext` as the global `window.AudioContext`, so
 * `app/audio/context.ts#getAudioContext()` picks it up on next call. Returns
 * the instance it will construct — `resolveAudioContextCtor` calls `new
 * Ctor()` itself, so this stubs the constructor to always return the one
 * instance rather than handing back a pre-built one.
 *
 * Call `restore()` in the test's own cleanup; `context.ts` caches its
 * context in a module-level `let`, so a test suite that installs this needs
 * to reset that module between tests (`vi.resetModules()` and a fresh
 * `import()`) to get a clean context per test.
 */
export function installFakeAudioContext(): {
  readonly instance: FakeAudioContext;
  restore: () => void;
} {
  let instance: FakeAudioContext | null = null;
  const ctor = function (this: unknown): FakeAudioContext {
    instance = new FakeAudioContext();
    return instance;
  } as unknown as new () => FakeAudioContext;

  const globalWithWindow = globalThis as unknown as { window?: unknown };
  const hadWindow = Object.prototype.hasOwnProperty.call(globalWithWindow, 'window');
  const previousWindow = globalWithWindow.window;
  globalWithWindow.window = { AudioContext: ctor };

  return {
    get instance(): FakeAudioContext {
      if (instance === null) {
        throw new Error('AudioContext not constructed yet — call getAudioContext() first');
      }
      return instance;
    },
    restore(): void {
      if (hadWindow) {
        globalWithWindow.window = previousWindow;
      } else {
        delete globalWithWindow.window;
      }
    },
  };
}
