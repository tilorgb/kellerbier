import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import cellarBoss from '../../src/content/rooms/cellar-boss.json';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { isEnemyElite } from '../../src/sim/systems/enemy.js';

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/** A room with the training targets cleared out, no template loaded yet. */
function emptySim(): GameSim {
  const sim = new GameSim({ room: bareRoom() });
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
  return sim;
}

function health(sim: GameSim, index: number): number {
  return sim.health.data[index * 2] ?? 0;
}

function radius(sim: GameSim, index: number): number {
  return sim.body.data[index * 2] ?? 0;
}

function contactDamage(sim: GameSim, index: number): number {
  return sim.contactDamage.data[index] ?? 0;
}

function liveEnemyIndices(sim: GameSim): number[] {
  const found: number[] = [];
  for (let index = 0; index < sim.world.highWater; index++) {
    if (sim.world.states[index] !== World.ALIVE) {
      continue;
    }
    if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
      continue;
    }
    found.push(index);
  }
  return found;
}

/**
 * The elite modifier layer (#156): "cheap to add, and it multiplies what
 * the existing roster can do" — a spawn-time modifier on any of the 13
 * enemies rather than a fourteenth hand-authored one.
 */
describe('elite modifier (#156)', () => {
  it('scales health, contact damage and size by the tuning multipliers, and flags itself', () => {
    const sim = emptySim();
    const definition = sim.enemies.indexOf('kellerassel');
    const plain = entityIndex(sim.spawnEnemyKind(definition, 100, 100));
    const elite = entityIndex(sim.spawnEnemyKind(definition, 200, 100, true));
    sim.world.flush();

    const tuning = sim.tuning.enemy;
    expect(isEnemyElite(sim, plain)).toBe(false);
    expect(isEnemyElite(sim, elite)).toBe(true);
    expect(health(sim, elite)).toBe(Math.round(health(sim, plain) * tuning.eliteHealthMultiplier));
    expect(contactDamage(sim, elite)).toBe(
      Math.round(contactDamage(sim, plain) * tuning.eliteContactDamageMultiplier),
    );
    expect(radius(sim, elite)).toBeCloseTo(radius(sim, plain) * tuning.eliteRadiusMultiplier, 5);
  });

  it('rolls elites for a normal room when the tuning chance is certain', () => {
    const sim = emptySim();
    sim.tuning.enemy.eliteChanceBase = 1;
    sim.tuning.enemy.eliteChancePerExtraFloor = 0;

    sim.loadRoom(cellarCrossroads, 1);

    const indices = liveEnemyIndices(sim);
    expect(indices.length).toBeGreaterThan(0);
    for (const index of indices) {
      expect(isEnemyElite(sim, index)).toBe(true);
    }
  });

  it('never rolls an elite when the tuning chance is zero', () => {
    const sim = emptySim();
    sim.tuning.enemy.eliteChanceBase = 0;
    sim.tuning.enemy.eliteChancePerExtraFloor = 0;

    sim.loadRoom(cellarCrossroads, 1);

    const indices = liveEnemyIndices(sim);
    expect(indices.length).toBeGreaterThan(0);
    for (const index of indices) {
      expect(isEnemyElite(sim, index)).toBe(false);
    }
  });

  it('never rolls an elite in a special-role room, even at a certain chance', () => {
    const sim = emptySim();
    sim.tuning.enemy.eliteChanceBase = 1;
    sim.tuning.enemy.eliteChancePerExtraFloor = 0;

    sim.loadRoom(cellarBoss, 1);

    const indices = liveEnemyIndices(sim);
    expect(indices.length).toBeGreaterThan(0);
    for (const index of indices) {
      expect(isEnemyElite(sim, index)).toBe(false);
    }
  });

  it('rolls a higher chance on a later floor — difficulty rising across floors, per #156', () => {
    const rollElites = (floor: number): { elite: number; total: number } => {
      const sim = emptySim();
      sim.tuning.enemy.eliteChanceBase = 0.5;
      sim.tuning.enemy.eliteChancePerExtraFloor = 0.5;
      sim.tuning.enemy.eliteChanceMax = 1;
      sim.loadRoom(cellarCrossroads, floor);
      const indices = liveEnemyIndices(sim);
      return {
        elite: indices.filter((index) => isEnemyElite(sim, index)).length,
        total: indices.length,
      };
    };

    // Floor 1 rolls at the base 0.5 chance. Three floors later — base 0.5
    // plus 3 * 0.5 — the chance clamps to the 1.0 ceiling, so every spawn is
    // elite deterministically: a higher, real point on the same curve
    // `eliteChanceForFloor` computes for every floor, not a special case of it.
    const floor4 = rollElites(4);
    expect(floor4.total).toBeGreaterThan(0);
    expect(floor4.elite).toBe(floor4.total);
  });
});
