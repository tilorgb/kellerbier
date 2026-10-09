import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS as SHIPPED_DEFINITIONS } from '../../src/content/enemies/index.js';
import { CUT_ALPEN_MOBS } from './fixtures/cut-alpen-mobs.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { ProjectileTag, hasTag } from '../../src/sim/projectile/tags.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  ENEMY_MOTION_STRIDE,
  ENEMY_STRIDE,
  enemyBurrowed,
  enemyFlightHeight,
  enemyOverflies,
} from '../../src/sim/systems/enemy.js';

/**
 * Die Alpen's roster (#40) and the primitives it brought: a charge that
 * climbs over cover (Steinbock), a body under the ground (Murmeltier), a
 * shoal (Kuhglocke), a shot that marks the player (Bergwacht) and one that
 * bounces (Sennerin).
 */

/** The shipped roster plus the cut Floor 4 mobs, which stay as the primitives' fixtures. */
const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = [...SHIPPED_DEFINITIONS, ...CUT_ALPEN_MOBS];

const IDLE = createInputFrame();

function openSim(
  room = new RoomGeometry(0, 0, 320, 180),
  definitions: readonly EnemyDefinition[] = ENEMY_DEFINITIONS,
): GameSim {
  const sim = new GameSim({ seed: 9, room, enemies: definitions });
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
  // Nothing here is about the player dying.
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

/** Steps until `index` is in `state`, pinning the player each tick; returns the tick it got there or -1. */
function stepUntil(
  sim: GameSim,
  index: number,
  state: string,
  limit: number,
  pinPlayer?: readonly [number, number],
): number {
  for (let tick = 0; tick < limit; tick++) {
    if (stateName(sim, index) === state) {
      return tick;
    }
    if (pinPlayer !== undefined) {
      place(sim, sim.playerIndex, pinPlayer[0], pinPlayer[1]);
    }
    sim.step(IDLE);
  }
  return stateName(sim, index) === state ? limit : -1;
}

/** The registry's view of the roster, once. */
const registry = new EnemyRegistry(ENEMY_DEFINITIONS);

describe('Steinbock (#40): a charge that climbs over cover', () => {
  it('compiles as a tough mid whose bound climbs blocks and hits for double', () => {
    const compiled = registry.get('steinbock');
    expect(compiled.lootTier).toBe('tough');
    const bound = compiled.states.find((state) => state.name === 'bound');
    expect(bound?.movement).toMatchObject({
      behaviour: 'chargeAtPlayer',
      climbsBlocks: true,
      impact: { bodyDamageMultiplier: 2, breaksBlocks: false, breaksDoors: false },
    });
  });

  it('bounds over a boulder in its line and stops only at the wall', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    // A boulder (cover, the kind a flyer crosses) a little past where the
    // player stands: the charge is aimed at them and runs on to the wall.
    room.addBlock(150, 70, 170, 110, true);
    const sim = openSim(room);
    const ibex = spawn(sim, 'steinbock', 60, 90);
    expect(stepUntil(sim, ibex, 'paw', 200, [130, 90])).toBeGreaterThanOrEqual(0);
    expect(stepUntil(sim, ibex, 'bound', 100, [130, 90])).toBeGreaterThanOrEqual(0);
    let crossedBlock = false;
    let lifted = 0;
    for (let tick = 0; tick < 200 && stateName(sim, ibex) === 'bound'; tick++) {
      // Out of its way, so it runs the whole line to the east wall.
      place(sim, sim.playerIndex, 260, 20);
      sim.step(IDLE);
      const x = sim.positionX(ibex);
      if (x > 150 && x < 170) {
        crossedBlock = true;
        lifted = Math.max(lifted, enemyFlightHeight(sim, ibex));
      }
    }
    expect(crossedBlock).toBe(true);
    expect(lifted).toBeGreaterThan(0);
    // Past the rock and on to the wall, where the charge ends.
    expect(sim.positionX(ibex)).toBeGreaterThan(170);
    expect(stateName(sim, ibex)).toBe('stand');
    expect(enemyOverflies(sim, ibex)).toBe(false);
  });

  it('a plain charger stops at the same boulder', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(150, 70, 170, 110, true);
    const sim = openSim(room);
    const cow = spawn(sim, 'kuh', 60, 90);
    expect(stepUntil(sim, cow, 'charge', 300, [130, 90])).toBeGreaterThanOrEqual(0);
    for (let tick = 0; tick < 120 && stateName(sim, cow) === 'charge'; tick++) {
      place(sim, sim.playerIndex, 260, 20);
      sim.step(IDLE);
    }
    expect(sim.positionX(cow)).toBeLessThan(150);
  });
});

