import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim, PLAYER_HEALTH, TARGET_RADIUS } from '../../src/sim/game/sim.js';
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

describe('Bierfassl fuse and blast', () => {
  it('does nothing until the fuse runs out, then explodes and destroys a destructible obstacle', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    // Well clear of the player and the blast radius default (40px) reaches it.
    const barrelX = sim.positionX(index) + 400;
    const barrelY = sim.positionY(index) + 400;
    const bomb = sim.spawnBierfassl(barrelX + 10, barrelY, 0, 0, false);
    const barrel = sim.spawnTarget(barrelX, barrelY, TARGET_RADIUS);
    sim.world.flush();

    // `stepBombs` decrements while the fuse is still positive, so it takes
    // `bombFuseTicks` ticks to reach zero and one more for the tick that
    // reads zero and explodes.
    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick < fuseTicks; tick++) {
      sim.step(idle());
      expect(sim.world.isAlive(bomb)).toBe(true);
      expect(sim.world.isAlive(barrel)).toBe(true);
    }

    sim.step(idle());
    expect(sim.world.isAlive(bomb)).toBe(false);
    expect(sim.world.isAlive(barrel)).toBe(false);
  });

  it('a set-down Bierfassl never moves', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    const x = sim.positionX(index) + 100;
    const y = sim.positionY(index) + 100;
    const bomb = sim.spawnBierfassl(x, y, 0, 0, false);
    sim.world.flush();
    const bombIndex = entityIndex(bomb);

    for (let tick = 0; tick < 20; tick++) {
      sim.step(idle());
    }
    expect(sim.positionX(bombIndex)).toBeCloseTo(x, 5);
    expect(sim.positionY(bombIndex)).toBeCloseTo(y, 5);
  });

  it('a rolled Bierfassl moves and slows down under its own drag', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    const x = sim.positionX(index) + 20;
    const y = sim.positionY(index);
    const bomb = sim.spawnBierfassl(x, y, 1, 0, true);
    sim.world.flush();
    const bombIndex = entityIndex(bomb);

    sim.step(idle());
    const firstStepX = sim.positionX(bombIndex);
    expect(firstStepX).toBeGreaterThan(x);

    for (let tick = 0; tick < 40; tick++) {
      sim.step(idle());
    }
    const laterX = sim.positionX(bombIndex);
    // Drag brings it to a stop well short of a constant-velocity roll — the
    // regression this guards is `stepBodies` never damping `velocity`, only
    // `push` (see `bodies.ts`), which would otherwise roll a Bierfassl at a
    // fixed speed forever.
    const distancePerStep = firstStepX - x;
    expect(laterX - firstStepX).toBeLessThan(distancePerStep * 30);
  });

  it('a blast harms the player standing next to it', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.spawnBierfassl(sim.positionX(index) + 5, sim.positionY(index), 0, 0, false);
    sim.world.flush();

    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick <= fuseTicks; tick++) {
      sim.step(idle());
    }
    expect(sim.playerHealth).toBeLessThan(PLAYER_HEALTH);
  });
});
