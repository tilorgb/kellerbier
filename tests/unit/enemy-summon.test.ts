import { describe, expect, it } from 'vitest';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { GameSim, type GameSimOptions } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * The `summon` primitive (#276) — the live-body counterpart to `splitOnDeath`,
 * Der Rattenkönig's whole reason to exist. Cadence, the `maxActive` cap, that
 * children are never elite, and that two runs from the same seed produce the
 * exact same spawns (an input-log replay has to reproduce a boss room).
 */

const spawner: EnemyDefinition = {
  id: 'test-spawner',
  name: 'Test Spawner',
  size: 'mid',
  health: 999,
  contactDamage: 0,
  initial: 'sit',
  states: [
    {
      name: 'sit',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'summon',
          enemyId: 'bierratte',
          everyTicks: 30,
          countPerWave: 2,
          maxActive: 5,
        },
      ],
    },
  ],
};

function sim(options: GameSimOptions = {}): GameSim {
  const s = new GameSim({
    room: new RoomGeometry(0, 0, 320, 180),
    enemies: [...ENEMY_DEFINITIONS, spawner],
    ...options,
  });
  const player = s.playerIndex;
  const doomed: number[] = [];
  s.world.forEach(s.collidableMask, (index) => {
    if (index !== player) doomed.push(index);
  });
  for (const index of doomed) s.world.destroy(s.world.entityAt(index));
  s.world.flush();
  return s;
}

function countKind(s: GameSim, id: string): number {
  let n = 0;
  s.world.forEach(s.enemyMask, (index) => {
    if (s.enemies.at(s.enemy.data[index * ENEMY_STRIDE] ?? 0).id === id) n += 1;
  });
  return n;
}

function runWithSpawner(seed: number, ticks: number): GameSim {
  const s = sim({ seed });
  s.spawnEnemyKind(s.enemies.indexOf('test-spawner'), 160, 90);
  s.world.flush();
  for (let t = 0; t < ticks; t++) {
    s.step(createInputFrame());
  }
  return s;
}

describe('the summon primitive (#276)', () => {
  it('spawns a wave every `everyTicks`, capped by `maxActive`', () => {
    const s = sim();
    s.spawnEnemyKind(s.enemies.indexOf('test-spawner'), 160, 90);
    s.world.flush();

    // Wave 0 at the first tick (2), wave 1 at ~30, wave 2 at ~60 — but
    // `maxActive` is 5, so the third wave only tops up to 5 rather than 6.
    for (let t = 0; t < 20; t++) s.step(createInputFrame());
    expect(countKind(s, 'bierratte')).toBe(2);
    for (let t = 0; t < 30; t++) s.step(createInputFrame());
    expect(countKind(s, 'bierratte')).toBe(4);
    for (let t = 0; t < 30; t++) s.step(createInputFrame());
    expect(countKind(s, 'bierratte')).toBe(5); // capped, not 6
    // And it stays capped — no wave ever pushes past `maxActive`.
    for (let t = 0; t < 300; t++) {
      s.step(createInputFrame());
      expect(countKind(s, 'bierratte')).toBeLessThanOrEqual(5);
    }
  });

  it('never spawns a child as an elite', () => {
    const s = runWithSpawner(7, 200);
    let rats = 0;
    s.world.forEach(s.enemyMask, (index) => {
      const base = index * ENEMY_STRIDE;
      if (s.enemies.at(s.enemy.data[base] ?? 0).id === 'bierratte') {
        rats += 1;
        expect((s.enemy.data[base + 3] ?? 0) & 0b100).toBe(0); // ENEMY_FLAG_ELITE
      }
    });
    expect(rats).toBeGreaterThan(0);
  });

  it('is deterministic — the same seed produces the same spawn positions', () => {
    const a = runWithSpawner(42, 250);
    const b = runWithSpawner(42, 250);

    const positions = (s: GameSim): string[] => {
      const out: string[] = [];
      s.world.forEach(s.enemyMask, (index) => {
        if (s.enemies.at(s.enemy.data[index * ENEMY_STRIDE] ?? 0).id === 'bierratte') {
          out.push(`${s.positionX(index).toFixed(3)},${s.positionY(index).toFixed(3)}`);
        }
      });
      return out.sort();
    };

    expect(positions(a)).toEqual(positions(b));
    expect(positions(a).length).toBeGreaterThan(0);
  });

  it('the real Der Rattenkönig actually summons Bierratten in play', () => {
    const s = sim();
    s.spawnEnemyKind(s.enemies.indexOf('der-rattenkoenig'), 160, 90);
    s.world.flush();
    for (let t = 0; t < 300; t++) s.step(createInputFrame());
    expect(countKind(s, 'bierratte')).toBeGreaterThan(0);
  });
});
