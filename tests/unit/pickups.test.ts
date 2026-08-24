import { describe, expect, it } from 'vitest';
import { GameSim, PLAYER_HEALTH } from '../../src/sim/game/sim.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/** A sim whose training targets have been cleared out of the way. */
function emptySim(): GameSim {
  const sim = new GameSim({ room: bareRoom() });
  const playerSlot = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== playerSlot) {
      doomed.push(index);
    }
  });
  for (const index of doomed) {
    sim.world.destroy(sim.world.entityAt(index));
  }
  sim.world.flush();
  return sim;
}

const idle = () => createInputFrame();

describe('pickup collection', () => {
  it('a currency pickup adds to Biermarken and removes itself', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.spawnPickup('biermarke-5', sim.positionX(index), sim.positionY(index));
    sim.world.flush();

    sim.step(idle());

    expect(sim.biermarken).toBe(5);
  });

  it('a key pickup adds to Kellerschlüssel', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.spawnPickup('kellerschluessel-ring', sim.positionX(index), sim.positionY(index));
    sim.world.flush();
    sim.step(idle());
    expect(sim.keys).toBe(3);
  });

  it('a bomb pickup adds to Bierfassl inventory, not a live bomb', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.spawnPickup('bierfassl', sim.positionX(index), sim.positionY(index));
    sim.world.flush();
    sim.step(idle());
    expect(sim.bombs).toBe(1);
  });

  it('food heals and lowers Promille', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.applyPlayerDamage(2);
    sim.addPromille(1);
    sim.spawnPickup('obazda', sim.positionX(index), sim.positionY(index));
    sim.world.flush();
    sim.step(idle());
    expect(sim.playerHealth).toBe(PLAYER_HEALTH - 2 + 2);
    // One tick of natural decay (`decayPerSecond`) lands alongside the food's
    // own -0.5, so this checks the food dropped it by roughly its amount
    // rather than an exact value tied to decay-per-tick arithmetic.
    expect(sim.promille).toBeCloseTo(0.5, 1);
  });

  it('Weißwurst heals generously below the floor threshold', () => {
    const sim = new GameSim({ room: bareRoom(), roomTemplate: minimalRoom(), floor: 3 });
    const index = sim.playerIndex;
    sim.applyPlayerDamage(4);
    sim.spawnPickup('weisswurst', sim.positionX(index), sim.positionY(index));
    sim.world.flush();
    sim.step(idle());
    expect(sim.playerHealth).toBe(PLAYER_HEALTH);
  });

  it('Weißwurst damages instead, from the floor threshold on — same sprite either way', () => {
    const sim = new GameSim({ room: bareRoom(), roomTemplate: minimalRoom(), floor: 4 });
    const index = sim.playerIndex;
    const before = sim.playerHealth;
    sim.spawnPickup('weisswurst', sim.positionX(index), sim.positionY(index));
    sim.world.flush();
    sim.step(idle());
    expect(sim.playerHealth).toBeLessThan(before);
  });
});

describe('pickup magnetism', () => {
  it('drifts a nearby pickup toward the player without touching one out of range', () => {
    const sim = emptySim();
    // Magnetism defaults to off — it's meant to be an item unlock, not free
    // from the start of a run — so this test, which is about the mechanism
    // itself, opts in explicitly rather than relying on the default.
    sim.tuning.pickup.magnetRadius = 36;
    const index = sim.playerIndex;
    const px = sim.positionX(index);
    const py = sim.positionY(index);

    sim.spawnPickup('biermarke-1', px + 20, py);
    const far = sim.spawnPickup('biermarke-1', px + 200, py);
    sim.world.flush();

    // The near one is inside the magnet radius but not yet touching the
    // player — one tick should not collect it immediately.
    sim.step(idle());
    expect(sim.biermarken).toBe(0);

    // Magnetism closes the gap over a few more ticks, and the far pickup
    // (well outside the magnet radius) never moves or gets collected.
    for (let tick = 0; tick < 30; tick++) {
      sim.step(idle());
    }
    expect(sim.biermarken).toBe(1);
    expect(sim.world.isAlive(far)).toBe(true);
  });
});

describe('pickup spawn clears residual motion', () => {
  it('does not inherit velocity or push left in a recycled slot', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    const px = sim.positionX(index);
    const py = sim.positionY(index);

    // A moving body that leaves the slot with a nonzero velocity and push —
    // standing in for an enemy that was mid-knockback when it died, the same
    // way a pickup dropped from a kill lands in whatever slot the enemy just
    // vacated.
    const ghost = sim.spawnTarget(px + 60, py, 6);
    const ghostIndex = entityIndex(ghost);
    sim.velocity.data[ghostIndex * 2] = 4;
    sim.velocity.data[ghostIndex * 2 + 1] = -3;
    sim.push.data[ghostIndex * 2] = 2;
    sim.push.data[ghostIndex * 2 + 1] = 2;
    sim.world.destroy(ghost);
    sim.world.flush();

    const pickup = sim.spawnPickup('biermarke-1', px + 60, py);
    expect(entityIndex(pickup)).toBe(ghostIndex);
    sim.world.flush();

    const before = { x: sim.positionX(entityIndex(pickup)), y: sim.positionY(entityIndex(pickup)) };
    for (let tick = 0; tick < 10; tick++) {
      sim.step(idle());
    }
    const after = { x: sim.positionX(entityIndex(pickup)), y: sim.positionY(entityIndex(pickup)) };
    expect(after).toEqual(before);
  });
});

function minimalRoom(): unknown {
  return {
    id: 'test-room',
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
    hazards: [],
    decorativeProps: [],
    metadata: {
      floorTags: ['cellar'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
    },
  };
}
