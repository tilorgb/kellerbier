import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  ENEMY_STRIDE,
  TelegraphShape,
  enemyBeam,
  enemyBeamTelegraph,
  enemyTelegraphShape,
  type EnemyBeamInfo,
  type EnemyTelegraphShapeInfo,
} from '../../src/sim/systems/enemy.js';
import { STATUS_EFFECT_STRIDE, STATUS_FREEZE } from '../../src/sim/systems/status-effects.js';

/**
 * The laser, the freeze and the burst (#40): `fireBeam`, the `whenPlayerCrossesRow`
 * trigger, a freezing enemy shot and a bursting one. Everything here is a
 * fixture definition — the mobs that use them are authored with their art.
 */

const IDLE = createInputFrame();

/** A rooted cross: waits for the player to cross its row, loads, fires a row beam, rests. */
const CROSS: EnemyDefinition = {
  id: 'test-cross',
  name: 'Test cross',
  size: 'mid',
  rooted: true,
  health: 1000,
  contactDamage: 0,
  initial: 'wait',
  states: [
    {
      name: 'wait',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'load', whenPlayerCrossesRow: true }],
    },
    {
      name: 'load',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 20 }],
      transitions: [{ to: 'fire', after: 20 }],
    },
    {
      name: 'fire',
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'fireBeam', mode: 'row', beamTicks: 10, halfWidth: 3, damage: 2 },
      ],
      transitions: [{ to: 'rest', after: 12 }],
    },
    {
      name: 'rest',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'wait', after: 60 }],
    },
  ],
};

/** A rooted hare-alike: locks the player on entry and fires along the nearest axis. */
const AXIS: EnemyDefinition = {
  id: 'test-axis',
  name: 'Test axis',
  size: 'mini',
  rooted: true,
  health: 1000,
  contactDamage: 0,
  initial: 'load',
  states: [
    {
      name: 'load',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 10 }],
      transitions: [{ to: 'fire', after: 10 }],
    },
    {
      name: 'fire',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireBeam',
          mode: 'axis',
          beamTicks: 8,
          halfWidth: 2,
          damage: 1,
          freeze: true,
        },
      ],
      transitions: [{ to: 'load', after: 40 }],
    },
  ],
};

/** A cannon-alike: one big freezing, bursting ball. */
const CANNON: EnemyDefinition = {
  id: 'test-cannon',
  name: 'Test cannon',
  size: 'mid',
  rooted: true,
  health: 1000,
  contactDamage: 0,
  initial: 'aim',
  states: [
    {
      name: 'aim',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 10 }],
      transitions: [{ to: 'fire', after: 10 }],
    },
    {
      name: 'fire',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 999,
          speed: 1.5,
          damage: 2,
          lifetimeTicks: 200,
          radius: 6,
          freeze: true,
          burst: true,
        },
      ],
      transitions: [{ to: 'aim', after: 400 }],
    },
  ],
};

/** The cannon again, its ball cut to land where the player stood when the wind-up locked. */
const LOB: EnemyDefinition = {
  ...CANNON,
  id: 'test-lob',
  states: CANNON.states.map((state) =>
    state.name === 'fire'
      ? {
          ...state,
          behaviours: state.behaviours.map((b) =>
            b.behaviour === 'fireAtPlayer' ? { ...b, speed: 2, landAtTarget: true } : b,
          ),
        }
      : state,
  ),
};

const FIXTURES = [CROSS, AXIS, CANNON, LOB];

function openSim(room = new RoomGeometry(0, 0, 320, 180)): GameSim {
  const sim = new GameSim({ seed: 3, room, enemies: [...ENEMY_DEFINITIONS, ...FIXTURES] });
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
  sim.health.data[player * 2] = 1000;
  sim.health.data[player * 2 + 1] = 1000;
  return sim;
}

function place(sim: GameSim, index: number, x: number, y: number): void {
  const t = sim.transform.data;
  t[index * 4] = x;
  t[index * 4 + 1] = y;
  t[index * 4 + 2] = x;
  t[index * 4 + 3] = y;
  sim.velocity.data[index * 2] = 0;
  sim.velocity.data[index * 2 + 1] = 0;
}

function spawn(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  return (
    sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0]?.name ?? ''
  );
}