describe('Murmeltier (#40): under the snow', () => {
  it('compiles with burrowed digging and whistling states, an eruption with a landing, and no contact damage', () => {
    const compiled = registry.get('murmeltier');
    expect(compiled.contactDamage).toBe(0);
    const byName = new Map(compiled.states.map((state) => [state.name, state]));
    expect(byName.get('dig')?.burrowed).toBe(true);
    expect(byName.get('whistle')?.burrowed).toBe(true);
    expect(byName.get('whistle')?.telegraphTicks).toBe(36);
    expect(byName.get('tunnel')?.burrowed).toBe(true);
    expect(byName.get('tunnel')?.movement).toMatchObject({
      behaviour: 'chargeAtPlayer',
      untilTargetPoint: true,
      landing: { damage: 1 },
    });
    expect(byName.get('blink')?.burrowed).toBe(false);
  });

  it('is untouchable and crosses furniture while burrowed, and is a body again when it comes up', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    // A row of cover right across the room: nothing on foot gets past it.
    room.addBlock(100, 0, 120, 180, true);
    const sim = openSim(room);
    const marmot = spawn(sim, 'murmeltier', 60, 90);
    expect(stepUntil(sim, marmot, 'dig', 200, [280, 90])).toBeGreaterThanOrEqual(0);
    expect(enemyBurrowed(sim, marmot)).toBe(true);
    expect(enemyOverflies(sim, marmot)).toBe(true);
    expect(sim.collision.data[marmot * 2]).toBe(0);
    // Whistle, then tunnel to where the player stood as it whistled.
    expect(stepUntil(sim, marmot, 'whistle', 400, [280, 90])).toBeGreaterThanOrEqual(0);
    expect(stepUntil(sim, marmot, 'tunnel', 100, [280, 90])).toBeGreaterThanOrEqual(0);
    // The player steps away during the tunnel: it comes up where they were.
    expect(stepUntil(sim, marmot, 'erupt', 300, [280, 30])).toBeGreaterThanOrEqual(0);
    expect(sim.positionX(marmot)).toBeGreaterThan(200);
    expect(Math.abs(sim.positionY(marmot) - 90)).toBeLessThan(12);
    expect(enemyBurrowed(sim, marmot)).toBe(false);
    expect(sim.collision.data[marmot * 2]).not.toBe(0);
    // And it threw its ring of clods.
    let clods = 0;
    sim.projectiles.forEachLive((slot) => {
      if (sim.projectiles.team[slot] === ProjectileTeam.Enemy) {
        clods += 1;
      }
    });
    expect(clods).toBe(6);
  });

  it('hurts a player standing where it comes up', () => {
    const sim = openSim();
    const marmot = spawn(sim, 'murmeltier', 60, 90);
    expect(stepUntil(sim, marmot, 'tunnel', 600, [200, 90])).toBeGreaterThanOrEqual(0);
    const before = sim.playerHealth;
    expect(stepUntil(sim, marmot, 'blink', 300, [200, 90])).toBeGreaterThanOrEqual(0);
    expect(sim.playerHealth).toBeLessThan(before);
  });
});

