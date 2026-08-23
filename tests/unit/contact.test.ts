import { describe, expect, it } from 'vitest';
import { ENEMY_PROFILES, EnemySize, GameSim, PLAYER_HEALTH } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { type InputFrame, createInputFrame, quantiseAxis } from '../../src/sim/input/frame.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';

/** A room with nothing in it, so the only contact is the one under test. */
function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function walking(moveX: number, moveY = 0): InputFrame {
  const frame = createInputFrame();
  frame.moveX = quantiseAxis(moveX);
  frame.moveY = quantiseAxis(moveY);
  return frame;
}

/**
 * A sim whose training targets have been cleared out of the way.
 *
 * Contact is about two specific bodies, and a playground with six of them in it
 * measures whichever one the player wandered into first.
 */
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

function playerHealth(sim: GameSim): number {
  return sim.health.data[sim.playerIndex * 2] ?? 0;
}

describe('bodies against bodies', () => {
  it('does not let the player stand inside an enemy', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    const playerRadius = sim.body.data[index * 2] ?? 0;

    // Placed just ahead of the player, so walking into it is unavoidable.
    const enemy = sim.spawnEnemy(
      sim.positionX(index) + playerRadius + 2,
      sim.positionY(index),
      EnemySize.Normal,
    );
    sim.world.flush();
    const enemyIndex = entityIndex(enemy);

    for (let tick = 0; tick < 40; tick++) {
      sim.step(walking(1));
    }

    const gap = Math.hypot(
      sim.positionX(index) - sim.positionX(enemyIndex),
      sim.positionY(index) - sim.positionY(enemyIndex),
    );
    const reach = playerRadius + (sim.body.data[enemyIndex * 2] ?? 0);
    // Touching is fine; overlapping is not. A little slack for the tick the
    // separation is applied on.
    expect(gap).toBeGreaterThan(reach - 0.5);
  });

  it('slows the player down rather than letting them walk through', () => {
    const clear = emptySim();
    for (let tick = 0; tick < 30; tick++) {
      clear.step(walking(1));
    }
    const clearDistance = clear.positionX(clear.playerIndex);

    const blocked = emptySim();
    const index = blocked.playerIndex;
    const startX = blocked.positionX(index);
    blocked.spawnEnemy(startX + 20, blocked.positionY(index), EnemySize.Mini);
    blocked.world.flush();
    for (let tick = 0; tick < 30; tick++) {
      blocked.step(walking(1));
    }

    // Even the smallest enemy has to cost the player ground. One that does not
    // is one a swarm cannot hold anybody with.
    expect(blocked.positionX(index)).toBeLessThan(clearDistance - 5);
  });

  it('is harder to push through something heavy than something light', () => {
    const distanceThrough = (size: (typeof EnemySize)[keyof typeof EnemySize]): number => {
      const sim = emptySim();
      const index = sim.playerIndex;
      const startX = sim.positionX(index);
      sim.spawnEnemy(startX + 20, sim.positionY(index), size);
      sim.world.flush();
      for (let tick = 0; tick < 40; tick++) {
        sim.step(walking(1));
      }
      return sim.positionX(index) - startX;
    };

    expect(ENEMY_PROFILES[EnemySize.Mid].mass).toBeGreaterThan(ENEMY_PROFILES[EnemySize.Mini].mass);
    expect(distanceThrough(EnemySize.Mid)).toBeLessThan(distanceThrough(EnemySize.Mini));
  });

  it('lets the player through a body that has no mass advantage at all', () => {
    // The knob exists so contact can be turned off, and off has to mean off.
    const sim = emptySim();
    sim.tuning.movement.contactDrag = 0;
    const index = sim.playerIndex;
    const startX = sim.positionX(index);
    sim.spawnEnemy(startX + 20, sim.positionY(index), EnemySize.Mini);
    sim.world.flush();

    for (let tick = 0; tick < 40; tick++) {
      sim.step(walking(1));
    }
    expect(sim.positionX(index) - startX).toBeGreaterThan(40);
  });
});

describe('contact damage', () => {
  it('hurts the player once, then leaves them alone for the invulnerability window', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.spawnEnemy(sim.positionX(index) + 12, sim.positionY(index), EnemySize.Mid);
    sim.world.flush();

    const damage = ENEMY_PROFILES[EnemySize.Mid].contactDamage;
    for (let tick = 0; tick < 30; tick++) {
      sim.step(walking(1));
    }

    expect(playerHealth(sim)).toBe(PLAYER_HEALTH - damage);
    expect(sim.playerInvulnerableTicks).toBeGreaterThan(0);
  });

  it('does not hurt the player at all on a body that only blocks', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    expect(ENEMY_PROFILES[EnemySize.Normal].contactDamage).toBe(0);
    sim.spawnEnemy(sim.positionX(index) + 12, sim.positionY(index), EnemySize.Normal);
    sim.world.flush();

    for (let tick = 0; tick < 60; tick++) {
      sim.step(walking(1));
    }
    expect(playerHealth(sim)).toBe(PLAYER_HEALTH);
  });

  it('hurts again once the window has run out', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.tuning.impact.contactInvulnerabilityTicks = 10;
    sim.spawnEnemy(sim.positionX(index) + 12, sim.positionY(index), EnemySize.Mid);
    sim.world.flush();

    const damage = ENEMY_PROFILES[EnemySize.Mid].contactDamage;
    for (let tick = 0; tick < 120; tick++) {
      sim.step(walking(1));
    }
    expect(playerHealth(sim)).toBeLessThan(PLAYER_HEALTH - damage);
  });

  it('never takes the player below nothing', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.tuning.impact.contactInvulnerabilityTicks = 1;
    sim.spawnEnemy(sim.positionX(index) + 12, sim.positionY(index), EnemySize.Mid);
    sim.world.flush();

    for (let tick = 0; tick < 400; tick++) {
      sim.step(walking(1));
    }
    expect(playerHealth(sim)).toBe(0);
  });
});