function stepUntil(
  sim: GameSim,
  index: number,
  state: string,
  limit: number,
  pin: readonly [number, number],
): number {
  for (let tick = 0; tick < limit; tick++) {
    if (stateName(sim, index) === state) {
      return tick;
    }
    place(sim, sim.playerIndex, pin[0], pin[1]);
    sim.step(IDLE);
  }
  return -1;
}

function health(sim: GameSim): number {
  return sim.health.data[sim.playerIndex * 2] ?? 0;
}

function newBeamInfo(): EnemyBeamInfo {
  return {
    count: 0,
    ax: [0, 0],
    ay: [0, 0],
    bx: [0, 0],
    by: [0, 0],
    halfWidth: 0,
    damage: 0,
    height: 0,
    landUnits: 0,
    progress: 0,
  };
}

describe('fireBeam validation (#40)', () => {
  const bad = (beam: Record<string, unknown>): EnemyDefinition => ({
    ...CROSS,
    id: 'bad-beam',
    initial: 'only',
    states: [
      {
        name: 'only',
        behaviours: [{ behaviour: 'pause' }, { behaviour: 'fireBeam', ...beam } as never],
      },
    ],
  });
  const good = { mode: 'row', beamTicks: 5, halfWidth: 2, damage: 1 };

  it('compiles a well-formed beam', () => {
    const compiled = new EnemyRegistry([bad(good)]).get('bad-beam');
    expect(compiled.states[0]?.fireBeam).toMatchObject({ mode: 'row', beamTicks: 5, damage: 1 });
  });

  it.each([
    ['a bad mode', { ...good, mode: 'diagonal' }],
    ['no beamTicks', { ...good, beamTicks: 0 }],
    ['no width', { ...good, halfWidth: 0 }],
    ['no damage', { ...good, damage: 0 }],
  ])('rejects %s', (_label, beam) => {
    expect(() => new EnemyRegistry([bad(beam)])).toThrow(/fireBeam/);
  });
});

/**
 * Walks the player across `row` at column `x` the way a player does — held
 * input, so the sim's own previous-position bookkeeping sees a real crossing —
 * and returns once they are two units past it. `direction` is 1 for south.
 */
function walkAcross(sim: GameSim, x: number, row: number, direction: 1 | -1): void {
  place(sim, sim.playerIndex, x, row - direction * 14);
  const input = createInputFrame();
  input.moveY = direction * 127;
  for (let tick = 0; tick < 60; tick++) {
    sim.step(input);
    if ((sim.positionY(sim.playerIndex) - row) * direction > 2) {
      return;
    }
  }
  throw new Error('the player never crossed the row');
}

