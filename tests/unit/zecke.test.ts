import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS, zecke } from '../../src/content/enemies/index.js';
import { CollisionLayer } from '../../src/sim/collision/layers.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition, HopTowardPlayerBehaviour } from '../../src/sim/enemy/definition.js';
import { EnemyFacing, EnemyRegistry } from '../../src/sim/enemy/registry.js';
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
  enemyHopProgress,
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

/** The Zecke's `crawl` hop, as authored — so tests track its tuning instead of restating it. */
function zeckeHop(): HopTowardPlayerBehaviour {
  const crawl = zecke.states.find((state) => state.name === 'crawl');
  const hop = crawl?.behaviours.find((behaviour) => behaviour.behaviour === 'hopTowardPlayer');
  if (hop?.behaviour !== 'hopTowardPlayer') {
    throw new Error('the Zecke crawls without hopTowardPlayer');
  }
  return hop;
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
  it('compiles as a weak micro that latches while it crawls', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    const compiled = registry.get('zecke');
    expect(zecke.size).toBe('micro');
    expect(compiled.health).toBe(2);
    expect(compiled.lootTier).toBe('weak');
    expect(compiled.locksRoom).toBe(true);
    const crawl = compiled.states.find((state) => state.name === 'crawl');
    expect(crawl?.latchesOnPlayer).toBe(true);
    expect(crawl?.movement).toMatchObject({ behaviour: 'hopTowardPlayer', backEvery: 3 });
    expect(compiled.facing).toBe(EnemyFacing.Crawl);
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

    // Sweep the stick around a quarter at a time, well apart: the turning
    // meter drains between them faster than they fill it.
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

    // One flip, right after all that steering.
    for (let step = 0; step < 6; step++) {
      sim.step(move(-FULL));
    }
    expect(isLatched(sim, tick)).toBe(true);
  });

  it('flips spread out over seconds do not add up', () => {
    const sim = bareSim();
    const tick = placeZecke(sim, 8);
    stepUntilLatched(sim, [tick]);
    shake(sim, 6, 60);
    expect(isLatched(sim, tick)).toBe(true);
  });

  it('running quick circles shakes it off too — not only a left-right wiggle', () => {
    const sim = bareSim();
    const tick = placeZecke(sim, 8);
    stepUntilLatched(sim, [tick]);
    // W, D, S, A, round and round, a quarter every six ticks: no single turn
    // is sharper than 90°.
    const quarters: [number, number][] = [
      [0, -FULL],
      [FULL, 0],
      [0, FULL],
      [-FULL, 0],
    ];
    let shookAfter = -1;
    for (let quarter = 0; quarter < 16 && shookAfter < 0; quarter++) {
      const [x, y] = quarters[quarter % 4] ?? [0, 0];
      for (let step = 0; step < 6; step++) {
        sim.step(move(x, y));
      }
      if (!isLatched(sim, tick)) {
        shookAfter = quarter + 1;
      }
    }
    expect(shookAfter).toBeGreaterThan(0);
    // About two laps of keys — not one quarter turn.
    expect(shookAfter).toBeLessThanOrEqual(10);
  });

  it('swirling a stick round shakes it off', () => {
    const sim = bareSim();
    const tick = placeZecke(sim, 8);
    stepUntilLatched(sim, [tick]);
    let shook = false;
    // A full circle every 30 ticks, 12° a tick.
    for (let step = 0; step < 120 && !shook; step++) {
      const angle = (step * 12 * Math.PI) / 180;
      sim.step(move(Math.round(Math.cos(angle) * FULL), Math.round(Math.sin(angle) * FULL)));
      shook = !isLatched(sim, tick);
    }
    expect(shook).toBe(true);
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

  /** Steps until the body's next hop has carried it, returning the signed change in distance to the player. */
  function nextHop(
    sim: GameSim,
    tick: number,
    limit = 60,
  ): { delta: number; heading: [number, number]; aim: [number, number] } {
    const player = sim.playerIndex;
    const distance = (): number =>
      Math.hypot(
        sim.positionX(tick) - sim.positionX(player),
        sim.positionY(tick) - sim.positionY(player),
      );
    const before = distance();
    const motionBase = tick * ENEMY_MOTION_STRIDE;
    // Wait for take-off.
    let aim: [number, number] = [0, 0];
    for (let step = 0; step < limit; step++) {
      aim = [
        sim.positionX(player) - sim.positionX(tick),
        sim.positionY(player) - sim.positionY(tick),
      ];
      const x = sim.positionX(tick);
      const y = sim.positionY(tick);
      sim.step(IDLE);
      if (sim.positionX(tick) !== x || sim.positionY(tick) !== y) {
        break;
      }
    }
    const heading: [number, number] = [
      sim.enemyMotion.data[motionBase] ?? 0,
      sim.enemyMotion.data[motionBase + 1] ?? 0,
    ];
    // Ride it out until it lands.
    for (let step = 0; step < limit; step++) {
      const x = sim.positionX(tick);
      const y = sim.positionY(tick);
      sim.step(IDLE);
      if (sim.positionX(tick) === x && sim.positionY(tick) === y) {
        break;
      }
    }
    return { delta: distance() - before, heading, aim };
  }

  it('moves in tiny hops — two toward the player, one away', () => {
    const sim = bareSim();
    const tick = placeZecke(sim, 120, 30);
    const hops = Array.from({ length: 6 }, () => nextHop(sim, tick));
    expect(hops.map((hop) => Math.sign(hop.delta))).toEqual([-1, -1, 1, -1, -1, 1]);
    // Tiny: a hop moves it at most one hop length (speed-scaled), and at
    // least most of one — the wobble only bends it.
    const hopLength = zeckeHop().hopDistance * sim.tuning.enemy.speedScale;
    for (const hop of hops) {
      expect(Math.abs(hop.delta)).toBeLessThanOrEqual(hopLength + 1e-3);
      expect(Math.abs(hop.delta)).toBeGreaterThan(hopLength * 0.85);
    }
  });

  it('never beelines: each hop wobbles off the straight line, within 18°', () => {
    const sim = bareSim(0x51);
    const tick = placeZecke(sim, 130, 60);
    const angles: number[] = [];
    for (let i = 0; i < 9; i++) {
      const hop = nextHop(sim, tick);
      const sign = i % 3 === 2 ? -1 : 1;
      const aimAngle = Math.atan2(sign * hop.aim[1], sign * hop.aim[0]);
      const hopAngle = Math.atan2(hop.heading[1], hop.heading[0]);
      let off = Math.abs(hopAngle - aimAngle);
      off = Math.min(off, Math.PI * 2 - off);
      angles.push((off * 180) / Math.PI);
    }
    for (const angle of angles) {
      expect(angle).toBeLessThanOrEqual(18.5);
    }
    // And it really does wobble — not one of them dead on, most well off it.
    expect(angles.filter((angle) => angle > 2).length).toBeGreaterThan(5);
  });

  it('a group of them does not hop in step', () => {
    const sim = bareSim(0x7e);
    const ticks = [
      placeZecke(sim, 110, 0),
      placeZecke(sim, -110, 0),
      placeZecke(sim, 0, 70),
      placeZecke(sim, 80, 60),
      placeZecke(sim, -80, -60),
    ];
    // Each body's take-off ticks over two seconds.
    const takeOffs: number[][] = ticks.map(() => []);
    for (let step = 0; step < 120; step++) {
      const was = ticks.map((t) => [sim.positionX(t), sim.positionY(t)] as const);
      const bobbing = ticks.map((t) => enemyHopProgress(sim, t) > 0);
      sim.step(IDLE);
      ticks.forEach((t, i) => {
        const [x, y] = was[i] ?? [0, 0];
        const moved = sim.positionX(t) !== x || sim.positionY(t) !== y;
        if (moved && bobbing[i] === false) {
          takeOffs[i]?.push(step);
        }
      });
    }
    for (const list of takeOffs) {
      expect(list.length).toBeGreaterThan(4);
    }
    // Different first take-offs, and no two of them on the same beat.
    expect(new Set(takeOffs.map((list) => list[0])).size).toBeGreaterThan(2);
    const beats = takeOffs.map((list) => list.join(','));
    expect(new Set(beats).size).toBe(beats.length);
  });

  it('hops at any angle, and its heading is the hop it is on', () => {
    const sim = bareSim();
    const tick = placeZecke(sim, 60, 45);
    const hop = nextHop(sim, tick);
    // Not snapped to an axis: both components well clear of zero.
    expect(Math.abs(hop.heading[0])).toBeGreaterThan(0.3);
    expect(Math.abs(hop.heading[1])).toBeGreaterThan(0.3);
    // And toward the player, give or take its wobble.
    const dot =
      (hop.heading[0] * hop.aim[0] + hop.heading[1] * hop.aim[1]) / Math.hypot(...hop.aim);
    expect(dot).toBeGreaterThan(Math.cos((18.5 * Math.PI) / 180));
  });

  it('turns aside rather than hopping into a wall', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    // A wall right across the straight line to the player.
    room.addBlock(150, 60, 156, 120);
    const sim = new GameSim({ seed: 0, room });
    const doomed: number[] = [];
    sim.world.forEach(sim.collidableMask, (index) => {
      if (index !== sim.playerIndex) {
        doomed.push(index);
      }
    });
    for (const index of doomed) {
      sim.world.destroy(sim.world.entityAt(index));
    }
    sim.world.flush();
    const transform = sim.transform.data;
    const player = sim.playerIndex;
    transform[player * 4] = 100;
    transform[player * 4 + 1] = 90;
    transform[player * 4 + 2] = 100;
    transform[player * 4 + 3] = 90;
    const tick = entityIndex(sim.spawnEnemyKind(sim.enemies.indexOf('zecke'), 160, 90));
    sim.world.flush();
    sim.step(IDLE);
    const motionBase = tick * ENEMY_MOTION_STRIDE;
    // Not straight west into the wall: off to one side, or resting.
    expect(sim.enemyMotion.data[motionBase]).not.toBeCloseTo(-1, 2);
    for (let step = 0; step < 40; step++) {
      sim.step(IDLE);
      expect(room.isClear(sim.positionX(tick), sim.positionY(tick), 1)).toBe(true);
    }
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
          `${String(sim.latchedEnemyCount)}:${sim.latchShakeProgress.toFixed(4)}:` +
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

  it('refuses a hopTowardPlayer that never hops back', () => {
    const broken: EnemyDefinition = {
      id: 'broken',
      name: 'Broken',
      size: 'micro',
      health: 1,
      contactDamage: 0,
      initial: 'a',
      states: [
        {
          name: 'a',
          behaviours: [
            {
              behaviour: 'hopTowardPlayer',
              hopDistance: 10,
              hopTicks: 5,
              restTicks: 4,
              restJitter: 1,
              aimJitterDegrees: 18,
              backEvery: 1,
            },
          ],
          transitions: [],
        },
      ],
    };
    expect(() => new EnemyRegistry([broken])).toThrow(/backEvery/);
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
