import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type FakeAudioContext,
  type FakeBiquadFilterNode,
  type FakeGainNode,
} from '../helpers/fake-audio-context.js';
import { DEFAULT_MIXER_SETTINGS, sanitizeMixerSettings } from '../../src/app/audio/mixer.js';
import type * as AudioContextModule from '../../src/app/audio/context.js';

/**
 * `context.ts`'s bus graph, mixer volumes, mute composition, ducking and
 * Promille filter (#157) — exercised against a `FakeAudioContext` so the
 * real code paths past `ctx === null` actually run, not just the
 * off-browser no-op branch every other audio test hits under `vitest`'s
 * `environment: 'node'`.
 *
 * `context.ts` caches its `AudioContext` in a module-level `let`, so each
 * test resets the module graph and re-installs a fresh fake — otherwise the
 * second test would see the first test's already-constructed context.
 */

async function freshContext(): Promise<{
  readonly ctx: typeof AudioContextModule;
  readonly fake: FakeAudioContext;
  readonly restore: () => void;
}> {
  vi.resetModules();
  const { installFakeAudioContext: install } = await import('../helpers/fake-audio-context.js');
  const installed = install();
  const ctxModule = await import('../../src/app/audio/context.js');
  ctxModule.getAudioContext();
  // `installed.instance` is a getter that throws until the `AudioContext`
  // constructor has actually run — read it only now, after `getAudioContext`.
  return { ctx: ctxModule, fake: installed.instance, restore: installed.restore };
}

describe('context.ts bus graph (#157)', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('gives each bus its own gain node, independent of the others', async () => {
    const { ctx, restore: r } = await freshContext();
    restore = r;
    ctx.setBusVolume('music', 0.5);
    expect(ctx.getBusVolume('music')).toBe(0.5);
    expect(ctx.getBusVolume('sfx')).toBe(1);
    expect(ctx.getBusVolume('voice')).toBe(1);

    const musicGain = ctx.getBusGain('music');
    const sfxGain = ctx.getBusGain('sfx');
    expect(musicGain).not.toBeNull();
    expect(sfxGain).not.toBeNull();
    expect(musicGain).not.toBe(sfxGain);
  });

  it('applyMixerSettings sets the master and all three buses in one call', async () => {
    const { ctx, restore: r } = await freshContext();
    restore = r;
    ctx.applyMixerSettings({ master: 0.8, music: 0.6, sfx: 0.4, voice: 0.2 });
    expect(ctx.getMasterVolume()).toBe(0.8);
    expect(ctx.getBusVolume('music')).toBe(0.6);
    expect(ctx.getBusVolume('sfx')).toBe(0.4);
    expect(ctx.getBusVolume('voice')).toBe(0.2);
  });

  it('clamps a volume outside 0-1', async () => {
    const { ctx, restore: r } = await freshContext();
    restore = r;
    ctx.setBusVolume('sfx', 4);
    expect(ctx.getBusVolume('sfx')).toBe(1);
    ctx.setBusVolume('sfx', -2);
    expect(ctx.getBusVolume('sfx')).toBe(0);
  });

  it('mute forces the master gain to zero regardless of volume, and restores it on unmute', async () => {
    const { ctx, restore: r } = await freshContext();
    restore = r;
    ctx.setMasterVolume(0.7);
    const gain = ctx.getMasterGain();
    expect(gain).not.toBeNull();
    if (gain === null) {
      throw new Error('unreachable');
    }
    expect(gain.gain.value).toBeCloseTo(0.7, 5);

    const muted = ctx.toggleMute();
    expect(muted).toBe(true);
    expect(gain.gain.value).toBe(0);

    const unmuted = ctx.toggleMute();
    expect(unmuted).toBe(false);
    expect(gain.gain.value).toBeCloseTo(0.7, 5);
  });

  it('warms the noise buffer at construction, not on first SFX play', async () => {
    vi.resetModules();
    // Spied on the class prototype, not an instance — the instance doesn't
    // exist yet, since `getAudioContext()` (below) is what constructs it.
    const { FakeAudioContext: FreshFakeAudioContext, installFakeAudioContext: install } =
      await import('../helpers/fake-audio-context.js');
    const createBufferSpy = vi.spyOn(FreshFakeAudioContext.prototype, 'createBuffer');
    const { restore: r } = install();
    restore = r;
    const ctxModule = await import('../../src/app/audio/context.js');
    ctxModule.getAudioContext();
    expect(createBufferSpy).toHaveBeenCalledTimes(1);
  });
});

