import { describe, expect, it } from 'vitest';
import { DOTSCH_COOLDOWN_TICKS, DOTSCH_ROLL_TICKS } from '../../src/content/items/dotsch.js';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { LEBERKAS_SPAWN_TICKS } from '../../src/content/items/leberkas.js';
import { WALLER_RANGE } from '../../src/content/items/waller-kopf.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { StatId } from '../../src/sim/stats/definition.js';
import { laserWindupTicks, LASER_WINDUP_TICKS } from '../../src/sim/systems/laser-shot.js';
import { LOB_FLIGHT_TICKS } from '../../src/sim/systems/lobs.js';
import { isScared } from '../../src/sim/systems/status-effects.js';

/**
 * The ten-item batch (Roter Stier, Waller-Kopf, The Patriot, Dotsch, Müll, Rolling R, Bratwurst,
 * Krapfen, Leberkas, Pfeitinger Ultrabräu): what each does in a running sim.
 */

const IDLE = createInputFrame();

function world(...items: string[]): GameSim {
  const sim = new GameSim({
    room: new RoomGeometry(0, 0, 320, 180),
    population: 'empty',
    items: ITEM_DEFINITIONS,
  });
  for (const id of items) {
    sim.pickUpItem(id);
  }
  return sim;
}

/** Holding fire while aiming east; `moveX`/`moveY` are the usual -127..127 axes. */
function firing(held = true, moveX = 0, moveY = 0): InputFrame {
  const frame = createInputFrame();
  frame.aimX = 127;
  frame.moveX = moveX;
  frame.moveY = moveY;
  setActionDown(frame, InputAction.Fire, held);
  return frame;
}

function liveProjectiles(sim: GameSim): number[] {
  const live: number[] = [];
  sim.projectiles.forEachLive((index) => {
    live.push(index);
  });
  return live;
}

