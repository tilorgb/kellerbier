import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { AXIS_RESOLUTION, createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_FLAG_LATCHED, ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * Karussell: an active item now. Moving does nothing; using it flings what is
 * close away from the player — mass-scaled, no damage — and throws a latched
 * Zecke off the hat with it.
 */

const IDLE = createInputFrame();

function bareSim(): GameSim {
  const sim = new GameSim({ seed: 3, room: new RoomGeometry(0, 0, 320, 180) });
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== sim.playerIndex) {
      doomed.push(index);
    }
  });
  for (const index of doomed) {
    sim.world.destroy(sim.world.entityAt(index));
  }
  sim.world.flush();
  return sim;
}

function place(sim: GameSim, index: number, x: number, y: number): void {
  const t = sim.transform.data;
  t[index * 4] = x;
  t[index * 4 + 1] = y;
  t[index * 4 + 2] = x;
  t[index * 4 + 3] = y;
}

function spawn(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function charged(sim: GameSim): void {
  sim.pickUpItem('karussell');
  sim.chargeActiveItem('karussell', sim.effectiveMaxCharge(sim.items.get('karussell')));
}

describe('Karussell', () => {
  it('is an active item on a five-second recharge', () => {
    const item = sim0().items.get('karussell');
    expect(item.active?.maxCharge).toBe(300);
  });

  it('does nothing while the player just walks about', () => {
    const sim = bareSim();
    charged(sim);
    place(sim, sim.playerIndex, 100, 90);
    const boar = spawn(sim, 'boar', 130, 90);
    const walk = createInputFrame();
    walk.moveY = AXIS_RESOLUTION;
    for (let tick = 0; tick < 20; tick++) {
      sim.step(walk);
      expect(sim.push.data[boar * 2] ?? 0).toBe(0);
    }
  });

  it('flings what is close away, light bodies further than heavy ones, without hurting them', () => {
    const sim = bareSim();
    charged(sim);
    place(sim, sim.playerIndex, 160, 90);
    const kaninchen = spawn(sim, 'kaninchen', 185, 90);
    const boar = spawn(sim, 'boar', 160, 60);
    const far = spawn(sim, 'kaninchen', 280, 90);
    // One tick so the broadphase knows they are there, as it always does by
    // the time the use button is read mid-step.
    sim.step(IDLE);
    const push = sim.push.data;
    push.fill(0);
    expect(sim.useActiveItem('karussell')).toBe(true);
    // Shoved straight away from the player: the Kaninchen east, the Boar north.
    const kaninchenPush = push[kaninchen * 2] ?? 0;
    const boarPush = -(push[boar * 2 + 1] ?? 0);
    expect(kaninchenPush).toBeGreaterThan(2);
    expect(boarPush).toBeGreaterThan(0.3);
    // Mass-scaled: the Boar (mid) budges far less than the Kaninchen (mini).
    expect(boarPush).toBeLessThan(kaninchenPush / 3);
    // Outside the radius: untouched.
    expect(push[far * 2] ?? 0).toBe(0);
    expect(push[far * 2 + 1] ?? 0).toBe(0);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(IDLE);
    }
    // No damage.
    expect(sim.health.data[kaninchen * 2]).toBe(sim.health.data[kaninchen * 2 + 1]);
    expect(sim.health.data[boar * 2]).toBe(sim.health.data[boar * 2 + 1]);
  });

  it('throws a latched Zecke off', () => {
    const sim = bareSim();
    charged(sim);
    const zecke = spawn(
      sim,
      'zecke',
      sim.positionX(sim.playerIndex) + 6,
      sim.positionY(sim.playerIndex),
    );
    const latched = (): boolean =>
      ((sim.enemy.data[zecke * ENEMY_STRIDE + 3] ?? 0) & ENEMY_FLAG_LATCHED) !== 0;
    for (let tick = 0; tick < 120 && !latched(); tick++) {
      sim.step(IDLE);
    }
    expect(latched()).toBe(true);
    expect(sim.useActiveItem('karussell')).toBe(true);
    expect(latched()).toBe(false);
    sim.step(IDLE);
    expect(sim.latchedEnemyCount).toBe(0);
  });
});

function sim0(): GameSim {
  return new GameSim({ seed: 1, room: new RoomGeometry(0, 0, 320, 180) });
}
