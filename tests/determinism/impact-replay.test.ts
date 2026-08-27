import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import {
  InputAction,
  type InputFrame,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { DEFAULT_SHOOTING_TUNING } from '../../src/sim/tuning.js';

/**
 * A struck body's hit-stagger (`GameSim.hitStun`) is the one piece of impact
 * feel that could plausibly break determinism, and #13 says so explicitly —
 * it used to be a whole-simulation freeze (`requestHitstop`), and is now a
 * per-body counter read by `stepEnemies`, but the concern is the same one.
 *
 * The danger is real but it is not in the staggering — it is in *where* the
 * staggering lives. Stopping the loop's own clock would make a run depend on
 * how long a frame took, which is exactly the thing the fixed timestep exists
 * to remove. Counting it down inside a tick, in a plain typed array read by
 * ordinary systems, keeps ticks running at sixty a second and keeps the whole
 * simulation a function of its seed and its input log — which is what this
 * file asserts, by running the same log twice through a run with plenty of
 * hits landing in it, and once more with one tick of the log changed.
 */

const TICKS = 900;

/**
 * A scripted log: drifting around the room while sweeping fire across the
 * training targets, so the run spends a good part of its length frozen.
 */
function scriptedLog(variantFrom = -1): InputFrame[] {
  const frames: InputFrame[] = [];
  for (let tick = 0; tick < TICKS; tick++) {
    const frame = createInputFrame();
    const phase = tick / 41;

    frame.moveX = quantiseAxis(Math.sin(phase) * 0.5);
    frame.moveY = quantiseAxis(Math.cos(phase * 0.7) * 0.5);

    // Aim swept narrowly around due left, where a target stands.
    const aim = Math.PI + Math.sin(phase * 0.9) * 0.22;
    frame.aimX = quantiseAxis(Math.cos(aim));
    frame.aimY = quantiseAxis(Math.sin(aim));
    setActionDown(frame, InputAction.Fire, true);

    // One shot's worth of the trigger released, in the middle of the run.
    //
    // Deliberately a shot rather than a nudge on an axis: the movement model
    // converges, so a one-step axis difference is absorbed the moment that axis
    // reaches its target and genuinely leaves no trace. A shot that was never
    // fired cannot be absorbed by anything.
    //
    // The window is derived from `fireDelayTicks` rather than a fixed tick
    // count: it has to span at least one full fire cycle to be guaranteed to
    // suppress a shot regardless of how the cooldown is tuned, or a release
    // window shorter than the cooldown can land entirely between two shots
    // and change nothing.
    const releaseWindow = DEFAULT_SHOOTING_TUNING.fireDelayTicks + 4;
    if (variantFrom >= 0 && tick >= variantFrom && tick < variantFrom + releaseWindow) {
      setActionDown(frame, InputAction.Fire, false);
    }
    frames.push(frame);
  }
  return frames;
}

/**
 * A hash of everything the run produced.
 *
 * Positions, health, the pools, the shake and the random streams' positions —
 * so a divergence anywhere shows up, including one that only moved a particle.
 */
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
  sim.particles.forEachLive((index) => {
    parts.push(sim.particles.x[index] ?? 0, sim.particles.y[index] ?? 0);
  });
  // Draw from each stream: a divergence in how much randomness was consumed
  // shows up here even when nothing visible moved.
  parts.push(sim.random.cosmetic.nextFloat(), sim.random.enemies.nextFloat());

  return parts.map((value) => value.toString(16)).join(':');
}

function runLog(frames: readonly InputFrame[], seed = 0xbee2_2026): GameSim {
  const sim = new GameSim({ seed });
  for (const frame of frames) {
    sim.step(frame);
  }
  return sim;
}

describe('a run with hit-stagger in it', () => {
  it('staggers a body often enough for this test to mean something', () => {
    const sim = new GameSim({ seed: 0xbee2_2026 });
    let staggerTicks = 0;
    for (const frame of scriptedLog()) {
      sim.step(frame);
      for (let index = 0; index < sim.world.highWater; index++) {
        if ((sim.hitStun.data[index] ?? 0) > 0) {
          staggerTicks += 1;
          break;
        }
      }
    }
    expect(staggerTicks).toBeGreaterThan(5);
  });

  it('replays identically from the same seed and the same input log', () => {
    const log = scriptedLog();
    expect(hashRun(runLog(log))).toBe(hashRun(runLog(log)));
  });

  it('keeps the tick count exactly equal to the number of frames consumed', () => {
    // The fixed timestep is untouched by a body's own stagger: no tick is
    // skipped, none is run twice, and the simulation's clock still tracks
    // the input log.
    const log = scriptedLog();
    expect(runLog(log).tick).toBe(log.length);
  });

  it('diverges when one shot goes missing from the log', () => {
    const original = hashRun(runLog(scriptedLog()));
    const altered = hashRun(runLog(scriptedLog(300)));
    expect(altered).not.toBe(original);
  });

  it('diverges when the seed changes, even though the inputs do not', () => {
    const log = scriptedLog();
    expect(hashRun(runLog(log, 1))).not.toBe(hashRun(runLog(log, 2)));
  });
});