describe('Kuhglocke (#40): a shoal', () => {
  it('compiles as a flying mini that shoals', () => {
    const compiled = registry.get('kuhglocke');
    expect(compiled.flying).toBe(true);
    expect(compiled.states[0]?.movement.behaviour).toBe('shoal');
  });

  it('four bells drift toward the player as a group, and keep a bell apart', () => {
    const sim = openSim();
    const bells = [
      spawn(sim, 'kuhglocke', 40, 60),
      spawn(sim, 'kuhglocke', 60, 60),
      spawn(sim, 'kuhglocke', 40, 100),
      spawn(sim, 'kuhglocke', 60, 100),
    ];
    const centroidX = () => bells.reduce((sum, b) => sum + sim.positionX(b), 0) / bells.length;
    const startX = centroidX();
    for (let tick = 0; tick < 90; tick++) {
      place(sim, sim.playerIndex, 280, 80);
      sim.step(IDLE);
    }
    expect(centroidX()).toBeGreaterThan(startX + 30);
    // Still a group: the spread stays under a few bell-widths.
    const xs = bells.map((b) => sim.positionX(b));
    const ys = bells.map((b) => sim.positionY(b));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(80);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(80);
    for (let i = 0; i < bells.length; i++) {
      for (let j = i + 1; j < bells.length; j++) {
        const dx = sim.positionX(bells[i] ?? 0) - sim.positionX(bells[j] ?? 0);
        const dy = sim.positionY(bells[i] ?? 0) - sim.positionY(bells[j] ?? 0);
        expect(Math.hypot(dx, dy)).toBeGreaterThan(6);
      }
    }
    // The heading slots carry the way it faces.
    const heading = sim.enemyMotion.data[(bells[0] ?? 0) * ENEMY_MOTION_STRIDE] ?? 0;
    expect(heading).toBeGreaterThan(0);
  });

  it('a lone bell still drifts at the player', () => {
    const sim = openSim();
    const bell = spawn(sim, 'kuhglocke', 40, 90);
    for (let tick = 0; tick < 90; tick++) {
      place(sim, sim.playerIndex, 280, 90);
      sim.step(IDLE);
    }
    expect(sim.positionX(bell)).toBeGreaterThan(70);
  });

  it('is the same shoal in two runs of the same seed', () => {
    const run = (): number[] => {
      const sim = openSim();
      const bells = [spawn(sim, 'kuhglocke', 40, 60), spawn(sim, 'kuhglocke', 60, 100)];
      for (let tick = 0; tick < 60; tick++) {
        place(sim, sim.playerIndex, 280, 80);
        sim.step(IDLE);
      }
      return bells.map((b) => sim.positionX(b) * 1000 + sim.positionY(b));
    };
    expect(run()).toEqual(run());
  });
});

describe('Bergwacht (#40): the flare that marks', () => {
  it('fires a marking flare', () => {
    const compiled = registry.get('bergwacht');
    const flare = compiled.states.find((state) => state.name === 'flare');
    expect(flare?.firing[0]).toMatchObject({ behaviour: 'fireAtPlayer', mark: true, art: 'flare' });
  });

  it('a flare hit marks the player for the tuned duration, and a marked player is seen through cover', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    const sim = openSim(room);
    const rescuer = spawn(sim, 'bergwacht', 60, 90);
    expect(stepUntil(sim, rescuer, 'flare', 400, [160, 90])).toBeGreaterThanOrEqual(0);
    sim.step(IDLE);
    let marking = 0;
    sim.projectiles.forEachLive((slot) => {
      if (hasTag(sim.projectiles.tags[slot] ?? 0, ProjectileTag.Marking)) {
        marking += 1;
      }
    });
    expect(marking).toBe(1);
    expect(sim.playerMarked).toBe(0);
    for (let tick = 0; tick < 150 && sim.playerMarked === 0; tick++) {
      place(sim, sim.playerIndex, 160, 90);
      sim.step(IDLE);
    }
    expect(sim.playerMarked).toBeGreaterThan(0);
    expect(sim.playerMarked).toBeLessThanOrEqual(sim.tuning.projectileTags.playerMarkDurationTicks);
    // Marked, the mark counts down and ends.
    for (let tick = 0; tick < sim.tuning.projectileTags.playerMarkDurationTicks + 5; tick++) {
      place(sim, sim.playerIndex, 300, 170);
      sim.step(IDLE);
    }
    expect(sim.playerMarked).toBe(0);
  });

  it('while marked, a shooter behind a wall still fires, and fires faster', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    // A wall between a Bauer-style shooter (the Sennerin, who aims) and the player.
    room.addBlock(150, 0, 160, 180);
    const unmarked = openSim(room);
    const marked = openSim(room);
    const countShots = (sim: GameSim, mark: boolean): number => {
      const shooter = spawn(sim, 'sennerin', 60, 90);
      if (mark) {
        sim.markPlayer(10_000);
      }
      let shots = 0;
      let seen = new Set<number>();
      for (let tick = 0; tick < 600; tick++) {
        // In range, behind the wall.
        place(sim, sim.playerIndex, 180, 90);
        place(sim, shooter, 60, 90);
        sim.step(IDLE);
        sim.projectiles.forEachLive((slot) => {
          const key = slot * 100_000 + (sim.projectiles.generation[slot] ?? 0);
          if (!seen.has(key)) {
            seen.add(key);
            shots += 1;
          }
        });
        if (seen.size > 10_000) {
          seen = new Set<number>();
        }
      }
      return shots;
    };
    expect(countShots(unmarked, false)).toBe(0);
    expect(countShots(marked, true)).toBeGreaterThan(0);
  });
});

