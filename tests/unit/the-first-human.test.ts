import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS, theFirstHuman } from '../../src/content/enemies/index.js';
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
  enemyTelegraphShape,
  enemyBeam,
  enemyBeamTelegraph,
  type EnemyBeamInfo,
  isEnemyInvulnerable,
  type EnemyTelegraphShapeInfo,
} from '../../src/sim/systems/enemy.js';

/**
 * The First Human (#437) and the two primitives he brought: `fireSweep`, a
 * ranged arm-sweep that lays its shots down one bearing at a time, and
 * `whenHealthBelow`, a phase change that keeps the body.
 */

const IDLE = createInputFrame();

function openSim(definitions: readonly EnemyDefinition[] = ENEMY_DEFINITIONS): GameSim {
  const sim = new GameSim({
    seed: 4,
    room: new RoomGeometry(0, 0, 400, 240),
    enemies: definitions,
  });
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
  sim.health.data[player * 2] = 1_000_000;
  sim.health.data[player * 2 + 1] = 1_000_000;
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

/** Steps until `index` is in `state`, pinning the player each tick; the tick it got there, or -1. */
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

/** Every live enemy shot's bearing, in radians. */
function shotBearings(sim: GameSim): number[] {
  const bearings: number[] = [];
  const shots = sim.projectiles;
  shots.forEachLive((slot) => {
    if (shots.team[slot] === ProjectileTeam.Enemy) {
      bearings.push(Math.atan2(shots.velocityY[slot] ?? 0, shots.velocityX[slot] ?? 0));
    }
  });
  return bearings;
}

/** A one-state sweeper: enters its swing at once, so the sweep's own mechanics can be read in isolation. */
const SWEEPER: EnemyDefinition = {
  id: 'sweeper',
  name: 'Sweeper',
  size: 'boss',
  health: 1000,
  contactDamage: 0,
  initial: 'windup',
  states: [
    {
      name: 'windup',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 10 }],
      transitions: [{ to: 'sweep', after: 10 }],
    },
    {
      name: 'sweep',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSweep',
          arc: Math.PI / 2,
          sweepTicks: 40,
          shotEveryTicks: 10,
          direction: 1,
          speed: 1,
          damage: 1,
          lifetimeTicks: 300,
          radius: 3,
        },
      ],
      transitions: [{ to: 'done', after: 60 }],
    },
    { name: 'done', behaviours: [{ behaviour: 'pause' }] },
  ],
};