describe('the Summit-cross shape: whenPlayerCrossesRow + a row beam (#40)', () => {
  it('stays put while the player stays on one side of its row, then loads when they cross', () => {
    const sim = openSim();
    const cross = spawn(sim, 'test-cross', 160, 90);
    for (let tick = 0; tick < 30; tick++) {
      place(sim, sim.playerIndex, 60, 40 + (tick % 2));
      sim.step(IDLE);
    }
    expect(stateName(sim, cross)).toBe('wait');
    walkAcross(sim, 60, 90, 1);
    expect(stateName(sim, cross)).toBe('load');
  });

  it('warns of the whole row it will light', () => {
    const sim = openSim();
    const cross = spawn(sim, 'test-cross', 160, 90);
    walkAcross(sim, 60, 90, 1);
    for (let tick = 0; tick < 6; tick++) {
      place(sim, sim.playerIndex, 60, 130);
      sim.step(IDLE);
    }
    const info: EnemyTelegraphShapeInfo = {
      shape: TelegraphShape.Ring,
      progress: 0,
      x: 0,
      y: 0,
      angle: 0,
      arc: 0,
      reach: 0,
    };
    expect(enemyTelegraphShape(sim, cross, info)).toBe(true);
    expect(info.shape).toBe(TelegraphShape.Beam);
    const beam = newBeamInfo();
    expect(enemyBeamTelegraph(sim, cross, beam)).toBe(true);
    expect(beam.count).toBe(2);
    // Out to the walls on both sides of the row.
    expect(Math.min(beam.bx[0], beam.bx[1])).toBeLessThan(40);
    expect(Math.max(beam.bx[0], beam.bx[1])).toBeGreaterThan(280);
    expect(beam.ay[0]).toBe(90);
  });

  /** Crosses, then pins the player at `pinY` until the cross rests; the damage taken. */
  function damageTakenPinnedAt(sim: GameSim, pinX: number, pinY: number): number {
    const cross = spawn(sim, 'test-cross', 160, 90);
    walkAcross(sim, pinX, 90, 1);
    const before = health(sim);
    for (let tick = 0; tick < 80 && stateName(sim, cross) !== 'rest'; tick++) {
      place(sim, sim.playerIndex, pinX, pinY);
      sim.step(IDLE);
    }
    expect(stateName(sim, cross)).toBe('rest');
    return before - health(sim);
  }

  it('hits a player standing on the row, once, for its damage', () => {
    expect(damageTakenPinnedAt(openSim(), 60, 91)).toBe(2);
  });

  it('misses a player who has stepped off the row', () => {
    expect(damageTakenPinnedAt(openSim(), 60, 140)).toBe(0);
  });

  it('is stopped by a boulder in the row, so the far side is safe', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(210, 80, 230, 100, true);
    expect(damageTakenPinnedAt(openSim(room), 260, 91)).toBe(0);
  });

  it('and the lit beam is drawn ending at the rock', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(210, 80, 230, 100, true);
    const sim = openSim(room);
    const cross = spawn(sim, 'test-cross', 160, 90);
    walkAcross(sim, 60, 90, 1);
    const lit = newBeamInfo();
    for (let tick = 0; tick < 60 && !enemyBeam(sim, cross, lit); tick++) {
      place(sim, sim.playerIndex, 60, 130);
      sim.step(IDLE);
    }
    expect(lit.count).toBe(2);
    const east = Math.max(lit.bx[0], lit.bx[1]);
    expect(east).toBeGreaterThan(160);
    expect(east).toBeLessThan(212);
  });

  it('rests after firing, so a crossing straight afterwards does nothing', () => {
    const sim = openSim();
    const cross = spawn(sim, 'test-cross', 160, 90);
    walkAcross(sim, 60, 90, 1);
    expect(stepUntil(sim, cross, 'rest', 120, [60, 140])).toBeGreaterThan(0);
    walkAcross(sim, 60, 90, -1);
    expect(stateName(sim, cross)).toBe('rest');
  });
});

describe('an axis beam fires along the line the player is on, toward them (#40)', () => {
  function litBeamAt(player: readonly [number, number]): EnemyBeamInfo {
    const sim = openSim();
    const hare = spawn(sim, 'test-axis', 160, 90);
    const lit = newBeamInfo();
    for (let tick = 0; tick < 80; tick++) {
      place(sim, sim.playerIndex, player[0], player[1]);
      sim.step(IDLE);
      if (enemyBeam(sim, hare, lit)) {
        return lit;
      }
    }
    throw new Error('the beam never lit');
  }

  it('east of it, the beam runs east', () => {
    const lit = litBeamAt([260, 92]);
    expect(lit.count).toBe(1);
    expect(lit.bx[0]).toBeGreaterThan(280);
    expect(lit.by[0]).toBeCloseTo(90, 5);
  });

  it('north of it, the beam runs north', () => {
    const lit = litBeamAt([162, 20]);
    expect(lit.bx[0]).toBeCloseTo(160, 5);
    expect(lit.by[0]).toBeLessThan(40);
  });

  it('freezes the player it hits', () => {
    const sim = openSim();
    spawn(sim, 'test-axis', 160, 90);
    let frozen = false;
    for (let tick = 0; tick < 80 && !frozen; tick++) {
      place(sim, sim.playerIndex, 200, 90);
      sim.step(IDLE);
      frozen =
        (sim.statusEffect.data[sim.playerIndex * STATUS_EFFECT_STRIDE + STATUS_FREEZE] ?? 0) > 0;
    }
    expect(frozen).toBe(true);
  });
});

