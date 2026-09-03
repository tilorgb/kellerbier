import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FakeAudioBufferSourceNode } from '../helpers/fake-audio-context.js';
import type { ImpactAudio } from '../../src/app/audio/impact.js';

/**
 * #234's six new cues, exercised through the real `SYNTH_IMPACT_AUDIO`
 * against a `FakeAudioContext` — the same approach
 * `audio-sfx-polyphony.test.ts` uses for the rest of `ImpactAudio`. Counting
 * `AudioBufferSourceNode.start()` calls proves a voice was actually created
 * without asserting on the private `content/audio/sfx.ts` id chosen for it;
 * playing two different categories back to back and expecting two separate
 * voices (rather than one, collapsed by the per-id retrigger cooldown) is
 * what proves the id actually varies by category.
 */

async function freshImpactAudio(): Promise<{
  readonly audio: ImpactAudio;
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
  return { audio: sfxModule.SYNTH_IMPACT_AUDIO, FreshBufferSourceNode, restore };
}

describe('SYNTH_IMPACT_AUDIO action/state cues (#234)', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("plays a voice for the player's own shot", async () => {
    const { audio, FreshBufferSourceNode, restore: r } = await freshImpactAudio();
    restore = r;
    const startSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'start');

    audio.onPlayerShotFired();

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("categorises an enemy's shot the way a hit already is (`categoryFor`) — different categories are different voices", async () => {
    const { audio, FreshBufferSourceNode, restore: r } = await freshImpactAudio();
    restore = r;
    const startSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'start');

    // `rollfass` is `metal`, `kuh` is `animal` — if both resolved to the same
    // fallback id, the second play would be collapsed by the per-id
    // retrigger cooldown and only one voice would start.
    audio.onEnemyShotFired('rollfass');
    audio.onEnemyShotFired('kuh');

    expect(startSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to the default category for an unresolved enemy id, same as `onHit` does', async () => {
    const { audio, FreshBufferSourceNode, restore: r } = await freshImpactAudio();
    restore = r;
    const startSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'start');

    expect(() => {
      audio.onEnemyShotFired(null);
    }).not.toThrow();
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('plays a voice for a telegraph wind-up', async () => {
    const { audio, FreshBufferSourceNode, restore: r } = await freshImpactAudio();
    restore = r;
    const startSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'start');

    audio.onAttackWindup('zapfhahn');

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('plays a voice for a room clearing', async () => {
    const { restore: r } = await freshImpactAudio();
    restore = r;
    const { playSfx } = await import('../../src/app/audio/sfx-player.js');
    const { FakeAudioBufferSourceNode: FreshBufferSourceNode } =
      await import('../helpers/fake-audio-context.js');
    const startSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'start');

    // `room-clear` is played from `app/main.ts` directly (an app-layer edge,
    // the same seam `door-open`/`creditBossDefeat` already use), not through
    // `ImpactAudio` — covered here rather than in `impact.ts`'s own hooks.
    playSfx('room-clear');

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('plays a voice for dropping to critical health', async () => {
    const { restore: r } = await freshImpactAudio();
    restore = r;
    const { playSfx } = await import('../../src/app/audio/sfx-player.js');
    const { FakeAudioBufferSourceNode: FreshBufferSourceNode } =
      await import('../helpers/fake-audio-context.js');
    const startSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'start');

    // Same story as `room-clear`: `low-health` is an app-layer edge
    // (`app/main.ts`'s `checkLowHealthSting`), not an `ImpactAudio` hook.
    playSfx('low-health');

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("plays a voice for a body's on-death split — a boss phase change or a Fass shattering alike", async () => {
    const { audio, FreshBufferSourceNode, restore: r } = await freshImpactAudio();
    restore = r;
    const startSpy = vi.spyOn(FreshBufferSourceNode.prototype, 'start');

    audio.onEnemySplit();

    expect(startSpy).toHaveBeenCalledTimes(1);
  });
});
