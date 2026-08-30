import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import {
  InputAction,
  type InputFrame,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { InputPlayback, InputRecording } from '../../src/sim/input/recording.js';
import { compressFrames, decompressFrames } from '../../src/app/replay/codec.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { TICKS_PER_SECOND } from '../../src/sim/time.js';

/**
 * #48's acceptance criteria, exercised end to end: a seed plus its recorded
 * input log reproduces a run exactly, a replay survives being compressed for
 * storage and decompressed again, and the compressed form stays well under
 * the 100 KB budget for a full-length run.
 */

const SEED = 0xd0e5_2026;

/** A hash of everything the run produced — see `tests/determinism/impact-replay.test.ts`'s identical `hashRun`. */
function hashRun(sim: GameSim): string {
  const parts: number[] = [
    sim.tick,
    sim.positionX(sim.playerIndex),
    sim.positionY(sim.playerIndex),
    sim.projectiles.liveCount,
    sim.particles.liveCount,
    sim.decals.liveCount,
    sim.shake,
    sim.hitstop,
    sim.world.count,
  ];
  for (let index = 0; index < sim.world.highWater; index++) {
    parts.push(
      sim.positionX(index),
      sim.positionY(index),
      sim.health.data[index * 2] ?? 0,
      sim.hitStun.data[index] ?? 0,
    );
  }
  parts.push(sim.random.cosmetic.nextFloat(), sim.random.enemies.nextFloat());
  return parts.map((value) => value.toString(16)).join(':');
}

/**
 * A scripted run: movement and aim held steady for a stretch of ticks before
 * changing, firing in bursts — an ordinary twin-stick session, the way a
 * person actually holds a stick or a key, rather than a value that changes
 * every single tick. That distinction is the whole test in the "stays under
 * 100 KB" case below: gzip finds the repetition in *this*, not in a signal
 * that is technically bounded but never once repeats tick to tick.
 */
function scriptedFrames(ticks: number, seed = 0x5eed_1234): InputFrame[] {
  const rng = new Rng(seed);
  const frames: InputFrame[] = [];
  let moveX = 0;
  let moveY = 0;
  let aimX = 0;
  let aimY = 0;
  let firing = false;
  let moveTicksLeft = 0;
  let aimTicksLeft = 0;
  let fireTicksLeft = 0;
  for (let tick = 0; tick < ticks; tick++) {
    if (moveTicksLeft <= 0) {
      const angle = rng.nextFloat() * Math.PI * 2;
      moveX = quantiseAxis(Math.cos(angle));
      moveY = quantiseAxis(Math.sin(angle));
      moveTicksLeft = 20 + rng.nextInt(0, 150);
    }
    if (aimTicksLeft <= 0) {
      const angle = rng.nextFloat() * Math.PI * 2;
      aimX = quantiseAxis(Math.cos(angle));
      aimY = quantiseAxis(Math.sin(angle));
      aimTicksLeft = 15 + rng.nextInt(0, 100);
    }
    if (fireTicksLeft <= 0) {
      firing = !firing;
      fireTicksLeft = 10 + rng.nextInt(0, 60);
    }
    moveTicksLeft -= 1;
    aimTicksLeft -= 1;
    fireTicksLeft -= 1;

    const frame = createInputFrame();
    frame.moveX = moveX;
    frame.moveY = moveY;
    frame.aimX = aimX;
    frame.aimY = aimY;
    setActionDown(frame, InputAction.Fire, firing);
    setActionDown(frame, InputAction.Bomb, tick % 401 === 0);
    frames.push(frame);
  }
  return frames;
}

function runFrames(frames: readonly InputFrame[], seed = SEED): GameSim {
  const sim = new GameSim({ seed });
  for (const frame of frames) {
    sim.step(frame);
  }
  return sim;
}

describe('a replay reconstructed through the storage codec', () => {
  it('reproduces the run exactly, verified by an end-state hash', async () => {
    const frames = scriptedFrames(2000);
    const live = runFrames(frames);

    const recording = new InputRecording(frames.length);
    for (const frame of frames) {
      recording.push(frame);
    }
    const stored = await compressFrames(recording.toBytes());
    const restoredBytes = await decompressFrames(stored);
    const restored = InputRecording.fromBytes(restoredBytes);

    const playback = new InputPlayback(restored);
    const replayed = new GameSim({ seed: SEED });
    while (!playback.finished) {
      replayed.step(playback.next());
    }

    expect(hashRun(replayed)).toBe(hashRun(live));
  });

  it('round-trips the packed bytes exactly, byte for byte', async () => {
    const frames = scriptedFrames(500);
    const recording = new InputRecording(frames.length);
    for (const frame of frames) {
      recording.push(frame);
    }
    const original = recording.toBytes();
    const restored = await decompressFrames(await compressFrames(original));
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('stays well under 100 KB for a full-length run', async () => {
    // `docs/GAME_DESIGN.md` §4: a run is 35-50 minutes. 45 minutes at
    // `TICKS_PER_SECOND` is the middle of that band, and every one of those
    // ticks carries a held direction, a held aim and a fire button toggling
    // every so often — an ordinary twin-stick session, not a pathological
    // one — which is exactly the repetition `codec.ts`'s doc comment claims
    // gzip finds.
    const ticks = 45 * 60 * TICKS_PER_SECOND;
    const frames = scriptedFrames(ticks);
    const recording = new InputRecording(frames.length);
    for (const frame of frames) {
      recording.push(frame);
    }
    const stored = await compressFrames(recording.toBytes());
    // Base64 inflates by ~4/3; measure the actual bytes a saved file would carry.
    const storedBytes = atob(stored).length;
    expect(storedBytes).toBeLessThan(100 * 1024);
  }, 20000);
});