describe('a freezing, bursting shot (#40)', () => {
  function fireAt(player: readonly [number, number], room = new RoomGeometry(0, 0, 320, 180)) {
    const sim = openSim(room);
    spawn(sim, 'test-cannon', 40, 90);
    return { sim, player };
  }

  function enemyShots(sim: GameSim): { damage: number; freezing: boolean }[] {
    const out: { damage: number; freezing: boolean }[] = [];
    const shots = sim.projectiles;
    shots.forEachLive((slot) => {
      if (shots.team[slot] === ProjectileTeam.Enemy) {
        out.push({
          damage: shots.damage[slot] ?? 0,
          freezing: ((shots.tags[slot] ?? 0) & 128) !== 0,
        });
      }
    });
    return out;
  }

  it('a direct hit costs double and freezes, and the ball bursts into four plain freezing clods', () => {
    const { sim, player } = fireAt([200, 90]);
    const before = health(sim);
    let burstSeen = 0;
    for (let tick = 0; tick < 200; tick++) {
      place(sim, sim.playerIndex, player[0], player[1]);
      sim.step(IDLE);
      const shots = enemyShots(sim);
      if (shots.length === 4 && shots.every((shot) => shot.damage === 1 && shot.freezing)) {
        burstSeen = tick;
        break;
      }
    }
    expect(burstSeen).toBeGreaterThan(0);
    expect(before - health(sim)).toBe(2);
    expect(
      sim.statusEffect.data[sim.playerIndex * STATUS_EFFECT_STRIDE + STATUS_FREEZE],
    ).toBeGreaterThan(0);
  });

  it('bursts against a wall when it misses', () => {
    const { sim } = fireAt([200, 90]);
    let burst = false;
    for (let tick = 0; tick < 400 && !burst; tick++) {
      // Out of its way, so the ball runs on to the far wall.
      place(sim, sim.playerIndex, 120, 20);
      sim.step(IDLE);
      burst = enemyShots(sim).length === 4;
    }
    expect(burst).toBe(true);
  });

  it('the fragments do not burst again', () => {
    const { sim } = fireAt([200, 90]);
    let maxShots = 0;
    for (let tick = 0; tick < 450; tick++) {
      place(sim, sim.playerIndex, 120, 20);
      sim.step(IDLE);
      maxShots = Math.max(maxShots, enemyShots(sim).length);
    }
    expect(maxShots).toBeLessThanOrEqual(4);
  });
});

describe('a ball that lands where the player stood (#40)', () => {
  it('bursts on the spot the wind-up locked, not at the wall behind it', () => {
    const sim = openSim();
    spawn(sim, 'test-lob', 40, 90);
    let atX = -1;
    let atY = -1;
    for (let tick = 0; tick < 200; tick++) {
      // Locked at (200, 90) through the wind-up, then gone before the ball arrives.
      const pinned = tick < 12;
      place(sim, sim.playerIndex, pinned ? 200 : 120, pinned ? 90 : 20);
      sim.step(IDLE);
      const shots = sim.projectiles;
      let count = 0;
      let sx = 0;
      let sy = 0;
      shots.forEachLive((slot) => {
        if (shots.team[slot] === ProjectileTeam.Enemy) {
          count += 1;
          sx += shots.x[slot] ?? 0;
          sy += shots.y[slot] ?? 0;
        }
      });
      if (count === 4) {
        atX = sx / count;
        atY = sy / count;
        break;
      }
    }
    expect(atX).toBeGreaterThan(-1);
    // Within a few units of where the player stood, nowhere near the far wall.
    expect(Math.abs(atX - 200)).toBeLessThan(12);
    expect(Math.abs(atY - 90)).toBeLessThan(12);
  });
});

describe('a freeze roots the player briefly and then cannot be re-applied at once (#40)', () => {
  it('holds Alois nearly still for the freeze, then lets go', () => {
    const sim = openSim();
    const input = createInputFrame();
    input.moveX = 127;
    const start = sim.positionX(sim.playerIndex);
    sim.statusEffect.data[sim.playerIndex * STATUS_EFFECT_STRIDE + STATUS_FREEZE] = 42;
    for (let tick = 0; tick < 42; tick++) {
      sim.step(input);
    }
    const frozenTravel = sim.positionX(sim.playerIndex) - start;
    const after = sim.positionX(sim.playerIndex);
    for (let tick = 0; tick < 42; tick++) {
      sim.step(input);
    }
    const freeTravel = sim.positionX(sim.playerIndex) - after;
    expect(frozenTravel).toBeLessThan(freeTravel / 3);
  });
});
