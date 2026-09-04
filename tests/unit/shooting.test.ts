import { describe, expect, it, vi } from 'vitest';
import { EventKind } from '../../src/sim/events/queue.js';
import { GameSim } from '../../src/sim/game/sim.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { DEFAULT_SHOOTING_TUNING } from '../../src/sim/tuning.js';

/** `ShotFired` events reported by the step that just ran. */
function shotsFiredThisTick(sim: GameSim): number[] {
  const subjects: number[] = [];
  sim.events.forEach((slot) => {
    if (sim.events.kind[slot] === EventKind.ShotFired) {
      subjects.push(sim.events.subject[slot] ?? -1);
    }
  });
  return subjects;
}

function openRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 640, 360);
}

/** A frame aiming in a direction, which is also what asks for fire. */
function aiming(aimX: number, aimY: number, moveX = 0, moveY = 0): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(aimX);
  frame.aimY = quantiseAxis(aimY);
  frame.moveX = quantiseAxis(moveX);
  frame.moveY = quantiseAxis(moveY);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

const IDLE = createInputFrame();

/** The ticks a held-down fire button produces shots on. */
function fireTicks(sim: GameSim, input: InputFrame, ticks: number): number[] {
  const fired: number[] = [];
  let previous = sim.projectiles.liveCount;
  for (let tick = 0; tick < ticks; tick++) {
    sim.step(input);
    if (sim.projectiles.liveCount > previous) {
      fired.push(tick);
    }
    previous = sim.projectiles.liveCount;
  }
  return fired;
}

