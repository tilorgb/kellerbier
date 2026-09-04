import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import cellarBoss from '../../src/content/rooms/cellar-boss.json';
import { ETERNAL_HALF_UNIT, GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { blutwurz } from '../../src/content/items/blutwurz.js';

/**
 * Blutwurz (#84): a second chance you have to walk back for. Floor
 * continuity needs no snapshot of its own (see `GameSim`'s own doc comment
 * on `blutwurzActiveFlag`) — these tests exercise the state machine
 * (`startBlutwurz`/`recoverFromBlutwurz`/`failBlutwurz`) and the two places
 * it changes what the rest of the sim does: `applyPlayerDamage`'s lethal
 * branch, and `applyCompiledRoom`'s "cleared rooms repopulate" bypass.
 */

/** An empty single-cell room, only its id different from `cellarCrossroads` — safe to load with no combat side effects. */
function emptyRoom(id: string): unknown {
  return {
    id,
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

/**
 * Empty by default: most of these tests step the sim, and a populated
 * room's `direction: null` load (the same one `GameSim`'s own constructor
 * uses for a run's first room) skips the door-safety spawn exclusion real
 * gameplay always applies — an unrelated enemy contact would otherwise
 * confound exactly the death/recovery/failure edge this suite is isolating.
 * The repopulation tests below want real enemies and ask for
 * `cellarCrossroads`/`cellarBoss` explicitly.
 */
function roomSim(template: unknown = emptyRoom('start-room'), floor = 1): GameSim {
  return new GameSim({ roomTemplate: template, floor, population: 'empty', items: [blutwurz] });
}

const idle = () => createInputFrame();

describe('starting the spirit walk (#84)', () => {
  it('a lethal hit with the bottle held starts the walk instead of ending the run', () => {
    const sim = roomSim();
    sim.pickUpItem('blutwurz');
    expect(sim.blutwurzAvailable).toBe(true);

    sim.applyPlayerDamage(1000);

    expect(sim.playerDead).toBe(false);
    expect(sim.blutwurzActive).toBe(true);
    // Spent — a second walk needs a second bottle.
    expect(sim.blutwurzAvailable).toBe(false);
    expect(sim.playerMaxHealth).toBe(Math.round(sim.tuning.blutwurz.spiritMaxHealth));
    expect(sim.playerHealth).toBe(sim.playerMaxHealth);
  });

  it('a lethal hit with no bottle held ends the run exactly as it always did', () => {
    const sim = roomSim();
    sim.applyPlayerDamage(1000);
    expect(sim.playerDead).toBe(true);
    expect(sim.blutwurzActive).toBe(false);
  });

  it('an eternal heart still takes priority over a held bottle', () => {
    const sim = roomSim();
    sim.pickUpItem('blutwurz');
    sim.addEternalHealth(ETERNAL_HALF_UNIT);
    sim.applyPlayerDamage(1000);
    expect(sim.playerDead).toBe(false);
    expect(sim.blutwurzActive).toBe(false);
    expect(sim.blutwurzAvailable).toBe(true);
  });

  it('records the corpse at the room the player died in', () => {
    const sim = roomSim();
    sim.pickUpItem('blutwurz');
    const x = sim.positionX(sim.playerIndex);
    const y = sim.positionY(sim.playerIndex);
    const roomId = sim.roomId;
    sim.applyPlayerDamage(1000);
    expect(sim.corpsePosition).toEqual({ x, y, roomId });
  });

  it('a second lethal hit mid-walk ends the run for real rather than being absorbed', () => {
    const sim = roomSim();
    sim.pickUpItem('blutwurz');
    sim.applyPlayerDamage(1000);
    expect(sim.blutwurzActive).toBe(true);
    const corpseBefore = sim.corpsePosition;

    sim.applyPlayerDamage(1000);

    expect(sim.playerDead).toBe(true);
    expect(sim.blutwurzActive).toBe(false);
    // The corpse from the first death is not disturbed by the second.
    expect(sim.corpsePosition).toBeNull();
    expect(corpseBefore).not.toBeNull();
  });
});

describe('reaching the corpse (#84)', () => {
  it('recovers on touch: health returns reduced, Kater starts, the walk ends', () => {
    const sim = roomSim();
    sim.pickUpItem('blutwurz');
    const maxHealthBefore = sim.playerMaxHealth;
    sim.applyPlayerDamage(1000);
    expect(sim.blutwurzActive).toBe(true);

    sim.recoverFromBlutwurz();

    expect(sim.blutwurzActive).toBe(false);
    expect(sim.playerDead).toBe(false);
    expect(sim.hasKater).toBe(true);
    const expectedMax = Math.max(
      1,
      maxHealthBefore - Math.round(sim.tuning.blutwurz.recoveryMaxHealthPenalty),
    );
    expect(sim.playerMaxHealth).toBe(expectedMax);
    expect(sim.playerHealth).toBe(expectedMax);
  });

  it('stepBlutwurz recovers automatically once the player is within range, in the corpse’s own room', () => {
    const sim = roomSim();
    sim.pickUpItem('blutwurz');
    sim.applyPlayerDamage(1000);
    expect(sim.blutwurzActive).toBe(true);

    for (let tick = 0; tick < 5; tick++) {
      sim.step(idle());
    }

    expect(sim.blutwurzActive).toBe(false);
  });

  it('does not recover from a matching local position in a different room', () => {
    const sim = roomSim();
    sim.pickUpItem('blutwurz');
    sim.applyPlayerDamage(1000);
    const corpse = sim.corpsePosition;
    expect(corpse).not.toBeNull();

    // Leave the corpse's room without touching it — a fresh, empty room
    // load (no enemies to complicate a `direction: null` load with — real
    // gameplay never loads a populated room this way; every real transition
    // goes through `crossDoor`'s own door-safety-radius exclusion, which a
    // bare `loadRoom` call intentionally skips), same local coordinate
    // space, deliberately different `roomId`.
    sim.loadRoom(emptyRoom('a-different-room'), sim.currentFloor);
    expect(sim.roomId).not.toBe(corpse?.roomId);

    sim.step(idle());

    expect(sim.blutwurzActive).toBe(true);
  });
});

describe('failing the spirit walk (#84)', () => {
  it('a sober run fails once the hidden countdown runs out, with the run summary’s own death word', () => {
    const sim = roomSim();
    sim.pickUpItem('blutwurz');
    sim.applyPlayerDamage(1000);
    expect(sim.blutwurzActive).toBe(true);
    // In real play `app/main.ts`'s `enterBlutwurzEntrance` walks the player
    // to the floor's start room the same tick — standing exactly on the
    // spot they just died would otherwise touch-recover on step 1, which
    // is a real (if narrow) case but not the one this test is isolating.
    sim.loadRoom(emptyRoom('somewhere-else'), sim.currentFloor);

    sim.failBlutwurz();

    expect(sim.playerDead).toBe(true);
    expect(sim.blutwurzActive).toBe(false);
    expect(sim.deathWord).toBe('Nimmer zruckkema');
  });

  it('a promilled run fails once Promille reaches Umgfalln', () => {
    const sim = roomSim();
    sim.pickUpItem('blutwurz');
    sim.applyPlayerDamage(1000);
    // Same reasoning as the sober test above: leave the corpse's room so
    // `stepBlutwurz`'s touch check cannot recover the walk before the
    // timer this test is actually exercising gets a chance to run out.
    sim.loadRoom(emptyRoom('somewhere-else'), sim.currentFloor);
    sim.tuning.blutwurz.promilleRisePerTick = 10;
    sim.tuning.promille.umgfallnKnockdownTicks = 0;

    let ticks = 0;
    while (sim.blutwurzActive && ticks < 20) {
      sim.step(idle());
      ticks += 1;
    }

    expect(sim.playerDead).toBe(true);
    expect(sim.blutwurzActive).toBe(false);
  });

  it('an ordinary, non-Blutwurz death still draws the normal death-word pool', () => {
    const sim = roomSim();
    sim.applyPlayerDamage(1000);
    expect(sim.deathWord).not.toBe('Nimmer zruckkema');
  });
});

describe('cleared rooms repopulate for the walk, except a boss room (#84)', () => {
  it('an ordinary cleared room stays empty on a normal re-entry', () => {
    const sim = roomSim(cellarCrossroads);
    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));
    expect(enemies.length).toBeGreaterThan(0);
    for (const index of enemies) {
      sim.kill(index);
    }
    sim.world.flush();
    expect(sim.roomCleared).toBe(true);

    expect(sim.transitionTo(cellarCrossroads, 1, 'north')).toBe(true);
    expect(sim.liveEnemyCount).toBe(0);
  });

  it('the same cleared room repopulates while the spirit walk is on', () => {
    const sim = roomSim(cellarCrossroads);
    sim.pickUpItem('blutwurz');
    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));
    for (const index of enemies) {
      sim.kill(index);
    }
    sim.world.flush();
    expect(sim.roomCleared).toBe(true);

    sim.applyPlayerDamage(1000);
    expect(sim.blutwurzActive).toBe(true);

    expect(sim.transitionTo(cellarCrossroads, 1, 'north')).toBe(true);
    expect(sim.liveEnemyCount).toBeGreaterThan(0);
  });

  it('a boss room already cleared stays cleared even during the walk', () => {
    const sim = roomSim(cellarBoss);
    sim.pickUpItem('blutwurz');
    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));
    expect(enemies.length).toBeGreaterThan(0);
    for (const index of enemies) {
      sim.kill(index);
    }
    sim.world.flush();
    expect(sim.roomCleared).toBe(true);

    sim.applyPlayerDamage(1000);
    expect(sim.blutwurzActive).toBe(true);

    expect(sim.transitionTo(cellarBoss, 1, 'north')).toBe(true);
    expect(sim.liveEnemyCount).toBe(0);
  });
});
