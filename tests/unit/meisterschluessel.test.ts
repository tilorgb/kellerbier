import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import cellarBoss from '../../src/content/rooms/cellar-boss.json';
import cellarMiniboss from '../../src/content/rooms/cellar-miniboss.json';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

const IDLE = createInputFrame();

/**
 * `sim.transitionTo(..., force: true)` — none of these tests are about the
 * crossing-intent gate (`GameSim.transitionTo`'s `pressingToward` doc
 * comment); a `sim` built directly in a test has recorded no movement.
 */
function forceTransitionTo(
  sim: GameSim,
  template: unknown,
  direction: Parameters<GameSim['transitionTo']>[2],
): boolean {
  return sim.transitionTo(template, 1, direction, undefined, undefined, undefined, true);
}

/** `cellarCrossroads` with nothing in it — `doorsLocked` false the instant it loads. */
function emptyStartRoom(): typeof cellarCrossroads {
  return { ...cellarCrossroads, enemySpawns: [], spawnGroups: [] };
}

/** The boss room, enemies stripped — entering it is all these tests care about. */
const bossRoom = { ...cellarBoss, enemySpawns: [], spawnGroups: [] };

function startedInEmptyRoom(): GameSim {
  return new GameSim({ roomTemplate: emptyStartRoom(), floor: 1, population: 'empty' });
}

function placePlayer(sim: GameSim, x: number, y: number): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = x;
  sim.transform.data[base + 1] = y;
  sim.transform.data[base + 2] = x;
  sim.transform.data[base + 3] = y;
}

function livePickupKinds(sim: GameSim): string[] {
  const kinds: string[] = [];
  sim.world.forEach(sim.pickupKind.bit, (index) => {
    const definitionIndex = sim.pickupKind.data[index] ?? -1;
    if (definitionIndex >= 0) {
      kinds.push(sim.pickups.at(definitionIndex).id);
    }
  });
  return kinds;
}

function pickupPosition(sim: GameSim, id: string): { x: number; y: number } {
  const definitionIndex = sim.pickups.indexOf(id);
  let found: { x: number; y: number } | undefined;
  sim.world.forEach(sim.pickupKind.bit, (index) => {
    if ((sim.pickupKind.data[index] ?? -1) === definitionIndex) {
      found = { x: sim.positionX(index), y: sim.positionY(index) };
    }
  });
  if (found === undefined) {
    throw new Error(`no live pickup of kind "${id}"`);
  }
  return found;
}