describe('shooting', () => {
  it('fires on the very tick the button goes down', () => {
    const sim = new GameSim({ room: openRoom() });
    sim.step(aiming(1, 0));
    expect(sim.projectiles.liveCount).toBe(1);
  });

  it('produces an evenly spaced stream while fire is held', () => {
    const sim = new GameSim({ room: openRoom() });
    // Aimed at bare wall rather than at a training target: a hit freezes the
    // simulation for a few ticks by design, and that freeze would show up here
    // as an irregular gap when what is being measured is the fire rhythm.
    const ticks = fireTicks(sim, aiming(0, -1), 120);
    expect(ticks.length).toBeGreaterThan(5);

    const gaps = ticks.slice(1).map((tick, i) => tick - (ticks[i] ?? 0));
    for (const gap of gaps) {
      expect(gap).toBe(DEFAULT_SHOOTING_TUNING.fireDelayTicks);
    }
  });

  it('does not bank shots while fire is released', () => {
    const sim = new GameSim({ room: openRoom() });
    sim.step(aiming(1, 0));
    for (let tick = 0; tick < 60; tick++) {
      sim.step(IDLE);
    }
    const before = sim.projectiles.liveCount;
    sim.step(aiming(1, 0));
    expect(sim.projectiles.liveCount).toBe(before + 1);
    sim.step(aiming(1, 0));
    expect(sim.projectiles.liveCount).toBe(before + 1);
  });

  it('aims independently of movement', () => {
    const sim = new GameSim({ room: openRoom() });
    // Running left, shooting right.
    sim.step(aiming(1, 0, -1, 0));
    const slot = 0;
    expect(sim.projectiles.velocityX[slot]).toBeGreaterThan(0);
    expect(sim.velocity.data[sim.playerIndex * 2]).toBeLessThan(0);
  });

  it('gives a shot a fraction of the velocity of the player who fired it', () => {
    const straight = new GameSim({ room: openRoom() });
    straight.step(aiming(0, -1));
    const still = straight.projectiles.velocityX[0] ?? 0;
    expect(still).toBe(0);

    const strafing = new GameSim({ room: openRoom() });
    const input = aiming(0, -1, 1, 0);
    for (let tick = 0; tick < 30; tick++) {
      strafing.step(input);
    }
    // Shooting up while running right: the shots lean right, which is what
    // makes strafing fire land where the player expects it to.
    let leaning = 0;
    strafing.projectiles.forEachLive((index) => {
      leaning = strafing.projectiles.velocityX[index] ?? 0;
    });
    expect(leaning).toBeGreaterThan(0);
    expect(leaning).toBeLessThan(strafing.tuning.movement.maxSpeed);
  });

  it('spawns the shot ahead of the player rather than inside them', () => {
    const sim = new GameSim({ room: openRoom() });
    const startX = sim.positionX(sim.playerIndex);
    sim.step(aiming(1, 0));
    expect(sim.projectiles.x[0]).toBeGreaterThan(startX);
  });

  it('kicks the player back, opposite the shot', () => {
    const sim = new GameSim({ room: openRoom() });
    sim.step(aiming(1, 0));
    expect(sim.push.data[sim.playerIndex * 2]).toBeLessThan(0);

    // The kick is a shove, not a change of intent: it is gone within a second.
    for (let tick = 0; tick < 60; tick++) {
      sim.step(IDLE);
    }
    expect(sim.push.data[sim.playerIndex * 2]).toBe(0);
  });

  it('ends a shot when its lifetime runs out, which is what gives a weapon range', () => {
    const sim = new GameSim({ room: openRoom() });
    sim.step(aiming(0, -1));
    expect(sim.projectiles.liveCount).toBe(1);

    for (let tick = 0; tick < DEFAULT_SHOOTING_TUNING.shotLifetimeTicks; tick++) {
      sim.step(IDLE);
    }
    expect(sim.projectiles.liveCount).toBe(0);
  });

  it('ends a shot at a wall rather than through it', () => {
    const room = openRoom();
    const sim = new GameSim({ room, projectileCapacity: 64 });
    sim.step(aiming(1, 0));

    for (let tick = 0; tick < 200; tick++) {
      sim.step(IDLE);
      sim.projectiles.forEachLive((index) => {
        expect(sim.projectiles.x[index]).toBeLessThanOrEqual(room.maxX);
      });
    }
    expect(sim.projectiles.liveCount).toBe(0);
  });

  it('never lets a shot at maximum speed cross a wall', () => {
    const room = new RoomGeometry(0, 0, 640, 360);
    room.addBlock(420, 0, 440, 360);
    const sim = new GameSim({ room });
    sim.tuning.shooting.shotSpeed = 18;
    sim.step(aiming(1, 0));

    let farthest = 0;
    for (let tick = 0; tick < 60; tick++) {
      sim.step(IDLE);
      sim.projectiles.forEachLive((index) => {
        farthest = Math.max(farthest, sim.projectiles.x[index] ?? 0);
      });
    }
    expect(farthest).toBeLessThan(420);
  });

  it('keeps firing when the pool is full, by recycling a shot already on its way out', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sim = new GameSim({ room: openRoom(), projectileCapacity: 3 });
    sim.tuning.shooting.fireDelayTicks = 1;
    sim.tuning.shooting.shotLifetimeTicks = 600;

    const input = aiming(0, -1);
    for (let tick = 0; tick < 40; tick++) {
      sim.step(input);
    }

    expect(sim.projectiles.liveCount).toBe(3);
    expect(sim.projectiles.overflows).toBeGreaterThan(0);

    // The surviving shots are the newest three, not the first three fired:
    // barely any of their lifetime has been spent.
    sim.projectiles.forEachLive((index) => {
      expect(sim.projectiles.lifetime[index]).toBeGreaterThan(595);
    });
    warn.mockRestore();
  });

  it('never hands a recycled slot stale state from its previous life', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sim = new GameSim({ room: openRoom(), projectileCapacity: 1 });
    sim.tuning.shooting.fireDelayTicks = 1;

    sim.step(aiming(1, 0));
    const firstGeneration = sim.projectiles.generation[0];

    sim.tuning.shooting.shotDamage = 7;
    sim.tuning.shooting.shotLifetimeTicks = 33;
    sim.step(aiming(-1, 0));

    expect(sim.projectiles.generation[0]).not.toBe(firstGeneration);
    expect(sim.projectiles.damage[0]).toBe(7);
    expect(sim.projectiles.lifetime[0]).toBe(32);
    expect(sim.projectiles.velocityX[0]).toBeLessThan(0);
    warn.mockRestore();
  });
});

/**
 * What a shot inherits from the player who fired it.
 *
 * Two different things happen to a shot depending on which half of the
 * player's velocity it inherits. Along the shot it is momentum: it changes
 * when the shot arrives and never where. Across it, it bends the stream —
 * the sway a player learns to shoot through, made possible by aim being
 * eight-way: the angle between running and aiming holds still while they
 * strafe (`docs/DECISIONS.md` #20).
 */
