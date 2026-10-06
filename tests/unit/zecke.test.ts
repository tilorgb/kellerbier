import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS, zecke } from '../../src/content/enemies/index.js';
import { CollisionLayer } from '../../src/sim/collision/layers.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { EventKind } from '../../src/sim/events/queue.js';
import { ITEM_CUE_INDEX } from '../../src/sim/events/item-cues.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { AXIS_RESOLUTION, createInputFrame, type InputFrame } from '../../src/sim/input/frame.js';
import { InputPlayback, InputRecording } from '../../src/sim/input/recording.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  ENEMY_FLAG_LATCHED,
  ENEMY_MOTION_STRIDE,
  ENEMY_STRIDE,
} from '../../src/sim/systems/enemy.js';
import { STATUS_EFFECT_STRIDE, STATUS_POISON } from '../../src/sim/systems/status-effects.js';

/**
 * Zecke (#406): crawls at the player, latches on, keeps them poisoned, and
 * comes off only to a few sharp changes of direction — all of them at once.
 */

const IDLE = createInputFrame();
const FULL = AXIS_RESOLUTION;

function bareSim(seed = 0): GameSim {
  const sim = new GameSim({ seed, room: new RoomGeometry(0, 0, 320, 180) });
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

function placeZecke(sim: GameSim, dx: number, dy = 0): number {
  const player = sim.playerIndex;
  const entity = sim.spawnEnemyKind(
    sim.enemies.indexOf('zecke'),
    sim.positionX(player) + dx,
    sim.positionY(player) + dy,
  );
  sim.world.flush();
  return entityIndex(entity);
}

function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  return compiled.states[sim.enemy.data[base + 1] ?? 0]?.name ?? '';
}

function isLatched(sim: GameSim, index: number): boolean {
  return ((sim.enemy.data[index * ENEMY_STRIDE + 3] ?? 0) & ENEMY_FLAG_LATCHED) !== 0;
}

function playerPoison(sim: GameSim): number {
  return sim.statusEffect.data[sim.playerIndex * STATUS_EFFECT_STRIDE + STATUS_POISON] ?? 0;
}

function move(x: number, y = 0): InputFrame {
  const frame = createInputFrame();
  frame.moveX = x;
  frame.moveY = y;
  return frame;
}

/** Steps until every given body is latched, or fails the test. */
function stepUntilLatched(sim: GameSim, bodies: readonly number[], limit = 600): void {
  for (let tick = 0; tick < limit; tick++) {
    if (bodies.every((body) => isLatched(sim, body))) {
      return;
    }
    sim.step(IDLE);
  }
  expect(bodies.map((body) => isLatched(sim, body))).toEqual(bodies.map(() => true));
}

/** Left, right, left, right... `count` direction flips, each held `hold` ticks. */
function shake(sim: GameSim, count: number, hold: number): void {
  for (let flip = 0; flip <= count; flip++) {
    const frame = move(flip % 2 === 0 ? -FULL : FULL);
    for (let tick = 0; tick < hold; tick++) {
      sim.step(frame);
    }
  }
}

