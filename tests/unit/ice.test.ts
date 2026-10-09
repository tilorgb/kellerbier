import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { type InputFrame, createInputFrame, quantiseAxis } from '../../src/sim/input/frame.js';
import { MAX_ROOM_ICE, RoomGeometry } from '../../src/sim/room/geometry.js';
import { compileRoomTemplate, validateRoomTemplate } from '../../src/sim/room/template.js';
import { footingDivisorOf } from '../../src/sim/systems/movement.js';
import { DEFAULT_MOVEMENT_TUNING, DEFAULT_PROMILLE_TUNING } from '../../src/sim/tuning.js';

/**
 * Floor 4's glacier ice (#40): a room zone that all but removes the player's
 * grip — far slicker than a puddle — and the one place two control-removing
 * systems (ice and the Promille drift) compound, which #40 asks to be capped
 * explicitly rather than left to emerge.
 */

function held(moveX: number, moveY: number): InputFrame {
  const frame = createInputFrame();
  frame.moveX = quantiseAxis(moveX);
  frame.moveY = quantiseAxis(moveY);
  return frame;
}

const IDLE = createInputFrame();

function openRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 640, 360);
}

/** A room long enough that a run-up to top speed on ice, and the slide after it, never meets a wall. */
function longRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 1400, 360);
}

/** How far the player slides after releasing at top speed in `room`. */
function slideIn(room: RoomGeometry, ticksToSlide = 200): number {
  const sim = new GameSim({ room });
  const input = held(1, 0);
  // Long enough to reach top speed on ice too, where the run-up is 8× longer.
  for (let tick = 0; tick < 120; tick++) {
    sim.step(input);
  }
  const releasedAt = sim.positionX(sim.playerIndex);
  for (let tick = 0; tick < ticksToSlide; tick++) {
    sim.step(IDLE);
  }
  return sim.positionX(sim.playerIndex) - releasedAt;
}

describe('the ice sheet zone (#40)', () => {
  it('reports a point on ice only inside a sheet, like a puddle', () => {
    const room = openRoom();
    room.addIce(100, 100, 200, 160);
    expect(room.iceCount).toBe(1);
    expect(room.isOnIce(150, 130)).toBe(true);
    expect(room.isOnIce(99, 130)).toBe(false);
    expect(room.isOnIce(150, 161)).toBe(false);
    // Ice is not water: nothing about a sheet reads as a puddle.
    expect(room.isOnPuddle(150, 130)).toBe(false);
  });

  it('refuses to grow past its fixed storage', () => {
    const room = openRoom();
    for (let sheet = 0; sheet < MAX_ROOM_ICE; sheet++) {
      room.addIce(sheet, 0, sheet + 1, 1);
    }
    expect(() => {
      room.addIce(0, 0, 1, 1);
    }).toThrow(RangeError);
  });

  it('compiles an "ice" hazard into the room geometry', () => {
    const template = validateRoomTemplate(
      {
        id: 'ice-test',
        tileGrid: [
          '###############',
          '#.............#',
          '#.............#',
          '#.............#',
          '#.............#',
          '#.............#',
          '#.............#',
          '#.............#',
          '###############',
        ],
        obstacles: [],
        enemySpawns: [],
        spawnGroups: [],
        pickupSpawns: [],
        hazards: [{ x: 64, y: 48, width: 48, height: 32, type: 'ice' }],
        decorativeProps: [{ x: 80, y: 60, type: 'fern' }],
        metadata: {
          floorTags: ['alpen'],
          shape: '1x1',
          doors: { north: true, east: true, south: true, west: true },
          difficultyTier: 1,
          weight: 1,
        },
      },
      'ice-test',
      ENEMY_DEFINITIONS,
    );
    const compiled = compileRoomTemplate(template, 4, 'ice-test', ENEMY_DEFINITIONS);
    // Compiled coordinates carry the room's margin offset, like every other
    // position `compileRoomTemplate` returns — read the sheet back off it.
    const [hazard] = compiled.hazards;
    expect(hazard).toMatchObject({ width: 48, height: 32, type: 'ice' });
    expect(compiled.geometry.iceCount).toBe(1);
    expect(compiled.geometry.isOnIce((hazard?.x ?? 0) + 16, (hazard?.y ?? 0) + 12)).toBe(true);
    expect(compiled.geometry.puddleCount).toBe(0);
    // Nothing stands on a glacier sheet: the fern placed on it is not placed.
    expect(compiled.decorativeProps.some((prop) => prop.type === 'fern')).toBe(false);
  });
});