describe('Der Meisterschlüssel — the boss-door gate (#275)', () => {
  it('refuses the boss room, and consumes nothing, on a gated floor with no key', () => {
    const sim = startedInEmptyRoom();
    sim.configureFloorGate(true);

    expect(sim.meisterschluessel).toBe(false);
    expect(sim.bossDoorLocked).toBe(true);
    expect(forceTransitionTo(sim, bossRoom, 'north')).toBe(false);
    expect(sim.roomId).toBe('cellar-crossroads');
    expect(sim.meisterschluessel).toBe(false);
  });

  it('opens the boss room once the key is held, and spends it on the way in', () => {
    const sim = startedInEmptyRoom();
    sim.configureFloorGate(true);
    sim.grantMeisterschluessel();

    expect(sim.bossDoorLocked).toBe(false);
    expect(forceTransitionTo(sim, bossRoom, 'north')).toBe(true);
    expect(sim.roomId).toBe('cellar-boss');
    // Spent on entry — a boolean, so "spent" is "back to false".
    expect(sim.meisterschluessel).toBe(false);
  });

  it('does not re-lock the boss room behind the player (a Blutwurz walk back in)', () => {
    const sim = startedInEmptyRoom();
    sim.configureFloorGate(true);
    sim.grantMeisterschluessel();

    expect(forceTransitionTo(sim, bossRoom, 'north')).toBe(true);
    // Walk back out to the start room, then straight back into the boss room —
    // no second key, and it is not asked for.
    expect(forceTransitionTo(sim, emptyStartRoom(), 'south')).toBe(true);
    expect(sim.roomId).toBe('cellar-crossroads');
    expect(sim.meisterschluessel).toBe(false);
    expect(sim.bossDoorLocked).toBe(false);
    expect(forceTransitionTo(sim, bossRoom, 'north')).toBe(true);
    expect(sim.roomId).toBe('cellar-boss');
  });

  it('applies no gate on a floor with no mini-boss content', () => {
    const sim = startedInEmptyRoom();
    sim.configureFloorGate(false);

    expect(sim.bossDoorLocked).toBe(false);
    expect(forceTransitionTo(sim, bossRoom, 'north')).toBe(true);
    expect(sim.roomId).toBe('cellar-boss');
  });

  it('keeps a held key across a plain room load (a Blutwurz spirit walk)', () => {
    // #84's spirit walk loads the floor's start room in place — no
    // `clearFloorProgress`, the same `sim` — so the key must still be there.
    const sim = startedInEmptyRoom();
    sim.configureFloorGate(true);
    sim.grantMeisterschluessel();

    sim.loadRoom(emptyStartRoom(), 1);
    expect(sim.meisterschluessel).toBe(true);
    expect(sim.bossDoorLocked).toBe(false);
  });

  it('clears a held key on floor advance', () => {
    const sim = startedInEmptyRoom();
    sim.configureFloorGate(true);
    sim.grantMeisterschluessel();
    expect(sim.meisterschluessel).toBe(true);

    sim.clearFloorProgress();
    expect(sim.meisterschluessel).toBe(false);
  });

  it('bossDoorLocked tracks gate and key together', () => {
    const sim = startedInEmptyRoom();
    expect(sim.bossDoorLocked).toBe(false); // ungated by default

    sim.configureFloorGate(true);
    expect(sim.bossDoorLocked).toBe(true);

    sim.grantMeisterschluessel();
    expect(sim.bossDoorLocked).toBe(false);

    sim.configureFloorGate(false);
    expect(sim.bossDoorLocked).toBe(false);
  });
});

describe('the masterkey pickup (#275)', () => {
  it('grants Der Meisterschlüssel when collected, and is never a Kellerschlüssel', () => {
    const sim = startedInEmptyRoom();
    expect(sim.meisterschluessel).toBe(false);
    const keysBefore = sim.keys;

    // Drop one straight onto the player and let the pickup system collect it.
    sim.spawnPickup(
      'meisterschluessel',
      sim.positionX(sim.playerIndex),
      sim.positionY(sim.playerIndex),
    );
    sim.world.flush(); // the spawn is deferred until a flush — see tests/unit/pickups.test.ts
    sim.step(IDLE);

    expect(sim.meisterschluessel).toBe(true);
    expect(sim.keys).toBe(keysBefore); // the Kellerschlüssel count is untouched
    expect(livePickupKinds(sim)).not.toContain('meisterschluessel');
  });
});

describe('the mini-boss room drops the key on clear (#275)', () => {
  it('spawns a meisterschluessel pickup the tick the fight ends, not before', () => {
    const sim = new GameSim({ roomTemplate: cellarMiniboss, floor: 1 });

    // The fight is on — no key on the floor yet.
    expect(sim.liveEnemyCount).toBeGreaterThan(0);
    expect(livePickupKinds(sim)).not.toContain('meisterschluessel');

    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));
    for (const index of enemies) {
      sim.kill(index);
    }
    sim.world.flush();
    sim.step(IDLE);

    expect(sim.liveEnemyCount).toBe(0);
    expect(livePickupKinds(sim)).toContain('meisterschluessel');

    // And picking it up opens the gate.
    sim.configureFloorGate(true);
    const keyAt = pickupPosition(sim, 'meisterschluessel');
    placePlayer(sim, keyAt.x, keyAt.y);
    sim.step(IDLE);
    expect(sim.meisterschluessel).toBe(true);
  });
});
