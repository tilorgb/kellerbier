import { describe, expect, it } from 'vitest';
import { NO_HIT, circlesOverlap, sweptCircleHit } from '../../src/sim/collision/circle-circle.js';
import { EventKind } from '../../src/sim/events/queue.js';
import { GameSim, TARGET_RADIUS } from '../../src/sim/game/sim.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';

const IDLE = createInputFrame();

function aiming(aimX: number, aimY: number): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(aimX);
  frame.aimY = quantiseAxis(aimY);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

/** Every hit reported during one step. */
function hitsDuring(sim: GameSim, input: Readonly<InputFrame>): number {
  sim.step(input);
  let hits = 0;
  sim.events.forEach((slot) => {
    if (sim.events.kind[slot] === EventKind.ProjectileHit) {
      hits += 1;
    }
  });
  return hits;
}

describe('swept circle collision', () => {
  it('reports an overlap only when the circles actually touch', () => {
    expect(circlesOverlap(0, 0, 5, 9, 0, 5)).toBe(true);
    expect(circlesOverlap(0, 0, 5, 10, 0, 5)).toBe(false);
  });

  it('catches a target crossed entirely within one step', () => {
    // A shot moving 200 px in one tick, past a target 100 px along the way.
    const time = sweptCircleHit(0, 0, 200, 0, 2, 100, 0, 8);
    expect(time).toBeGreaterThan(0);
    expect(time).toBeLessThan(1);
    expect(200 * time).toBeCloseTo(90, 6);
  });

  it('reports nothing for a path that misses', () => {
    expect(sweptCircleHit(0, 0, 200, 0, 2, 100, 40, 8)).toBe(NO_HIT);
  });

  it('reports the start of the move when the two already overlap', () => {
    expect(sweptCircleHit(100, 100, 120, 100, 4, 100, 100, 8)).toBe(0);
  });

  it('reports nothing for a target the move stops short of', () => {
    expect(sweptCircleHit(0, 0, 50, 0, 2, 100, 0, 8)).toBe(NO_HIT);
  });
});

describe('projectiles against the world', () => {
  it('reports a hit and consumes the shot', () => {
    const sim = new GameSim();
    // The left-hand training target sits level with the player.
    const input = aiming(-1, 0);
    sim.step(input);
    expect(sim.projectiles.liveCount).toBe(1);

    let hits = 0;
    for (let tick = 0; tick < 60 && hits === 0; tick++) {
      hits = hitsDuring(sim, IDLE);
    }
    expect(hits).toBe(1);
    expect(sim.projectiles.liveCount).toBe(0);
  });

  it('places the impact on the surface it struck, not where the tick ended', () => {
    const sim = new GameSim();
    sim.step(aiming(-1, 0));

    const hits: { x: number; normalX: number; targetX: number }[] = [];
    for (let tick = 0; tick < 60 && hits.length === 0; tick++) {
      sim.step(IDLE);
      sim.events.forEach((slot) => {
        if (sim.events.kind[slot] !== EventKind.ProjectileHit) {
          return;
        }
        hits.push({
          x: sim.events.x[slot] ?? 0,
          normalX: sim.events.normalX[slot] ?? 0,
          targetX: sim.positionX(sim.events.subject[slot] ?? 0),
        });
      });
    }

    const hit = hits[0];
    expect(hit).toBeDefined();
    const { x: hitX, normalX, targetX } = hit ?? { x: 0, normalX: 0, targetX: 0 };

    // Struck from the right, so the impact is on the target's right-hand side
    // and the normal points back the way the shot came.
    expect(hitX).toBeGreaterThan(targetX);
    expect(hitX - targetX).toBeLessThanOrEqual(TARGET_RADIUS + 4);
    expect(normalX).toBeGreaterThan(0);
  });

  it('never passes a fast shot through a target', () => {
    const sim = new GameSim();
    // Three times the target's diameter in a single tick: an endpoint-only
    // test would step straight over it.
    sim.tuning.shooting.shotSpeed = 60;
    sim.step(aiming(-1, 0));

    let hits = 0;
    for (let tick = 0; tick < 20 && hits === 0; tick++) {
      hits = hitsDuring(sim, IDLE);
    }
    expect(hits).toBe(1);
  });

  it('reports one hit per shot, even when the target spans several grid cells', () => {
    const sim = new GameSim();
    const targetIndex = 1;
    sim.body.data[targetIndex * 2] = 16;

    sim.step(aiming(-1, 0));
    let total = 0;
    for (let tick = 0; tick < 60; tick++) {
      total += hitsDuring(sim, IDLE);
    }
    expect(total).toBe(1);
  });

  it('does not let a player shot hit the player who fired it', () => {
    const sim = new GameSim();
    sim.tuning.shooting.shotSpeed = 0.01;
    sim.step(aiming(1, 0));

    let total = 0;
    for (let tick = 0; tick < 40; tick++) {
      total += hitsDuring(sim, IDLE);
    }
    expect(total).toBe(0);
  });

  it('lets an enemy shot hit the player', () => {
    const sim = new GameSim();
    const playerX = sim.positionX(sim.playerIndex);
    const playerY = sim.positionY(sim.playerIndex);
    sim.projectiles.spawn(playerX - 40, playerY, 6, 0, 3, 1, 60, ProjectileTeam.Enemy);

    let hitSubject = -1;
    for (let tick = 0; tick < 40 && hitSubject === -1; tick++) {
      sim.step(IDLE);
      sim.events.forEach((slot) => {
        if (sim.events.kind[slot] === EventKind.ProjectileHit) {
          hitSubject = sim.events.subject[slot] ?? -1;
        }
      });
    }
    expect(hitSubject).toBe(sim.playerIndex);
  });
});
