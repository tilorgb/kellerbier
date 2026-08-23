import { describe, expect, it } from 'vitest';
import { GameSim, PLAYER_HEALTH } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { type InputFrame, createInputFrame, quantiseAxis } from '../../src/sim/input/frame.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function walking(moveX: number, moveY = 0): InputFrame {
  const frame = createInputFrame();
  frame.moveX = quantiseAxis(moveX);
  frame.moveY = quantiseAxis(moveY);
  return frame;
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

describe('player health pools', () => {
  it('spends soul before red', () => {
    const sim = emptySim();
    sim.addSoulHealth(2);
    sim.applyPlayerDamage(1);
    expect(sim.playerSoulHealth).toBe(1);
    expect(sim.playerHealth).toBe(PLAYER_HEALTH);
  });

  it('spends red once soul is gone', () => {
    const sim = emptySim();
    sim.addSoulHealth(2);
    sim.applyPlayerDamage(3);
    expect(sim.playerSoulHealth).toBe(0);
    expect(sim.playerHealth).toBe(PLAYER_HEALTH - 1);
  });

  it('does not touch a banked eternal heart while red and soul remain', () => {
    const sim = emptySim();
    sim.addEternalHealth(1);
    sim.applyPlayerDamage(PLAYER_HEALTH - 1);
    expect(sim.playerEternalHealth).toBe(1);
    expect(sim.playerHealth).toBe(1);
    expect(sim.playerDead).toBe(false);
  });

  it('spends an eternal heart on a killing blow instead of dying, and refills red to 1', () => {
    const sim = emptySim();
    sim.addEternalHealth(1);
    sim.applyPlayerDamage(PLAYER_HEALTH);
    expect(sim.playerEternalHealth).toBe(0);
    expect(sim.playerHealth).toBe(1);
    expect(sim.playerDead).toBe(false);
  });

  it('dies when a killing blow lands with no eternal heart banked', () => {
    const sim = emptySim();
    sim.applyPlayerDamage(PLAYER_HEALTH);
    expect(sim.playerHealth).toBe(0);
    expect(sim.playerDead).toBe(true);
    expect(sim.playerDeathTick).toBeGreaterThanOrEqual(0);
  });

  it('never applies damage once already dead', () => {
    const sim = emptySim();
    sim.applyPlayerDamage(PLAYER_HEALTH);
    const deathTick = sim.playerDeathTick;
    sim.applyPlayerDamage(5);
    expect(sim.playerDeathTick).toBe(deathTick);
  });
});

/** Fires one enemy shot two pixels short of the player, closing fast, aimed dead-on. */
function fireAtPlayer(sim: GameSim, damage = 1): void {
  const index = sim.playerIndex;
  const radius = sim.body.data[index * 2] ?? 0;
  sim.projectiles.spawn(
    sim.positionX(index) - radius - 2,
    sim.positionY(index),
    4,
    0,
    2,
    damage,
    30,
    ProjectileTeam.Enemy,
  );
}

describe('projectile i-frames', () => {
  it('lands and starts an invulnerability window, same as contact', () => {
    const sim = emptySim();
    fireAtPlayer(sim);

    for (let tick = 0; tick < 10; tick++) {
      sim.step(walking(0));
    }
    expect(sim.playerHealth).toBe(PLAYER_HEALTH - 1);
    expect(sim.playerInvulnerableTicks).toBeGreaterThan(0);
  });

  it('does not land a second hit inside the window a first projectile opened', () => {
    const sim = emptySim();
    fireAtPlayer(sim);
    for (let tick = 0; tick < 10; tick++) {
      sim.step(walking(0));
    }
    expect(sim.playerHealth).toBe(PLAYER_HEALTH - 1);

    // Regression case: before the fix, `applyHit` never checked or set
    // `playerInvulnerableTicks`, so a second shot landing inside the window
    // the first one opened took a second half-Maß for free.
    fireAtPlayer(sim);
    for (let tick = 0; tick < 10; tick++) {
      sim.step(walking(0));
    }
    expect(sim.playerHealth).toBe(PLAYER_HEALTH - 1);
  });

  it('does no damage at all while an existing window (e.g. from contact) is open', () => {
    const sim = emptySim();
    sim.makePlayerInvulnerable(60);
    fireAtPlayer(sim);

    for (let tick = 0; tick < 10; tick++) {
      sim.step(walking(0));
    }
    expect(sim.playerHealth).toBe(PLAYER_HEALTH);
  });
});