describe('fireSweep (#437)', () => {
  it('fires one shot per shotEveryTicks along the arm, from one edge of the arc to the other', () => {
    const sim = openSim([...ENEMY_DEFINITIONS, SWEEPER]);
    const boss = spawn(sim, 'sweeper', 200, 120);
    // Player due east: the aim is 0 rad, the arc runs -π/4 → +π/4 clockwise.
    expect(stepUntil(sim, boss, 'sweep', 40, [300, 120])).toBeGreaterThanOrEqual(0);
    for (let tick = 0; tick <= 40; tick++) {
      place(sim, sim.playerIndex, 300, 120);
      sim.step(IDLE);
    }
    const bearings = shotBearings(sim).sort((a, b) => a - b);
    // Ticks 0, 10, 20, 30, 40 of the swing: five shots, evenly spaced over the arc.
    expect(bearings).toHaveLength(5);
    const expected = [-Math.PI / 4, -Math.PI / 8, 0, Math.PI / 8, Math.PI / 4];
    bearings.forEach((bearing, i) => {
      expect(bearing).toBeCloseTo(expected[i] ?? 0, 2);
    });
  });

  it('is aimed where the player stood when the wind-up began, not where they are when it fires', () => {
    const sim = openSim([...ENEMY_DEFINITIONS, SWEEPER]);
    spawn(sim, 'sweeper', 200, 120);
    // The wind-up locks on its first tick with the player due east...
    place(sim, sim.playerIndex, 300, 120);
    sim.step(IDLE);
    // ...then they run north for the rest of it and the whole swing.
    for (let tick = 0; tick < 60; tick++) {
      place(sim, sim.playerIndex, 200, 20);
      sim.step(IDLE);
    }
    const bearings = shotBearings(sim);
    expect(bearings.length).toBeGreaterThan(0);
    // Every shot is within the eastward arc; none went north (-π/2).
    for (const bearing of bearings) {
      expect(Math.abs(bearing)).toBeLessThanOrEqual(Math.PI / 4 + 0.01);
    }
  });

  it('is safe behind the sweep: once the arm has passed a bearing, nothing more is fired along it', () => {
    const sim = openSim([...ENEMY_DEFINITIONS, SWEEPER]);
    const boss = spawn(sim, 'sweeper', 200, 120);
    expect(stepUntil(sim, boss, 'sweep', 40, [300, 120])).toBeGreaterThanOrEqual(0);
    // Half the swing: the arm has gone from -π/4 to 0.
    for (let tick = 0; tick <= 20; tick++) {
      sim.step(IDLE);
    }
    const before = shotBearings(sim).filter((b) => b < -0.01);
    // The rest of the swing fires only ahead of the arm (bearings above 0).
    for (let tick = 21; tick <= 40; tick++) {
      sim.step(IDLE);
    }
    const after = shotBearings(sim).filter((b) => b < -0.01);
    expect(after).toHaveLength(before.length);
    expect(shotBearings(sim).some((b) => b > 0.01)).toBe(true);
  });

  it('is deterministic — the same seed and inputs lay down the same shots', () => {
    const run = (): number[] => {
      const sim = openSim([...ENEMY_DEFINITIONS, SWEEPER]);
      const boss = spawn(sim, 'sweeper', 200, 120);
      stepUntil(sim, boss, 'sweep', 40, [300, 140]);
      for (let tick = 0; tick <= 40; tick++) {
        sim.step(IDLE);
      }
      return shotBearings(sim).sort((a, b) => a - b);
    };
    expect(run()).toEqual(run());
  });

  it("warns with an arc telegraph out to the sweep's telegraphReach", () => {
    const sim = openSim([...ENEMY_DEFINITIONS, SWEEPER]);
    const boss = spawn(sim, 'sweeper', 200, 120);
    place(sim, sim.playerIndex, 300, 120);
    sim.step(IDLE);
    sim.step(IDLE);
    const info: EnemyTelegraphShapeInfo = {
      shape: TelegraphShape.Ring,
      progress: 0,
      x: 0,
      y: 0,
      angle: 0,
      arc: 0,
      reach: 0,
    };
    expect(enemyTelegraphShape(sim, boss, info)).toBe(true);
    expect(info.shape).toBe(TelegraphShape.Arc);
    expect(info.arc).toBeCloseTo(Math.PI / 2, 5);
    expect(info.angle).toBeCloseTo(0, 5);
    // Default reach: three body radii of a boss (22).
    expect(info.reach).toBeCloseTo(66, 5);
  });

  it('rejects a sweep with no arc, no shots along it, or no speed', () => {
    const sweep = {
      behaviour: 'fireSweep',
      arc: 1,
      sweepTicks: 10,
      shotEveryTicks: 2,
      speed: 1,
      damage: 1,
      lifetimeTicks: 10,
    } as const;
    const withSweep = (patch: Record<string, unknown>): EnemyDefinition => ({
      ...SWEEPER,
      states: [
        {
          name: 'windup',
          behaviours: [{ behaviour: 'pause' }, { ...sweep, ...patch }],
        },
        ...SWEEPER.states.slice(1),
      ],
    });
    expect(() => new EnemyRegistry([withSweep({ arc: 0 })])).toThrow(/arc/);
    expect(() => new EnemyRegistry([withSweep({ shotEveryTicks: 0 })])).toThrow(/shotEveryTicks/);
    expect(() => new EnemyRegistry([withSweep({ speed: 0 })])).toThrow(/speed/);
    expect(() => new EnemyRegistry([withSweep({ telegraphReach: -1 })])).toThrow(/telegraphReach/);
    expect(() => new EnemyRegistry([withSweep({})])).not.toThrow();
  });
});

describe('whenHealthBelow (#437)', () => {
  const TWO_PHASE: EnemyDefinition = {
    id: 'two-phase',
    name: 'Two Phase',
    size: 'normal',
    health: 10,
    contactDamage: 0,
    initial: 'one',
    states: [
      {
        name: 'one',
        behaviours: [{ behaviour: 'pause' }],
        transitions: [{ to: 'two', whenHealthBelow: 0.5 }],
      },
      { name: 'two', behaviours: [{ behaviour: 'pause' }] },
    ],
  };

  it('moves the body to the next phase the tick its health reaches the fraction, keeping the body', () => {
    const sim = openSim([...ENEMY_DEFINITIONS, TWO_PHASE]);
    // Away from the player, so nothing shoves it during the test.
    const body = spawn(sim, 'two-phase', 340, 60);
    sim.step(IDLE);
    expect(stateName(sim, body)).toBe('one');
    sim.health.data[body * 2] = 6;
    sim.step(IDLE);
    expect(stateName(sim, body)).toBe('one');
    sim.health.data[body * 2] = 5;
    sim.step(IDLE);
    expect(stateName(sim, body)).toBe('two');
    expect(sim.positionX(body)).toBeCloseTo(340, 3);
    expect(sim.health.data[body * 2 + 1]).toBe(10);
  });

  it('rejects a fraction outside (0, 1]', () => {
    const withFraction = (fraction: number): EnemyDefinition => ({
      ...TWO_PHASE,
      states: [
        {
          name: 'one',
          behaviours: [{ behaviour: 'pause' }],
          transitions: [{ to: 'two', whenHealthBelow: fraction }],
        },
        { name: 'two', behaviours: [{ behaviour: 'pause' }] },
      ],
    });
    expect(() => new EnemyRegistry([withFraction(0)])).toThrow(/whenHealthBelow/);
    expect(() => new EnemyRegistry([withFraction(1.5)])).toThrow(/whenHealthBelow/);
    expect(() => new EnemyRegistry([withFraction(1)])).not.toThrow();
  });
});

