import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FakeAudioBufferSourceNode } from '../helpers/fake-audio-context.js';
import type * as AudioContextModule from '../../src/app/audio/context.js';

/** Every `content/audio/sfx.ts` id — all 25 have a `.noise` layer, so each play creates exactly one buffer source. */
const ALL_SFX_IDS = [
  'hit-squelch',
  'hit-metal',
  'hit-animal',
  'hit-folk',
  'hit-oompah',
  'death-squelch',
  'death-metal',
  'death-animal',
  'death-folk',
  'death-oompah',
  'player-hit',
  'player-death',
  'wall-hit',
  'pickup-generic',
  'pickup-pedestal',
  'shop-purchase',
  'door-open',
  'door-locked',
  'secret-reveal',
  'floor-card-whoosh',
  'footstep',
  'ui-open',
  'ui-close',
  'ui-confirm',
  'ui-cancel',
] as const;

/**
 * `sfx-player.ts`'s polyphony cap, voice stealing and per-id retrigger
 * cooldown (#157) — the fix for "twelve simultaneous hits produce twelve
 * simultaneous copies of one sample and clip the master".
 *
 * Exercised against a `FakeAudioContext`, the same as `audio-mixer.test.ts`
 * — see that file's own doc comment for why `context.ts`'s module-level
 * cache means each test needs a fresh module graph.
 */

async function freshSfxPlayer(): Promise<{
  readonly playSfx: (id: string) => void;
  readonly ctxModule: typeof AudioContextModule;
  readonly FreshBufferSourceNode: typeof FakeAudioBufferSourceNode;
  readonly restore: () => void;
}> {
  vi.resetModules();
  const { FakeAudioBufferSourceNode: FreshBufferSourceNode, installFakeAudioContext: install } =
    await import('../helpers/fake-audio-context.js');
  const { restore } = install();
  const ctxModule = await import('../../src/app/audio/context.js');
  ctxModule.getAudioContext();
  const sfxModule = await import('../../src/app/audio/sfx-player.js');
  return { playSfx: sfxModule.playSfx, ctxModule, FreshBufferSourceNode, restore };
}

describe('SFX retrigger cooldown (#157)', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('collapses repeated plays of the same id within the cooldown window into one', async () => {
    const { playSfx, FreshBufferSourceNode, restore: r } = await freshSfxPlayer();
    restore = r;
    const startSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'start');

    playSfx('door-open');
    playSfx('door-open');
    playSfx('door-open');

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('plays again once the cooldown has elapsed', async () => {
    const { playSfx, ctxModule, FreshBufferSourceNode, restore: r } = await freshSfxPlayer();
    restore = r;
    const startSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'start');

    playSfx('door-open');
    // Advance the fake context's clock well past the retrigger cooldown.
    const fakeCtx = ctxModule.getAudioContext() as unknown as { currentTime: number };
    fakeCtx.currentTime += 1;
    playSfx('door-open');

    expect(startSpy).toHaveBeenCalledTimes(2);
  });

  it("tracks each id independently — a different id is never held back by another one's cooldown", async () => {
    const { playSfx, FreshBufferSourceNode, restore: r } = await freshSfxPlayer();
    restore = r;
    const startSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'start');

    playSfx('door-open');
    playSfx('wall-hit');

    expect(startSpy).toHaveBeenCalledTimes(2);
  });

  it('ignores an unknown id without throwing', async () => {
    const { playSfx, restore: r } = await freshSfxPlayer();
    restore = r;
    expect(() => {
      playSfx('not-a-real-sfx-id');
    }).not.toThrow();
  });
});

describe('SFX polyphony cap and voice stealing (#157)', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('cuts the oldest voice short once the polyphony cap is exceeded', async () => {
    const { playSfx, FreshBufferSourceNode, restore: r } = await freshSfxPlayer();
    restore = r;
    // Every play's `stop()` fires exactly once naturally, via
    // `AudioBufferSourceNode.start(when, offset, duration)`'s own implicit
    // stop — this spy counts only the *explicit* early `.stop()` calls
    // `VoiceHandle.stop()` makes when a voice is stolen.
    const stopSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'stop');

    // More distinct ids than the polyphony cap, all in the same instant (so
    // the retrigger cooldown never collapses any of them) — twelve
    // simultaneous hits and then some.
    const overflow = 6;
    const idsToPlay = ALL_SFX_IDS.length;
    expect(idsToPlay).toBeGreaterThan(overflow);
    for (const id of ALL_SFX_IDS) {
      playSfx(id);
    }

    // Exactly `idsToPlay - MAX_CONCURRENT_SFX` voices should have been
    // stolen (cut short) — the cap is `sfx-player.ts`'s own
    // `MAX_CONCURRENT_SFX = 16`.
    const MAX_CONCURRENT_SFX = 16;
    expect(stopSpy).toHaveBeenCalledTimes(Math.max(0, idsToPlay - MAX_CONCURRENT_SFX));
  });

  it('never throws under sustained overflow, advancing past the cooldown between rounds', async () => {
    const { playSfx, ctxModule, restore: r } = await freshSfxPlayer();
    restore = r;
    const fakeCtx = ctxModule.getAudioContext() as unknown as { currentTime: number };
    expect(() => {
      for (let round = 0; round < 5; round += 1) {
        for (const id of ALL_SFX_IDS) {
          playSfx(id);
        }
        fakeCtx.currentTime += 1;
      }
    }).not.toThrow();
  });
});
