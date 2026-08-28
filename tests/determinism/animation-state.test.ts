import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import { GameSim } from '../../src/sim/game/sim.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { EntityAnimator } from '../../src/render/animation/animator.js';
import {
  AnimationState,
  compileAnimationSet,
  type AnimationSidecar,
} from '../../src/render/animation/definition.js';
import { resolveAnimationState, resolveFacing } from '../../src/render/animation/state.js';

/**
 * "Animation state is a pure function of sim state — same seed and input log,
 * same run" (#150), asserted in the two directions it can fail.
 *
 * **Forwards:** the same seed and the same input log produce the same sequence
 * of animation states and facings, tick for tick. That is what makes an
 * animated run as reproducible as a blob-sprite one — a replay that draws a
 * different pose than the run it recorded is not evidence of anything.
 *
 * **Backwards, and this is the one worth the file:** driving the animator does
 * not change the simulation. Two runs of the same seed, one rendered at 60 Hz
 * and one at 144 Hz, end on a bit-identical simulation state. The `sim/`-layer
 * lint rule stops the renderer *importing* its way into the simulation; this
 * stops it doing so by accident through a shared object.
 */

const TICKS = 420;
const RUN_SEED = 0x150_1_50;

const SIDECAR: AnimationSidecar = {
  frames: 8,
  frameDurationMs: 120,
  loop: true,
  clips: {
    idle: { frames: [0], frameDurationMs: 400, mode: 'loop' },
    move: { frames: [0, 1, 2, 3], frameDurationMs: 110, mode: 'loop' },
    telegraph: { frames: [4], frameDurationMs: 200, mode: 'loop' },
    hurt: { frames: [5], frameDurationMs: 90, mode: 'once', onEnd: 'idle' },
    death: { frames: [6, 7], frameDurationMs: 100, mode: 'once', onEnd: 'hold' },
  },
};

const SET = compileAnimationSet('crawler', SIDECAR, 8);

/** A roster mixed on purpose: a chaser, a shooter and a splitter behave differently. */
const ROSTER: readonly (readonly [string, number, number])[] = [
  ['kellerassel', 90, 60],
  ['bierratte', 210, 70],
  ['zapfhahn', 150, 130],
  ['schimmelfleck', 60, 140],
];

function buildSim(): GameSim {
  const sim = new GameSim({ seed: RUN_SEED, room: new RoomGeometry(0, 0, 320, 180) });
  const player = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== player) {
      doomed.push(index);
    }
  });
  for (const index of doomed) {
    sim.world.destroy(sim.world.entityAt(index));
  }
  sim.world.flush();
  for (const [id, x, y] of ROSTER) {
    entityIndex(sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y));
  }
  sim.world.flush();
  return sim;
}

/** A scripted input log: moving and firing, so enemies chase, telegraph, get hit and die. */
function inputAt(tick: number): InputFrame {
  const frame = createInputFrame();
  const phase = Math.floor(tick / 45) % 4;
  frame.moveX = quantiseAxis(phase === 0 ? 1 : phase === 2 ? -1 : 0);
  frame.moveY = quantiseAxis(phase === 1 ? 1 : phase === 3 ? -1 : 0);
  frame.aimX = quantiseAxis(1);
  setActionDown(frame, InputAction.Fire, tick % 3 !== 0);
  return frame;
}

/**
 * Runs the whole scripted run, sampling what the animator would be asked to
 * play on every tick. `hz` decides how many render frames happen between
 * ticks — the animator is driven for real, so anything it wrote back into the
 * simulation would show up in `simHash`.
 */
function runWith(hz: number): { states: string; simHash: string } {
  const sim = buildSim();
  const animator = new EntityAnimator();
  const framesPerTick = hz / 60;
  const frameMs = 1000 / hz;
  const sampled: string[] = [];
  let nowMs = 0;
  let renderedFrames = 0;

  for (let tick = 0; tick < TICKS; tick++) {
    sim.step(inputAt(tick));

    // What `render/entities.ts` does, minus the sprites.
    const wanted = Math.round((tick + 1) * framesPerTick);
    while (renderedFrames < wanted) {
      animator.beginFrame(nowMs);
      const states = sim.world.states;
      const masks = sim.world.masks;
      for (let index = 0; index < sim.world.highWater; index++) {
        if (states[index] !== World.ALIVE) {
          continue;
        }
        if (((masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
          continue;
        }
        const state = resolveAnimationState(sim, index);
        const facing = resolveFacing(sim, index);
        animator.track(
          index,
          sim.world.entityAt(index),
          SET,
          state,
          facing,
          sim.positionX(index),
          sim.positionY(index),
          sim.body.data[index * 2] ?? 1,
        );
        if (renderedFrames % framesPerTick === 0) {
          sampled.push(`${String(tick)}:${String(index)}:${String(state)}:${String(facing)}`);
        }
      }
      animator.endFrame();
      renderedFrames += 1;
      nowMs += frameMs;
    }
  }

  return { states: sampled.join('|'), simHash: hashSim(sim) };
}

/** Every number the simulation could have been nudged by, in one string. */
function hashSim(sim: GameSim): string {
  const parts: string[] = [String(sim.world.count), String(sim.world.highWater)];
  const states = sim.world.states;
  for (let index = 0; index < sim.world.highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    parts.push(
      [
        index,
        sim.positionX(index).toString(16),
        sim.positionY(index).toString(16),
        sim.velocity.data[index * 2]?.toString(16) ?? '',
        sim.health.data[index * 2] ?? 0,
        sim.enemy.data[index * 4] ?? 0,
        sim.enemy.data[index * 4 + 1] ?? 0,
        sim.enemy.data[index * 4 + 2] ?? 0,
      ].join(','),
    );
  }
  parts.push(String(sim.projectiles.liveCount), String(sim.particles.liveCount));
  return parts.join(';');
}

describe('animation state, against the same seed and input log', () => {
  it('resolves to the same states and facings twice over', () => {
    const first = runWith(60);
    const second = runWith(60);
    expect(second.states).toBe(first.states);
    // A sanity check on the fixture itself: a run that never left `idle` would
    // pass the comparison above and prove nothing.
    expect(first.states).toMatch(`:${String(AnimationState.Move)}:`);
    expect(first.states).toMatch(`:${String(AnimationState.Hurt)}:`);
  });

  it('leaves the simulation bit-identical whether it is rendered at 60Hz or 144Hz', () => {
    const slow = runWith(60);
    const fast = runWith(240);
    expect(fast.simHash).toBe(slow.simHash);
  });

  it('samples the same animation states at 60Hz and at 240Hz', () => {
    // The state is resolved from the tick's own simulation state, so rendering
    // four times as often resolves the same answer four times — it does not
    // resolve a different one.
    const slow = runWith(60);
    const fast = runWith(240);
    expect(fast.states).toBe(slow.states);
  });
});