describe('promilleMuffleToHz (#157)', () => {
  it('is fully open (inaudible filtering) at muffle 0', async () => {
    const { promilleMuffleToHz } = await import('../../src/app/audio/context.js');
    expect(promilleMuffleToHz(0)).toBeCloseTo(20000, 0);
  });

  it('closes down toward the floor at muffle 1', async () => {
    const { promilleMuffleToHz } = await import('../../src/app/audio/context.js');
    expect(promilleMuffleToHz(1)).toBeCloseTo(350, 0);
  });

  it('is monotonically decreasing as muffle increases', async () => {
    const { promilleMuffleToHz } = await import('../../src/app/audio/context.js');
    const a = promilleMuffleToHz(0.2);
    const b = promilleMuffleToHz(0.6);
    const c = promilleMuffleToHz(0.9);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
});

describe('duckMusic (#157)', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('schedules a dip below the current music volume and a recovery back to it', async () => {
    const { ctx, restore: r } = await freshContext();
    restore = r;
    ctx.setBusVolume('music', 1);
    ctx.duckMusic(0.5, 0.05, 0.1, 0.3);

    const gain = ctx.getBusGain('music') as unknown as FakeGainNode | null;
    expect(gain).not.toBeNull();
    if (gain === null) {
      throw new Error('unreachable');
    }
    const values = gain.gain.history.map((entry) => entry.value);
    // A dip (0.5) followed by a recovery back to the base (1) — in that order.
    const dipIndex = values.indexOf(0.5);
    const recoverIndex = values.lastIndexOf(1);
    expect(dipIndex).toBeGreaterThanOrEqual(0);
    expect(recoverIndex).toBeGreaterThan(dipIndex);
  });

  it('only ducks the music bus, leaving sfx and voice untouched', async () => {
    const { ctx, restore: r } = await freshContext();
    restore = r;
    ctx.duckMusic(0.9, 0.01, 0.01, 0.01);
    const sfxGain = ctx.getBusGain('sfx') as unknown as FakeGainNode | null;
    const voiceGain = ctx.getBusGain('voice') as unknown as FakeGainNode | null;
    expect(sfxGain?.gain.history.length ?? 0).toBe(0);
    expect(voiceGain?.gain.history.length ?? 0).toBe(0);
  });

  it('is a no-op with no AudioContext', async () => {
    vi.resetModules();
    const ctxModule = await import('../../src/app/audio/context.js');
    expect(() => {
      ctxModule.duckMusic(0.5, 0.1, 0.1, 0.1);
    }).not.toThrow();
  });
});

describe('the Promille filter', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  /**
   * `context.ts` never exposes the filter node itself (nothing outside it
   * needs to read it back), so this spies on the fake context's own
   * `createBiquadFilter` to get at the one node it built — the only way to
   * see `setPromilleFilterCutoffHz`/`resetPromilleFilter` actually reach it.
   */
  async function freshContextWithFilterSpy(): Promise<{
    readonly ctx: typeof AudioContextModule;
    readonly filter: FakeBiquadFilterNode;
  }> {
    vi.resetModules();
    // Import fresh (per `vi.resetModules()`) and spy on *that* module's own
    // class — spying on the copy statically imported at the top of this file
    // would watch a different class than the one `install()` below actually
    // constructs.
    const { FakeAudioContext: FreshFakeAudioContext, installFakeAudioContext: install } =
      await import('../helpers/fake-audio-context.js');
    const createFilterSpy = vi.spyOn(FreshFakeAudioContext.prototype, 'createBiquadFilter');
    const { restore: r } = install();
    restore = r;
    const ctx = await import('../../src/app/audio/context.js');
    ctx.getAudioContext();
    const filter = createFilterSpy.mock.results[0]?.value as FakeBiquadFilterNode;
    createFilterSpy.mockRestore();
    return { ctx, filter };
  }

  it('starts fully open, wide enough that a sober tier is inaudible as filtering', async () => {
    const { filter } = await freshContextWithFilterSpy();
    expect(filter.frequency.value).toBeGreaterThanOrEqual(20000);
  });

  it('closes down to the cutoff a tier asks for, and reopens on reset', async () => {
    const { ctx, filter } = await freshContextWithFilterSpy();
    ctx.setPromilleFilterCutoffHz(500);
    expect(filter.frequency.value).toBeCloseTo(500, 0);
    ctx.resetPromilleFilter();
    expect(filter.frequency.value).toBeGreaterThanOrEqual(20000);
  });

  it('clamps a cutoff below the filter floor', async () => {
    const { ctx, filter } = await freshContextWithFilterSpy();
    ctx.setPromilleFilterCutoffHz(10);
    expect(filter.frequency.value).toBeGreaterThanOrEqual(350);
  });
});

describe('mixer settings sanitisation', () => {
  it('falls back to defaults field-by-field on a malformed blob', () => {
    expect(sanitizeMixerSettings(null)).toEqual(DEFAULT_MIXER_SETTINGS);
    expect(sanitizeMixerSettings({ master: 0.5, sfx: 'loud' })).toEqual({
      ...DEFAULT_MIXER_SETTINGS,
      master: 0.5,
    });
    expect(sanitizeMixerSettings({ music: 2, voice: -1 })).toEqual(DEFAULT_MIXER_SETTINGS);
  });
});