describe('velocity inheritance', () => {
  /** The velocity of the one shot in the air. */
  function shotVelocity(sim: GameSim): { x: number; y: number } {
    let x = 0;
    let y = 0;
    sim.projectiles.forEachLive((index) => {
      x = sim.projectiles.velocityX[index] ?? 0;
      y = sim.projectiles.velocityY[index] ?? 0;
    });
    return { x, y };
  }

  it('sways the stream with the player, which is the whole point of it', () => {
    const sim = new GameSim({ room: openRoom() });

    const running = createInputFrame();
    running.moveY = quantiseAxis(1);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(running);
    }

    // Running down while firing right bends the stream down, visibly. Without
    // this the shots trail behind the motion that produced them, and players
    // notice it without being able to name it.
    sim.step(aiming(1, 0, 0, 1));
    const shot = shotVelocity(sim);
    expect(shot.y).toBeGreaterThan(1);
    expect(Math.atan2(shot.y, shot.x)).toBeGreaterThan((15 * Math.PI) / 180);
  });

  it('carries momentum along the shot as well as across it', () => {
    const sim = new GameSim({ room: openRoom() });
    const running = createInputFrame();
    running.moveX = quantiseAxis(1);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(running);
    }

    // Running at what they are shooting: the shot leaves faster, and straight.
    sim.step(aiming(1, 0, 1, 0));
    const shot = shotVelocity(sim);
    expect(shot.x).toBeGreaterThan(DEFAULT_SHOOTING_TUNING.shotSpeed);
    expect(shot.y).toBeCloseTo(0, 6);
  });
});

/**
 * A bug report: Maß (`content/items/mass.ts`) inflates a shot's hit-circle
 * 2.5x after it spawns, and that inflated radius was also what
 * `sim/systems/shooting.ts`'s `advanceProjectile` tested against walls —
 * so standing right next to a wall and firing alongside it could kill the
 * enlarged shot on its own muzzle, in a gap the player's own body was
 * already standing in. Terrain clearance is capped at `PLAYER_RADIUS`
 * (`sim/game/sim.ts`) for exactly that reason: a gap the room already
 * admits the shooter through must keep admitting their shot, whatever an
 * item has done to its hit-circle. Enemy/obstacle collision is untouched —
 * `sim/systems/collision.ts` still reads the full inflated radius there,
 * because a bigger hit-circle mattering against something it can hurt is
 * the point of the item.
 */
describe('wall clearance for an item-enlarged shot', () => {
  it('keeps a Maß shot alive down a corridor only just wide enough for the player', () => {
    // A corridor exactly `PLAYER_RADIUS` tall on each side of centre —
    // narrow enough that Maß's 2.5x-inflated radius (7.5) no longer fits,
    // even though the player's own body (radius 7) does.
    const room = new RoomGeometry(0, 0, 640, 360);
    room.addBlock(0, 0, 640, 173);
    room.addBlock(0, 187, 640, 360);
    const sim = new GameSim({ room });
    const base = sim.playerIndex * 4;
    sim.transform.data[base] = 100;
    sim.transform.data[base + 1] = 180;
    sim.transform.data[base + 2] = 100;
    sim.transform.data[base + 3] = 180;

    sim.inventory.pickUp(sim.items.indexOf('mass'));
    sim.step(aiming(1, 0));
    // Shooting and the shot's own first movement step both happen within
    // this same tick — the old, uncapped check killed the shot right here.
    expect(sim.projectiles.liveCount).toBe(1);

    const xBefore = sim.projectiles.x[0] ?? 0;
    for (let tick = 0; tick < 5; tick++) {
      sim.step(IDLE);
    }
    expect(sim.projectiles.liveCount).toBe(1);
    expect(sim.projectiles.x[0] ?? 0).toBeGreaterThan(xBefore);
  });
});

describe('ShotFired event (#234)', () => {
  it('reports one event per squeeze, naming the player as the shooter', () => {
    const sim = new GameSim({ room: openRoom() });
    sim.step(aiming(1, 0));
    const subjects = shotsFiredThisTick(sim);
    expect(subjects).toEqual([sim.playerIndex]);
  });

  it('reports nothing on a tick nothing fires — cooldown still counting down', () => {
    const sim = new GameSim({ room: openRoom() });
    sim.step(aiming(1, 0));
    // Immediately after firing, the cooldown blocks the very next tick from
    // firing again (`DEFAULT_SHOOTING_TUNING.fireDelayTicks` is well above 1).
    sim.step(aiming(1, 0));
    expect(shotsFiredThisTick(sim)).toEqual([]);
  });

  it('reports exactly one event even with an item hooked into the same shot', () => {
    // `sim/systems/shooting.ts#fire` pushes `ShotFired` once, before
    // `dispatchItemProjectileSpawn` runs — an item's `onProjectileSpawn` hook
    // (Spiegelsaal tags the shot to split later, on impact) must not cause a
    // second push just because it reacted to the same squeeze.
    const sim = new GameSim({ room: openRoom() });
    sim.inventory.pickUp(sim.items.indexOf('spiegelsaal'));
    sim.step(aiming(1, 0));
    expect(shotsFiredThisTick(sim).length).toBe(1);
    expect(sim.projectiles.liveCount).toBe(1);
  });
});