describe('Zecke (#406)', () => {
  it('compiles as a weak mini that latches while it crawls', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    const compiled = registry.get('zecke');
    expect(zecke.size).toBe('mini');
    expect(compiled.health).toBe(2);
    expect(compiled.lootTier).toBe('weak');
    expect(compiled.locksRoom).toBe(true);
    const crawl = compiled.states.find((state) => state.name === 'crawl');
    expect(crawl?.latchesOnPlayer).toBe(true);
    expect(crawl?.movement).toEqual({ behaviour: 'walkTowardPlayer', speed: 0.35 });
    expect(compiled.states.find((state) => state.name === 'latched')?.latchesOnPlayer).toBe(false);
  });

  it('crawls to the player and latches on touch, on the tick it touches', () => {
    const sim = bareSim();
    const tick = placeZecke(sim, 30);
    expect(stateName(sim, tick)).toBe('crawl');
    stepUntilLatched(sim, [tick]);
    // `onLatched` fires the same tick the body grabs on.
    expect(stateName(sim, tick)).toBe('latched');
    expect(sim.latchedEnemyCount).toBe(1);
  });

  it('cues the latch, and raises the shake-off hint only the first time in a run', () => {
    const sim = bareSim();
    const first = placeZecke(sim, 8);
    let cued = false;
    for (let step = 0; step < 60 && !isLatched(sim, first); step++) {
      sim.step(IDLE);
      for (let slot = 0; slot < sim.events.count; slot++) {
        if (
          sim.events.kind[slot] === EventKind.ItemCue &&
          sim.events.value[slot] === ITEM_CUE_INDEX['zecke-latch']
        ) {
          cued = true;
        }
      }
    }
    expect(cued).toBe(true);
    expect(sim.latchHintVisible).toBe(true);
    for (let step = 0; step < sim.tuning.latch.hintTicks + 2; step++) {
      sim.step(IDLE);
    }
    expect(sim.latchHintVisible).toBe(false);
    shake(sim, 4, 4);
    expect(isLatched(sim, first)).toBe(false);

    // A second latch in the same run does not bring the hint back.
    stepUntilLatched(sim, [first]);
    expect(sim.latchHintVisible).toBe(false);
  });

  it('rides on the player, cannot be shot or touched, and keeps the poison topped up', () => {
    const sim = bareSim();
    const tick = placeZecke(sim, 8);
    stepUntilLatched(sim, [tick]);
    expect(sim.collision.data[tick * 2]).toBe(0);

    // Walk a long way in one direction: no reversals, it stays on.
    const right = move(FULL);
    for (let step = 0; step < 300; step++) {
      sim.step(right);
      const motionBase = tick * ENEMY_MOTION_STRIDE;
      expect(sim.positionX(tick)).toBeCloseTo(
        sim.positionX(sim.playerIndex) + (sim.enemyMotion.data[motionBase] ?? 0),
        6,
      );
      expect(sim.positionY(tick)).toBeCloseTo(
        sim.positionY(sim.playerIndex) + (sim.enemyMotion.data[motionBase + 1] ?? 0),
        6,
      );
    }
    expect(isLatched(sim, tick)).toBe(true);
    expect(playerPoison(sim)).toBeGreaterThanOrEqual(
      sim.tuning.projectileTags.playerPoisonDurationTicks - 1,
    );
    // Its health is untouched by anything that happened while it rode along.
    expect(sim.health.data[tick * 2]).toBe(2);
  });

  it('a slow turn or a single flip is not a shake', () => {
    const sim = bareSim();
    const tick = placeZecke(sim, 8);
    stepUntilLatched(sim, [tick]);

    // Sweep the stick around a quarter at a time, well apart: never two
    // reversals inside the window.
    const headings: [number, number][] = [
      [FULL, 0],
      [0, FULL],
      [-FULL, 0],
      [0, -FULL],
      [FULL, 0],
    ];
    for (const [x, y] of headings) {
      const frame = move(x, y);
      for (let step = 0; step < 30; step++) {
        sim.step(frame);
      }
    }
    expect(isLatched(sim, tick)).toBe(true);

    shake(sim, 1, 6);
    expect(isLatched(sim, tick)).toBe(true);
  });

  it('flips spread wider than the window do not add up', () => {
    const sim = bareSim();
    const tick = placeZecke(sim, 8);
    stepUntilLatched(sim, [tick]);
    shake(sim, 6, sim.tuning.latch.shakeWindowTicks);
    expect(isLatched(sim, tick)).toBe(true);
  });

  it('three quick reversals throw every latched tick off at once, onto the floor and back onto a layer', () => {
    const sim = bareSim();
    const ticks = [placeZecke(sim, 10, 0), placeZecke(sim, -10, 0), placeZecke(sim, 0, 10)];
    stepUntilLatched(sim, ticks);
    expect(sim.latchedEnemyCount).toBe(3);

    // Hold one direction first so the reference heading is established.
    for (let step = 0; step < 5; step++) {
      sim.step(move(FULL));
    }
    shake(sim, 3, 5);
    for (const tick of ticks) {
      expect(isLatched(sim, tick)).toBe(false);
      expect(sim.collision.data[tick * 2]).toBe(CollisionLayer.Obstacle);
    }
    expect(sim.latchedEnemyCount).toBe(0);
    sim.step(IDLE);
    for (const tick of ticks) {
      expect(stateName(sim, tick)).toBe('dropped');
    }
  });

  it('lies helpless once shaken off, then crawls again', () => {
    const sim = bareSim();
    const tick = placeZecke(sim, 8);
    stepUntilLatched(sim, [tick]);
    shake(sim, 4, 4);
    sim.step(IDLE);
    expect(stateName(sim, tick)).toBe('dropped');
    const x = sim.positionX(tick);
    for (let step = 0; step < 50; step++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, tick)).toBe('dropped');
    expect(Math.abs(sim.positionX(tick) - x)).toBeLessThan(3);
    for (let step = 0; step < 20; step++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, tick)).not.toBe('dropped');
  });

  it('shake detection is deterministic from the input log', () => {
    const recording = new InputRecording();
    const pattern = [FULL, -FULL, FULL, -FULL, 0, FULL, -FULL, FULL];
    for (let step = 0; step < 900; step++) {
      // Walk in, idle, then a ragged shake every few seconds.
      const phase = step % 180;
      const x = phase < 120 ? 0 : (pattern[Math.floor(phase / 7) % pattern.length] ?? 0);
      recording.push(move(x, phase < 60 ? FULL >> 2 : 0));
    }
    const run = (): string => {
      const sim = bareSim(0x2e_c4e);
      const bodies = [placeZecke(sim, 40, 10), placeZecke(sim, -50, -5)];
      const playback = new InputPlayback(recording);
      const trace: string[] = [];
      const frames = recording.length;
      for (let step = 0; step < frames; step++) {
        sim.step(playback.next());
        trace.push(
          `${String(sim.latchedEnemyCount)}:${String(sim.latchShakeCount)}:` +
            bodies
              .map((body) => `${sim.positionX(body).toFixed(6)},${stateName(sim, body)}`)
              .join('|'),
        );
      }
      return trace.join('\n');
    };
    const first = run();
    expect(first).toContain('latched');
    expect(first).toContain('dropped');
    expect(run()).toBe(first);
  });

  it('refuses an onLatched on an enemy that never latches', () => {
    const broken: EnemyDefinition = {
      id: 'broken',
      name: 'Broken',
      size: 'mini',
      health: 1,
      contactDamage: 0,
      initial: 'a',
      states: [
        {
          name: 'a',
          behaviours: [{ behaviour: 'pause' }],
          transitions: [{ to: 'a', onLatched: true }],
        },
      ],
    };
    expect(() => new EnemyRegistry([broken])).toThrow(/latchOnPlayer/);
  });
});