describe('Sennerin (#40): the cheese wheel that comes back', () => {
  it('rolls a bouncing wheel', () => {
    const compiled = registry.get('sennerin');
    const roll = compiled.states.find((state) => state.name === 'roll');
    expect(roll?.firing[0]).toMatchObject({
      behaviour: 'fireAtPlayer',
      bounce: true,
      art: 'cheese-wheel',
    });
  });

  it('the wheel reflects off the wall behind the player instead of dying on it', () => {
    const sim = openSim();
    const maid = spawn(sim, 'sennerin', 60, 90);
    expect(stepUntil(sim, maid, 'roll', 400, [180, 90])).toBeGreaterThanOrEqual(0);
    sim.step(IDLE);
    let wheel = -1;
    sim.projectiles.forEachLive((slot) => {
      if (hasTag(sim.projectiles.tags[slot] ?? 0, ProjectileTag.Bouncing)) {
        wheel = slot;
      }
    });
    expect(wheel).toBeGreaterThanOrEqual(0);
    expect(sim.projectiles.bounceRemaining[wheel]).toBe(
      Math.round(sim.tuning.projectileTags.bounceMaxCount),
    );
    const generation = sim.projectiles.generation[wheel];
    let cameBack = false;
    for (let tick = 0; tick < 200; tick++) {
      // The player ducks out of its way; the wheel meets the east wall.
      place(sim, sim.playerIndex, 280, 20);
      sim.step(IDLE);
      if (sim.projectiles.generation[wheel] !== generation) {
        break;
      }
      if ((sim.projectiles.velocityX[wheel] ?? 0) < 0) {
        cameBack = true;
        break;
      }
    }
    expect(cameBack).toBe(true);
  });
});

describe('the shoal and burrow primitives are validated (#40)', () => {
  const body = (
    behaviours: readonly EnemyDefinition['states'][number]['behaviours'][number][],
  ) => ({
    id: 'probe',
    name: 'Probe',
    size: 'mini' as const,
    health: 1,
    contactDamage: 0,
    initial: 'go',
    states: [{ name: 'go', behaviours }],
  });

  it('rejects a shoal with a bad inertia or a non-positive speed', () => {
    expect(
      () =>
        new EnemyRegistry([
          body([{ behaviour: 'shoal', speed: 1, cohesion: 1, pull: 1, spacing: 4, inertia: 2 }]),
        ]),
    ).toThrow(/inertia/);
    expect(
      () =>
        new EnemyRegistry([
          body([{ behaviour: 'shoal', speed: 0, cohesion: 1, pull: 1, spacing: 4, inertia: 0.5 }]),
        ]),
    ).toThrow(/speed/);
  });

  it('accepts burrow as a state flag beside a movement', () => {
    expect(
      () => new EnemyRegistry([body([{ behaviour: 'pause' }, { behaviour: 'burrow' }])]),
    ).not.toThrow();
  });
});
