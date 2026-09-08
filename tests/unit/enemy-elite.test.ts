import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import cellarBoss from '../../src/content/rooms/cellar-boss.json';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import cellarMiniboss from '../../src/content/rooms/cellar-miniboss.json';
import dorfMiniboss from '../../src/content/rooms/dorf-miniboss.json';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { eliteAttackDamage, isEnemyElite } from '../../src/sim/systems/enemy.js';

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

  it('makes a placeholder mini-boss occupant a guaranteed elite, even at a zero roll chance (#274)', () => {
    // A mini-boss room whose slot still holds a *placeholder* — a floor enemy,
    // because the floor has no authored mini-boss yet — makes it a guaranteed
    // elite: a gate the player detours to and finds an ordinary body in is not
    // a gate. Guaranteed, not rolled, so this holds at a zero roll chance.
    //
    // Authored inline rather than pointed at a room in the tree, because as of
    // #277 there is no placeholder left to point at: floor 1 (#276) and floor
    // 2 both have real rosters now, and floors 3-7 are parked (`M10`). The
    // path is still the one every unparked floor will arrive through, and it
    // is the one that must not quietly stop working while nothing uses it —
    // so the placeholder is the *test's*, not the content's.
    const placeholderMiniboss = {
      ...dorfMiniboss,
      spawnGroups: [
        {
          id: 'miniboss',
          count: 1,
          choices: [{ enemyId: 'kuh', minFloor: 2, maxFloor: 2 }],
        },
      ],
    };
    const sim = emptySim();
    sim.tuning.enemy.eliteChanceBase = 0;
    sim.tuning.enemy.eliteChancePerExtraFloor = 0;

    sim.loadRoom(placeholderMiniboss, 2);

    const indices = liveEnemyIndices(sim);
    expect(indices.length).toBeGreaterThan(0);
    for (const index of indices) {
      expect(isEnemyElite(sim, index)).toBe(true);
    }
  });

  it("spawns floor 2's real mini-bosses (#277) plain, all three of a Blaskapelle included", () => {
    // The same guarantee the floor-1 case below makes, on the floor where a
    // mini-boss is three bodies: an escort (`RoomSpawnEscort`) is spawned
    // through the same loop as the choice that brought it, so if the gate read
    // the group's winner rather than each body's own `bossBar`, two thirds of
    // a band would come up elite.
    const sim = emptySim();
    sim.tuning.enemy.eliteChanceBase = 1;
    sim.tuning.enemy.eliteChancePerExtraFloor = 0;

    sim.loadRoom(dorfMiniboss, 2);

    const indices = liveEnemyIndices(sim);
    expect(indices.length).toBeGreaterThan(0);
    for (const index of indices) {
      expect(isEnemyElite(sim, index)).toBe(false);
    }
  });

  it('spawns a real mini-boss (#276) plain — never elite — so its authored health stands', () => {
    // #276 gave floor 1 real fights (Der Rattenkönig / Die Zapfhahn-Orgel,
    // rolled between). A real mini-boss (`bossBar`) carries its own health
    // tuned against its own cycle (#66); the ×1.8 elite modifier on top would
    // break that, so `applyCompiledRoom` spawns it plain even in the room that
    // guarantees a placeholder elite.
    const sim = emptySim();
    sim.tuning.enemy.eliteChanceBase = 1;
    sim.tuning.enemy.eliteChancePerExtraFloor = 0;

    sim.loadRoom(cellarMiniboss, 1);

    const indices = liveEnemyIndices(sim);
    expect(indices.length).toBeGreaterThan(0);
    for (const index of indices) {
      expect(isEnemyElite(sim, index)).toBe(false);
    }
  });

  it('doubles attack damage (shot/melee/splash) for an elite, and leaves a plain body alone', () => {
    const sim = emptySim();
    const definition = sim.enemies.indexOf('bierratte');
    const plain = entityIndex(sim.spawnEnemyKind(definition, 100, 100));
    const elite = entityIndex(sim.spawnEnemyKind(definition, 200, 100, true));
    sim.world.flush();

    sim.tuning.enemy.eliteAttackDamageMultiplier = 2;
    expect(eliteAttackDamage(sim, plain, 3)).toBe(3);
    expect(eliteAttackDamage(sim, elite, 3)).toBe(6);
    // Rounds, like the contact-damage and health scaling at spawn.
    sim.tuning.enemy.eliteAttackDamageMultiplier = 1.5;
    expect(eliteAttackDamage(sim, elite, 3)).toBe(5);
  });

  it("scales an elite's fired shot through the same path — a plain Bierratte's stays at its authored 1", () => {
    const firstEnemyShotDamage = (elite: boolean): number => {
      const sim = emptySim();
      sim.tuning.enemy.eliteAttackDamageMultiplier = 2;
      const definition = sim.enemies.indexOf('bierratte');
      // Inside `scurry`'s 45px trigger, so it winds up and snipes.
      sim.spawnEnemyKind(
        definition,
        sim.positionX(sim.playerIndex) + 30,
        sim.positionY(sim.playerIndex),
        elite,
      );
      sim.world.flush();
      let damage = -1;
      for (let tick = 0; tick < 60 && damage < 0; tick++) {
        sim.step(createInputFrame());
        sim.projectiles.forEachLive((index) => {
          if (sim.projectiles.team[index] === ProjectileTeam.Enemy && damage < 0) {
            damage = sim.projectiles.damage[index] ?? -1;
          }
        });
      }
      return damage;
    };

    expect(firstEnemyShotDamage(false)).toBe(1);
    expect(firstEnemyShotDamage(true)).toBe(2);
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