describe('ice underfoot (#40)', () => {
  it('slides the player much further than a puddle does, and a puddle further than dry floor', () => {
    const dry = slideIn(longRoom());
    const wetRoom = longRoom();
    wetRoom.addPuddle(0, 0, 1400, 360);
    const wet = slideIn(wetRoom);
    const icyRoom = longRoom();
    icyRoom.addIce(0, 0, 1400, 360);
    const icy = slideIn(icyRoom);
    expect(wet).toBeGreaterThan(dry);
    expect(icy).toBeGreaterThan(wet * 2);
  });

  it('is the slide the tuning promises: ticksToStop × (1 + iceSlip), give or take a tick', () => {
    const room = longRoom();
    room.addIce(0, 0, 1400, 360);
    const sim = new GameSim({ room });
    const input = held(1, 0);
    for (let tick = 0; tick < 120; tick++) {
      sim.step(input);
    }
    let ticks = 0;
    while (ticks < 1000) {
      sim.step(IDLE);
      ticks += 1;
      const base = sim.playerIndex * 2;
      if (Math.abs(sim.velocity.data[base] ?? 0) < 1e-6) {
        break;
      }
    }
    const expected = DEFAULT_MOVEMENT_TUNING.ticksToStop * (1 + DEFAULT_MOVEMENT_TUNING.iceSlip);
    expect(ticks).toBeGreaterThanOrEqual(expected - 1);
    expect(ticks).toBeLessThanOrEqual(expected + 1);
  });

  it('ignores the ice while the player carries the Haferlschuh grip', () => {
    const room = longRoom();
    room.addIce(0, 0, 1400, 360);
    const sim = new GameSim({ room });
    const input = held(1, 0);
    for (let tick = 0; tick < 120; tick++) {
      sim.step(input);
    }
    const releasedAt = sim.positionX(sim.playerIndex);
    sim.puddleImmuneTicks = 999;
    for (let tick = 0; tick < DEFAULT_MOVEMENT_TUNING.ticksToStop; tick++) {
      sim.step(IDLE);
    }
    const slid = sim.positionX(sim.playerIndex) - releasedAt;
    expect(slid).toBeCloseTo(
      (DEFAULT_MOVEMENT_TUNING.maxSpeed * (DEFAULT_MOVEMENT_TUNING.ticksToStop - 1)) / 2,
      3,
    );
  });

  it('can still be turned round on inside a single screen', () => {
    // The playability floor under every number here: a player sliding east
    // at top speed on a glacier the width of a room, holding west, comes
    // back before the far wall. Otherwise the arena's ice is a conveyor.
    const room = longRoom();
    room.addIce(0, 0, 1400, 360);
    const sim = new GameSim({ room });
    for (let tick = 0; tick < 120; tick++) {
      sim.step(held(1, 0));
    }
    const turnedAt = sim.positionX(sim.playerIndex);
    let furthest = turnedAt;
    for (let tick = 0; tick < 400; tick++) {
      sim.step(held(-1, 0));
      furthest = Math.max(furthest, sim.positionX(sim.playerIndex));
      if (sim.positionX(sim.playerIndex) < turnedAt) {
        break;
      }
    }
    expect(sim.positionX(sim.playerIndex)).toBeLessThan(turnedAt);
    expect(furthest - turnedAt).toBeLessThan(240);
  });
});

describe('the combined footing cap (#40)', () => {
  const tuning = DEFAULT_MOVEMENT_TUNING;

  it('leaves every penalty on its own, and drift with a puddle, exactly as before', () => {
    expect(footingDivisorOf(tuning, 0, 0, 0)).toBe(1);
    expect(footingDivisorOf(tuning, 0.6, 0, 0)).toBeCloseTo(1.6);
    expect(footingDivisorOf(tuning, 0, tuning.puddleSlip, 0)).toBeCloseTo(1 + tuning.puddleSlip);
    expect(footingDivisorOf(tuning, 0.6, tuning.puddleSlip, 0)).toBeCloseTo(
      1.6 * (1 + tuning.puddleSlip),
    );
    expect(footingDivisorOf(tuning, 0, 0, tuning.iceSlip)).toBeCloseTo(1 + tuning.iceSlip);
  });

  it('holds ice under the full Promille drift at the cap, below their product', () => {
    const maxDrift = DEFAULT_PROMILLE_TUNING.maxDrift;
    const product = (1 + maxDrift) * (1 + tuning.iceSlip);
    expect(product).toBeGreaterThan(tuning.footingDivisorCap);
    expect(footingDivisorOf(tuning, maxDrift, 0, tuning.iceSlip)).toBe(tuning.footingDivisorCap);
    // The cap is a ceiling the single penalties sit under, not a floor they are raised to.
    expect(1 + tuning.iceSlip).toBeLessThan(tuning.footingDivisorCap);
  });

  it('never divides by less than one, whatever the slider says', () => {
    expect(footingDivisorOf({ ...tuning, footingDivisorCap: 0 }, 0.6, 0, tuning.iceSlip)).toBe(1);
  });
});