function place(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function walking(x: number, y: number): InputFrame {
  const frame = createInputFrame();
  frame.moveX = x;
  frame.moveY = y;
  return frame;
}

describe('The Patriot', () => {
  it('adds one flat damage per stack', () => {
    const sim = world();
    const base = sim.stats.value(StatId.Damage);
    sim.pickUpItem('the-patriot');
    expect(sim.stats.value(StatId.Damage)).toBeCloseTo(base + 1);
  });
});

describe('Roter Stier', () => {
  it('lets Alois fly and walk 25% faster', () => {
    const sim = world();
    const speed = sim.stats.value(StatId.MoveSpeed);
    expect(sim.playerFlies).toBe(false);
    sim.pickUpItem('roter-stier');
    expect(sim.playerFlies).toBe(true);
    expect(sim.stats.value(StatId.MoveSpeed)).toBeCloseTo(speed * 1.25);
  });
});

describe('Rolling R', () => {
  it('fires faster, smaller, weaker shots', () => {
    const plain = world();
    plain.step(firing());
    const [plainShot] = liveProjectiles(plain);
    const sim = world('rolling-r');
    sim.step(firing());
    const [shot] = liveProjectiles(sim);
    expect(shot).toBeDefined();
    const speed = (s: GameSim, i: number): number =>
      Math.hypot(s.projectiles.velocityX[i] ?? 0, s.projectiles.velocityY[i] ?? 0);
    expect(speed(sim, shot ?? 0)).toBeCloseTo(speed(plain, plainShot ?? 0) * 2, 4);
    expect(sim.projectiles.radius[shot ?? 0]).toBeCloseTo(
      (plain.projectiles.radius[plainShot ?? 0] ?? 0) / 2,
      4,
    );
    expect(sim.stats.value(StatId.Damage)).toBeCloseTo(plain.stats.value(StatId.Damage) * 0.6);
  });
});

describe('Krapfen', () => {
  it('fires one shot each way, all at full damage', () => {
    const sim = world('krapfen');
    sim.step(firing());
    const shots = liveProjectiles(sim);
    expect(shots).toHaveLength(4);
    const headings = shots
      .map((i) =>
        Math.round(
          (Math.atan2(sim.projectiles.velocityY[i] ?? 0, sim.projectiles.velocityX[i] ?? 0) /
            Math.PI) *
            2,
        ),
      )
      .map((q) => ((q % 4) + 4) % 4)
      .sort();
    expect(headings).toEqual([0, 1, 2, 3]);
    const damage = sim.stats.value(StatId.Damage);
    for (const i of shots) {
      expect(sim.projectiles.damage[i]).toBeCloseTo(damage);
    }
  });
});

describe('Müll', () => {
  it('turns shots into rubbish and leaves it on the floor, capped, until the room is left', () => {
    const sim = world('muell');
    sim.step(firing());
    const [shot] = liveProjectiles(sim);
    expect(sim.projectiles.look[shot ?? 0]).toBeGreaterThan(0);
    expect(sim.litter.liveCount).toBe(0);
    for (let i = 0; i < 80; i++) {
      sim.step(firing(false));
    }
    expect(sim.litter.liveCount).toBeGreaterThan(0);
    for (let i = 0; i < 1200; i++) {
      sim.step(firing());
    }
    expect(sim.litter.liveCount).toBeLessThanOrEqual(sim.litter.capacity);
    sim.litter.clear();
    expect(sim.litter.liveCount).toBe(0);
  });

  it('leaves plain shots plain', () => {
    const sim = world();
    sim.step(firing());
    const [shot] = liveProjectiles(sim);
    expect(sim.projectiles.look[shot ?? 0]).toBe(0);
  });
});

describe('Waller-Kopf', () => {
  it('scares what is in front of the way he walked, and only that', () => {
    const sim = world('waller-kopf');
    const px = sim.positionX(sim.playerIndex);
    const py = sim.positionY(sim.playerIndex);
    // Walk east for a tick so "last walked" is east.
    sim.step(walking(127, 0));
    const ahead = place(sim, 'kellerassel', sim.positionX(sim.playerIndex) + 40, py);
    const behind = place(sim, 'kellerassel', sim.positionX(sim.playerIndex) - 40, py);
    const far = place(sim, 'kellerassel', sim.positionX(sim.playerIndex) + WALLER_RANGE + 60, py);
    sim.step(IDLE);
    expect(px).toBeGreaterThan(0);
    expect(isScared(sim, ahead)).toBe(true);
    expect(isScared(sim, behind)).toBe(false);
    expect(isScared(sim, far)).toBe(false);
  });

  it('points along walking, never along the aim', () => {
    const sim = world('waller-kopf');
    const py = sim.positionY(sim.playerIndex);
    sim.step(walking(127, 0));
    // Shooting north must not turn the gaze.
    const aimed = createInputFrame();
    aimed.aimY = -127;
    setActionDown(aimed, InputAction.Fire, true);
    const north = place(sim, 'kellerassel', sim.positionX(sim.playerIndex), py - 40);
    sim.step(aimed);
    expect(isScared(sim, north)).toBe(false);
  });

  it('makes a scared enemy run away and stop hurting', () => {
    const sim = world('waller-kopf');
    const py = sim.positionY(sim.playerIndex);
    sim.step(walking(127, 0));
    const px = sim.positionX(sim.playerIndex);
    const enemy = place(sim, 'kellerassel', px + 30, py);
    const start = sim.positionX(enemy) - px;
    const health = sim.playerHealth;
    for (let i = 0; i < 40; i++) {
      sim.step(IDLE);
    }
    expect(sim.positionX(enemy) - sim.positionX(sim.playerIndex)).toBeGreaterThan(start + 5);
    expect(sim.playerHealth).toBe(health);
  });

  it('wears off after the gaze moves on', () => {
    const sim = world('waller-kopf');
    const py = sim.positionY(sim.playerIndex);
    sim.step(walking(127, 0));
    const enemy = place(sim, 'kellerassel', sim.positionX(sim.playerIndex) + 30, py);
    sim.step(IDLE);
    expect(isScared(sim, enemy)).toBe(true);
    // Turn round and walk away: the enemy is out of the cone now.
    for (let i = 0; i < 400; i++) {
      sim.step(walking(-127, 0));
    }
    expect(isScared(sim, enemy)).toBe(false);
  });
});

describe('Dotsch', () => {
  it('is ready when picked up, rolls the way Alois walks, and is invulnerable through it', () => {
    const sim = world('dotsch');
    sim.step(walking(127, 0));
    const startX = sim.positionX(sim.playerIndex);
    expect(sim.useActiveItem('dotsch')).toBe(true);
    expect(sim.playerRolling).toBe(true);
    expect(sim.playerInvulnerableTicks).toBeGreaterThan(0);
    for (let i = 0; i < DOTSCH_ROLL_TICKS; i++) {
      expect(sim.playerInvulnerableTicks).toBeGreaterThan(0);
      sim.step(IDLE);
    }
    expect(sim.playerRolling).toBe(false);
    expect(sim.positionX(sim.playerIndex) - startX).toBeGreaterThan(50);
    expect(sim.useActiveItem('dotsch')).toBe(false);
  });

  it('recharges on a clock, in about four seconds', () => {
    const sim = world('dotsch');
    sim.useActiveItem('dotsch');
    for (let i = 0; i < DOTSCH_COOLDOWN_TICKS - 5; i++) {
      sim.step(IDLE);
    }
    expect(sim.useActiveItem('dotsch')).toBe(false);
    for (let i = 0; i < 10; i++) {
      sim.step(IDLE);
    }
    expect(sim.useActiveItem('dotsch')).toBe(true);
  });

  it('passes through an enemy without taking damage', () => {
    const sim = world('dotsch');
    sim.step(walking(127, 0));
    const px = sim.positionX(sim.playerIndex);
    const py = sim.positionY(sim.playerIndex);
    const enemy = place(sim, 'kellerassel', px + 25, py);
    const health = sim.playerHealth;
    sim.useActiveItem('dotsch');
    for (let i = 0; i < DOTSCH_ROLL_TICKS; i++) {
      sim.step(IDLE);
    }
    expect(sim.positionX(sim.playerIndex)).toBeGreaterThan(sim.positionX(enemy));
    expect(sim.playerHealth).toBe(health);
  });
});

describe('Bratwurst', () => {
  function hurt(sim: GameSim): void {
    sim.health.data[sim.playerIndex * 2] = sim.playerMaxHealth - 3;
  }

  it('fills one heart container, once', () => {
    const sim = world('bratwurst');
    hurt(sim);
    const before = sim.playerHealth;
    expect(sim.useActiveItem('bratwurst')).toBe(true);
    expect(sim.playerHealth).toBe(before + 2);
    expect(sim.useActiveItem('bratwurst')).toBe(false);
  });

  it('does nothing, and is not spent, at full health', () => {
    const sim = world('bratwurst');
    expect(sim.useActiveItem('bratwurst')).toBe(true);
    expect(sim.playerHealth).toBe(sim.playerMaxHealth);
    hurt(sim);
    expect(sim.useActiveItem('bratwurst')).toBe(true);
  });

  it('is re-armed by a Bratwurst picked up at full health', () => {
    const sim = world('bratwurst');
    hurt(sim);
    sim.useActiveItem('bratwurst');
    sim.health.data[sim.playerIndex * 2] = sim.playerMaxHealth;
    expect(sim.useActiveItem('bratwurst')).toBe(false);
    const px = sim.positionX(sim.playerIndex);
    const py = sim.positionY(sim.playerIndex);
    sim.spawnPickup('bratwurst-full', px, py);
    sim.world.flush();
    sim.step(IDLE);
    expect(sim.canRearmBratwurst()).toBe(false);
    expect(sim.countPickupsOfKind('bratwurst-full')).toBe(0);
    hurt(sim);
    expect(sim.useActiveItem('bratwurst')).toBe(true);
  });

  it('leaves a Bratwurst on the floor at full health when it is not spent', () => {
    const sim = world('bratwurst');
    sim.spawnPickup(
      'bratwurst-full',
      sim.positionX(sim.playerIndex),
      sim.positionY(sim.playerIndex),
    );
    sim.world.flush();
    sim.step(IDLE);
    expect(sim.countPickupsOfKind('bratwurst-full')).toBe(1);
  });
});

describe('Leberkas', () => {
  it('drops a Semmel every eight seconds while enemies remain, three at most', () => {
    const sim = world('leberkas');
    place(sim, 'kellerassel', 280, 40);
    expect(sim.countPickupsOfKind('leberkas-semmel')).toBe(0);
    for (let i = 0; i < LEBERKAS_SPAWN_TICKS + 2; i++) {
      sim.step(IDLE);
    }
    expect(sim.countPickupsOfKind('leberkas-semmel')).toBe(1);
    for (let i = 0; i < LEBERKAS_SPAWN_TICKS * 5; i++) {
      sim.step(IDLE);
    }
    expect(sim.countPickupsOfKind('leberkas-semmel')).toBeLessThanOrEqual(3);
  });

  it('drops none in a room with nothing to fight', () => {
    const sim = world('leberkas');
    for (let i = 0; i < LEBERKAS_SPAWN_TICKS * 2; i++) {
      sim.step(IDLE);
    }
    expect(sim.countPickupsOfKind('leberkas-semmel')).toBe(0);
  });

  it('lobs a splash shot at the nearest enemy when one is picked up', () => {
    const sim = world();
    const px = sim.positionX(sim.playerIndex);
    const py = sim.positionY(sim.playerIndex);
    const enemy = place(sim, 'kellerassel', px + 120, py);
    const before = sim.health.data[enemy * 2] ?? 0;
    sim.spawnPickup('leberkas-semmel', px, py);
    sim.world.flush();
    sim.step(IDLE);
    let flying = 0;
    for (const live of sim.lobs.live) {
      flying += live;
    }
    expect(flying).toBe(1);
    for (let i = 0; i < LOB_FLIGHT_TICKS + 2; i++) {
      sim.step(IDLE);
    }
    expect(sim.health.data[enemy * 2] ?? 0).toBeLessThan(before);
  });
});

describe('Pfeitinger Ultrabräu', () => {
  it('fires nothing while charging, then a piercing beam on release', () => {
    const sim = world('pfeitinger-ultrabraeu');
    const windup = laserWindupTicks(sim);
    expect(windup).toBe(LASER_WINDUP_TICKS);
    for (let i = 0; i < windup + 5; i++) {
      sim.step(firing());
      expect(liveProjectiles(sim)).toHaveLength(0);
    }
    expect(sim.laserCharge).toBe(windup);
    sim.step(firing(false));
    const shots = liveProjectiles(sim);
    expect(shots).toHaveLength(1);
    const beam = shots[0] ?? 0;
    expect(sim.projectiles.damage[beam]).toBeCloseTo(sim.stats.value(StatId.Damage) * 2.5);
    expect(sim.projectiles.pierceRemaining[beam]).toBeGreaterThan(10);
    expect(sim.laserCharge).toBe(0);
  });

  it('fizzles when let go early', () => {
    const sim = world('pfeitinger-ultrabraeu');
    for (let i = 0; i < laserWindupTicks(sim) - 10; i++) {
      sim.step(firing());
    }
    sim.step(firing(false));
    expect(liveProjectiles(sim)).toHaveLength(0);
    expect(sim.laserCharge).toBe(0);
  });

  it('charges faster with a better fire rate', () => {
    const slow = world('pfeitinger-ultrabraeu');
    const quick = world('pfeitinger-ultrabraeu', 'feierabendbier');
    expect(laserWindupTicks(quick)).toBeLessThanOrEqual(laserWindupTicks(slow));
  });

  it('hits everything in its line', () => {
    const sim = world('pfeitinger-ultrabraeu');
    const px = sim.positionX(sim.playerIndex);
    const py = sim.positionY(sim.playerIndex);
    const first = place(sim, 'kellerassel', px + 60, py);
    const second = place(sim, 'kellerassel', px + 120, py);
    const firstHealth = sim.health.data[first * 2] ?? 0;
    const secondHealth = sim.health.data[second * 2] ?? 0;
    for (let i = 0; i < laserWindupTicks(sim); i++) {
      sim.step(firing());
    }
    for (let i = 0; i < 12; i++) {
      sim.step(firing(false));
    }
    expect(sim.health.data[first * 2] ?? 0).toBeLessThan(firstHealth);
    expect(sim.health.data[second * 2] ?? 0).toBeLessThan(secondHealth);
  });
});