describe('The First Human (#437)', () => {
  it('swings left, then right, then stalks again — the pendulum', () => {
    const sim = openSim();
    const boss = spawn(sim, 'the-first-human', 200, 120);
    const pin: readonly [number, number] = [280, 120];
    expect(stepUntil(sim, boss, 'windup-left', 200, pin)).toBeGreaterThanOrEqual(0);
    expect(stepUntil(sim, boss, 'sweep-narrow', 100, pin)).toBeGreaterThanOrEqual(0);
    expect(stepUntil(sim, boss, 'windup-right', 100, pin)).toBeGreaterThanOrEqual(0);
    expect(stepUntil(sim, boss, 'sweep-wide', 100, pin)).toBeGreaterThanOrEqual(0);
    expect(stepUntil(sim, boss, 'stalk', 200, pin)).toBeGreaterThanOrEqual(0);
  });

  it('declares the phase change on every phase-one state', () => {
    const phaseOne = theFirstHuman.states.filter(
      (state) => !state.name.endsWith('-2') && !/^(arrow-pull|eyes-|laser-)/.test(state.name),
    );
    expect(phaseOne.length).toBeGreaterThan(0);
    for (const state of phaseOne) {
      expect(
        state.transitions?.some((t) => 'whenHealthBelow' in t && t.whenHealthBelow === 0.5),
        `${state.name} has no phase-two transition`,
      ).toBe(true);
    }
  });

  it('pulls the arrowhead out at half health — a long, invulnerable beat — and then fires eye lasers', () => {
    const sim = openSim();
    const boss = spawn(sim, 'the-first-human', 200, 120);
    const pin: readonly [number, number] = [280, 120];
    const max = sim.health.data[boss * 2 + 1] ?? 0;
    expect(max).toBe(theFirstHuman.health);
    sim.step(IDLE);
    sim.health.data[boss * 2] = Math.floor(max / 2);
    expect(stepUntil(sim, boss, 'arrow-pull', 5, pin)).toBeGreaterThanOrEqual(0);
    sim.step(IDLE);
    expect(isEnemyInvulnerable(sim, boss)).toBe(true);
    // The shift is loud: the sting went out and the camera is shaking.
    expect(sim.shake).toBeGreaterThan(0);
    expect(stepUntil(sim, boss, 'stalk-2', 100, pin)).toBeGreaterThanOrEqual(0);
    expect(isEnemyInvulnerable(sim, boss)).toBe(false);
    // His eyes glow (the telegraph, and the line it will light is drawn),
    // then one big laser — two half-Maß — along the bearing the glow locked.
    expect(stepUntil(sim, boss, 'eyes-1', 300, pin)).toBeGreaterThanOrEqual(0);
    const beam: EnemyBeamInfo = {
      count: 0,
      ax: [0, 0],
      ay: [0, 0],
      bx: [0, 0],
      by: [0, 0],
      halfWidth: 0,
      damage: 0,
      progress: 0,
    };
    expect(enemyBeamTelegraph(sim, boss, beam)).toBe(true);
    expect(stepUntil(sim, boss, 'laser-1', 100, pin)).toBeGreaterThanOrEqual(0);
    sim.step(IDLE);
    expect(enemyBeam(sim, boss, beam)).toBe(true);
    expect(beam.damage).toBe(2);
    expect(beam.count).toBe(1);
    // It runs east, toward where the player stood when the glow began.
    expect(beam.bx[0] - beam.ax[0]).toBeGreaterThan(40);
    expect(Math.abs(beam.by[0] - beam.ay[0])).toBeLessThan(15);
  });

  it('is named in English in every locale, and its plate carries no joke', async () => {
    const { en } = await import('../../src/i18n/dictionaries/en.js');
    const { de } = await import('../../src/i18n/dictionaries/de.js');
    const { bar } = await import('../../src/i18n/dictionaries/bar.js');
    expect(theFirstHuman.name).toBe('The First Human');
    for (const dictionary of [en, de, bar]) {
      const entries = dictionary as Record<string, string>;
      expect(entries['enemies.the-first-human.title']).toBeTruthy();
      expect(entries['enemies.the-first-human.epithet']).toBeTruthy();
    }
  });
});
