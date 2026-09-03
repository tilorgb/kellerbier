import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_DROP_TABLES } from '../../src/content/pickups/index.js';
import { createInputFrame, type InputFrame } from '../../src/sim/input/frame.js';

/**
 * #157's determinism guarantee: "same seed and same input log produce the
 * same run with audio on and with audio off." `app/audio/` is a one-way
 * seam — every function here takes `sim`/event data and returns `void`
 * (`impact.ts`'s `ImpactAudio`, `ambience.ts`'s `AmbienceAudio`) — so nothing
 * in it can feed back into `sim`'s own state or its RNG stream. This test
 * proves that structurally holds even once real Web Audio nodes are
 * actually being created and scheduled (`installFakeAudioContext`), not just
 * in the `environment: 'node'` no-`AudioContext` case every other test runs
 * under, where the whole question is moot because every audio call is
 * already a no-op.
 */

const SEED = 0x4175_6469;
const TICKS = 90;

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function inputLog(): InputFrame[] {
  const frames: InputFrame[] = [];
  for (let tick = 0; tick < TICKS; tick++) {
    const frame = createInputFrame();
    frame.moveX = tick % 30 < 15 ? 100 : -100;
    frame.moveY = tick % 50 < 25 ? -80 : 80;
    frame.aimX = 127;
    frame.aimY = tick % 20 < 10 ? 60 : -60;
    frames.push(frame);
  }
  return frames;
}

/**
 * A digest sensitive to any divergence in sim state or RNG stream position —
 * same shape as `sober-run-replay.test.ts`'s `runDigest`. Rolling the
 * RNG-backed drop table afterward (rather than just reading positions) is
 * what would expose a stream-position divergence that raw positions alone
 * might not.
 */
function runDigest(sim: GameSim): string {
  const positions: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    positions.push(Math.round(sim.positionX(i) * 1000), Math.round(sim.positionY(i) * 1000));
  }
  const drops: ({ x: number; y: number } | null)[] = [];
  for (let roll = 0; roll < 10; roll += 1) {
    drops.push(sim.dropLoot(ENEMY_DROP_TABLES.normal, 160, 90));
  }
  return JSON.stringify({
    tick: sim.tick,
    playerX: Math.round(sim.positionX(sim.playerIndex) * 1000),
    playerY: Math.round(sim.positionY(sim.playerIndex) * 1000),
    positions,
    drops,
  });
}

/** Runs the full log, invoking every real audio hook `app/main.ts` calls per tick, against a live fake `AudioContext`. */
async function runWithAudio(): Promise<string> {
  vi.resetModules();
  const { installFakeAudioContext: install } = await import('../helpers/fake-audio-context.js');
  const { restore } = install();
  try {
    const { playImpactAudio } = await import('../../src/app/audio/impact.js');
    const { AmbienceTracker, SynthAmbienceAudio } = await import('../../src/app/audio/ambience.js');
    const { SYNTH_IMPACT_AUDIO, playSfx, playBark } =
      await import('../../src/app/audio/sfx-player.js');
    const ctxModule = await import('../../src/app/audio/context.js');
    ctxModule.getAudioContext();

    const sim = new GameSim({ seed: SEED, room: bareRoom() });
    const ambience = new AmbienceTracker();
    const audio = new SynthAmbienceAudio();
    for (const frame of inputLog()) {
      sim.step(frame);
      playImpactAudio(sim, SYNTH_IMPACT_AUDIO);
      ambience.sync(sim, audio, false);
      audio.sync(sim.tick, true);
      audio.syncPromilleTier(sim.promilleTier);
      // A few of `app/main.ts`'s other real call sites, so this covers more
      // than just the two `ImpactAudio`/`AmbienceAudio` seams.
      playSfx('footstep');
      playBark('sauber');
    }
    return runDigest(sim);
  } finally {
    restore();
  }
}

function runWithoutAudio(): string {
  const sim = new GameSim({ seed: SEED, room: bareRoom() });
  for (const frame of inputLog()) {
    sim.step(frame);
  }
  return runDigest(sim);
}

describe('audio never drives simulation state (#157)', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('produces an identical run with every real audio hook invoked and with none at all', async () => {
    const withAudio = await runWithAudio();
    const withoutAudio = runWithoutAudio();
    expect(withAudio).toBe(withoutAudio);
  });

  it('produces an identical run across two audio-enabled passes (audio itself is not a source of nondeterminism)', async () => {
    const first = await runWithAudio();
    const second = await runWithAudio();
    expect(first).toBe(second);
  });
});
