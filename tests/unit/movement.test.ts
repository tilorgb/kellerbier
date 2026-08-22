import { describe, expect, it } from 'vitest';
import { GameSim, PLAYER_RADIUS } from '../../src/sim/game/sim.js';
import { type InputFrame, createInputFrame, quantiseAxis } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { DEFAULT_MOVEMENT_TUNING } from '../../src/sim/tuning.js';

/** An input frame holding one direction, quantised the way the sampler would. */
function held(moveX: number, moveY: number): InputFrame {
  const frame = createInputFrame();
  frame.moveX = quantiseAxis(moveX);
  frame.moveY = quantiseAxis(moveY);
  return frame;
}

const IDLE = createInputFrame();

/** An empty room, so a test can place the player anywhere without a pillar in the way. */
function openRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 640, 360);
}

function speedOf(sim: GameSim): number {
  const base = sim.playerIndex * 2;
  return Math.hypot(sim.velocity.data[base] ?? 0, sim.velocity.data[base + 1] ?? 0);
}

function placePlayer(sim: GameSim, x: number, y: number): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = x;
  sim.transform.data[base + 1] = y;
  sim.transform.data[base + 2] = x;
  sim.transform.data[base + 3] = y;
}

describe('player movement', () => {
  it('reaches top speed in exactly the tuned number of ticks', () => {
    const sim = new GameSim({ room: openRoom() });
    const input = held(1, 0);

    for (let tick = 0; tick < DEFAULT_MOVEMENT_TUNING.ticksToTopSpeed - 1; tick++) {
      sim.step(input);
      expect(speedOf(sim)).toBeLessThan(DEFAULT_MOVEMENT_TUNING.maxSpeed);
    }
    sim.step(input);
    expect(speedOf(sim)).toBeCloseTo(DEFAULT_MOVEMENT_TUNING.maxSpeed, 6);
  });

  it('slides to a stop over the tuned number of ticks rather than stopping dead', () => {
    const sim = new GameSim({ room: openRoom() });
    const input = held(1, 0);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(input);
    }

    const releasedAt = sim.positionX(sim.playerIndex);
    for (let tick = 0; tick < DEFAULT_MOVEMENT_TUNING.ticksToStop - 1; tick++) {
      sim.step(IDLE);
      expect(speedOf(sim)).toBeGreaterThan(0);
    }
    sim.step(IDLE);
    expect(speedOf(sim)).toBe(0);

    // The slide is a real distance, not a rounding artefact. Summing the
    // velocity over a linear ramp down gives maxSpeed * (ticks - 1) / 2.
    const slid = sim.positionX(sim.playerIndex) - releasedAt;
    expect(slid).toBeCloseTo(
      (DEFAULT_MOVEMENT_TUNING.maxSpeed * (DEFAULT_MOVEMENT_TUNING.ticksToStop - 1)) / 2,
      3,
    );
  });

  it('never exceeds top speed when moving diagonally', () => {
    const sim = new GameSim({ room: openRoom() });
    const diagonal = held(Math.SQRT1_2, Math.SQRT1_2);
    for (let tick = 0; tick < 60; tick++) {
      sim.step(diagonal);
      expect(speedOf(sim)).toBeLessThanOrEqual(DEFAULT_MOVEMENT_TUNING.maxSpeed + 1e-6);
    }
    expect(speedOf(sim)).toBeCloseTo(DEFAULT_MOVEMENT_TUNING.maxSpeed, 4);
  });

  it('turns around faster than it accelerates from rest', () => {
    const sim = new GameSim({ room: openRoom() });
    const right = held(1, 0);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(right);
    }

    const left = held(-1, 0);
    let ticksToReverse = 0;
    while ((sim.velocity.data[sim.playerIndex * 2] ?? 0) > 0) {
      sim.step(left);
      ticksToReverse += 1;
    }
    expect(ticksToReverse).toBeLessThan(DEFAULT_MOVEMENT_TUNING.ticksToTopSpeed);
  });

  it('slides along a wall run into diagonally instead of stopping dead', () => {
    const room = openRoom();
    const sim = new GameSim({ room });
    placePlayer(sim, room.maxX - PLAYER_RADIUS - 1, 180);

    const downRight = held(Math.SQRT1_2, Math.SQRT1_2);
    for (let tick = 0; tick < 20; tick++) {
      sim.step(downRight);
    }

    expect(sim.positionX(sim.playerIndex)).toBeCloseTo(room.maxX - PLAYER_RADIUS, 6);

    // With the blocked axis dropped, the free one runs at a steady rate — no
    // stutter, no per-tick oscillation against the wall.
    const steps: number[] = [];
    for (let tick = 0; tick < 20; tick++) {
      const before = sim.positionY(sim.playerIndex);
      sim.step(downRight);
      steps.push(sim.positionY(sim.playerIndex) - before);
    }
    const [first = 0] = steps;
    expect(first).toBeGreaterThan(0);
    for (const step of steps) {
      expect(step).toBeCloseTo(first, 6);
    }
  });

  it('nudges the player around a corner they nearly cleared', () => {
    const room = openRoom();
    // A pillar whose top edge sits 3px below the player's lower edge: without
    // forgiveness the player grinds against it forever.
    room.addBlock(300, 180, 340, 260);
    const sim = new GameSim({ room });
    const overlap = 3;
    placePlayer(sim, 280, 180 - PLAYER_RADIUS + overlap);

    const right = held(1, 0);
    for (let tick = 0; tick < 90; tick++) {
      sim.step(right);
    }

    expect(sim.positionX(sim.playerIndex)).toBeGreaterThan(340);
    expect(sim.positionY(sim.playerIndex)).toBeLessThanOrEqual(180 - PLAYER_RADIUS);
  });

  it('honours a tuning value changed while the simulation is running', () => {
    const sim = new GameSim({ room: openRoom() });
    const input = held(1, 0);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(input);
    }
    expect(speedOf(sim)).toBeCloseTo(DEFAULT_MOVEMENT_TUNING.maxSpeed, 6);

    sim.tuning.movement.maxSpeed = 5;
    for (let tick = 0; tick < 30; tick++) {
      sim.step(input);
    }
    expect(speedOf(sim)).toBeCloseTo(5, 6);
  });

  it('keeps the player inside the room whatever they do', () => {
    const sim = new GameSim();
    const directions = [held(1, 0), held(-1, 0), held(0, 1), held(0, -1), held(0.7, 0.7)];
    for (const direction of directions) {
      for (let tick = 0; tick < 300; tick++) {
        sim.step(direction);
        const index = sim.playerIndex;
        expect(sim.room.isClear(sim.positionX(index), sim.positionY(index), PLAYER_RADIUS)).toBe(
          true,
        );
      }
    }
  });

  it('records the previous position every tick, for render interpolation', () => {
    const sim = new GameSim({ room: openRoom() });
    const input = held(1, 0);
    sim.step(input);
    for (let tick = 0; tick < 10; tick++) {
      const before = sim.positionX(sim.playerIndex);
      sim.step(input);
      expect(sim.previousX(sim.playerIndex)).toBe(before);
    }
  });
});
