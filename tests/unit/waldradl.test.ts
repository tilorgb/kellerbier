import { describe, expect, it } from 'vitest';
import waldBoss from '../../src/content/rooms/wald-boss.json';
import { ENEMY_DEFINITIONS, waldradl } from '../../src/content/enemies/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition, FireRotatingRingBehaviour } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import {
  GAP_PLAYER_RADIUS,
  gapCorridorWidth,
  requiredCorridor,
  slotAngle,
  slotInGap,
} from '../../src/sim/enemy/rotating-ring.js';
import { GameSim, PLAYER_RADIUS } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { PROJECTILE_CAPACITY } from '../../src/sim/projectile/store.js';
import { ProjectileTag } from '../../src/sim/projectile/tags.js';
import { ENEMY_STRIDE, isEnemyInvulnerable } from '../../src/sim/systems/enemy.js';

/**
 * Das Waldradl (#413): one wheel, spinning at the arena centre, a ring of shots
 * with two slowly turning gaps. The whole fight is learnable only if the gaps
 * are always there, always wide enough and always the same — which is what this
 * file holds it to.
 */

const IDLE = createInputFrame();

const RING = (() => {
  const state = waldradl.states.find((s) => s.name === 'spin');
  const ring = state?.behaviours.find((b) => b.behaviour === 'fireRotatingRing');
  if (ring?.behaviour !== 'fireRotatingRing') {
    throw new Error('the Waldradl has no rotating ring');
  }
  return ring;
})();

function emptySim(seed = 5): GameSim {
  const sim = new GameSim({
    seed,
    roomTemplate: waldBoss,
    floor: 3,
    population: 'empty',
    enemies: ENEMY_DEFINITIONS,
  });
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
  for (let tick = 0; tick < 200 && sim.roomWarmupTicks > 0; tick++) {
    sim.step(IDLE);
  }
  return sim;
}

function spawn(sim: GameSim, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf('waldradl'), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  return (
    sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0]?.name ?? ''
  );
}

function setPlayer(sim: GameSim, x: number, y: number): void {
  const p = sim.playerIndex;
  for (const [offset, value] of [x, y, x, y].entries()) {
    sim.transform.data[p * 4 + offset] = value;
  }
  sim.velocity.data[p * 2] = 0;
  sim.velocity.data[p * 2 + 1] = 0;
}

/** Spawns the wheel in the middle and steps until its `spin` begins. */
function spinning(seed = 5): { sim: GameSim; wheel: number; centreX: number; centreY: number } {
  const sim = emptySim(seed);
  sim.health.data[sim.playerIndex * 2] = 1_000_000;
  sim.health.data[sim.playerIndex * 2 + 1] = 1_000_000;
  const centreX = (sim.room.minX + sim.room.maxX) / 2;
  const centreY = (sim.room.minY + sim.room.maxY) / 2;
  const wheel = spawn(sim, centreX + 40, centreY - 20);
  for (let tick = 0; tick < 400 && stateName(sim, wheel) !== 'spin'; tick++) {
    sim.step(IDLE);
  }
  expect(stateName(sim, wheel)).toBe('spin');
  return { sim, wheel, centreX, centreY };
}

describe('Das Waldradl (#413)', () => {
  it('is the bar boss at 40% of phase one, shooting plain damage', () => {
    expect(waldradl.bossBar).toBe(true);
    expect(RING.poison).toBeUndefined();
    expect(RING.damage).toBe(1);
    const phaseOne = ENEMY_DEFINITIONS.find((d) => d.id === 'waldradler');
    expect(waldradl.health / (phaseOne?.health ?? 1)).toBeGreaterThan(0.3);
    expect(waldradl.health / (phaseOne?.health ?? 1)).toBeLessThan(0.5);
  });

  it('rolls to the arena centre during an invulnerable intro, then spins there', () => {
    const sim = emptySim();
    sim.health.data[sim.playerIndex * 2] = 1_000_000;
    sim.health.data[sim.playerIndex * 2 + 1] = 1_000_000;
    const centreX = (sim.room.minX + sim.room.maxX) / 2;
    const centreY = (sim.room.minY + sim.room.maxY) / 2;
    const wheel = spawn(sim, centreX + 70, centreY + 30);
    expect(stateName(sim, wheel)).toBe('roll');
    for (let tick = 0; tick < 30; tick++) {
      sim.step(IDLE);
    }
    // Shots splash off while it rolls — and not once it spins.
    expect(isEnemyInvulnerable(sim, wheel)).toBe(true);
    for (let tick = 0; tick < 90 && stateName(sim, wheel) !== 'spin'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, wheel)).toBe('spin');
    sim.step(IDLE);
    expect(isEnemyInvulnerable(sim, wheel)).toBe(false);
    expect(sim.positionX(wheel)).toBeCloseTo(centreX, 0);
    expect(sim.positionY(wheel)).toBeCloseTo(centreY, 0);
  });

  describe('the pattern', () => {
    it('is a pure function of the volley number, with the gap the same size at every turn', () => {
      for (let volley = 0; volley < 120; volley++) {
        let open = 0;
        for (let slot = 0; slot < RING.shots; slot++) {
          if (!slotInGap(RING.shots, slot, RING.gaps)) {
            open += 1;
          }
        }
        expect(open).toBe(RING.shots - 6);
        expect(slotAngle(RING, 0, volley)).toBeCloseTo(RING.rotationPerVolley * volley, 9);
      }
    });

    it('is the same in every fight: no seed changes a single shot', () => {
      const shotsAfter = (seed: number): string[] => {
        const { sim } = spinning(seed);
        for (let tick = 0; tick < 90; tick++) {
          sim.step(IDLE);
        }
        const shots: string[] = [];
        sim.projectiles.forEachLive((slot) => {
          shots.push(
            `${(sim.projectiles.x[slot] ?? 0).toFixed(3)},${(sim.projectiles.y[slot] ?? 0).toFixed(3)}`,
          );
        });
        return shots.sort();
      };
      const first = shotsAfter(1);
      expect(first.length).toBeGreaterThan(50);
      expect(shotsAfter(77)).toEqual(first);
      expect(shotsAfter(90210)).toEqual(first);
    });

    it('fires plain shots only, never a poisoned one', () => {
      const { sim } = spinning();
      for (let tick = 0; tick < 100; tick++) {
        sim.step(IDLE);
      }
      let live = 0;
      sim.projectiles.forEachLive((slot) => {
        live += 1;
        expect((sim.projectiles.tags[slot] ?? 0) & ProjectileTag.Poison).toBe(0);
      });
      expect(live).toBeGreaterThan(0);
    });
  });

  describe('the gaps are always survivable', () => {
    /** Room units from `(x, y)` along `(dx, dy)` to the room's wall. */
    function edgeAlong(sim: GameSim, x: number, y: number, dx: number, dy: number): number {
      const room = sim.room;
      const reach = (limit: number, from: number, step: number): number =>
        step === 0 ? Infinity : (limit - from) / step;
      return Math.min(
        reach(dx > 0 ? room.maxX : room.minX, x, dx),
        reach(dy > 0 ? room.maxY : room.minY, y, dy),
      );
    }

    it.each([RING.minSafeDistance, 60, 90, 120])(
      'a player tracking a gap at %d units from the wheel is never hit, over a full rotation',
      (distance) => {
        const { sim, wheel, centreX, centreY } = spinning();
        const player = sim.playerIndex;
        // Real health this time: any hit shows.
        sim.health.data[player * 2] = 100;
        sim.health.data[player * 2 + 1] = 100;
        const turn = (2 * Math.PI) / RING.rotationPerVolley;
        const ticks = Math.ceil(turn * RING.everyTicks) + 200;
        let checked = 0;
        for (let tick = 0; tick < ticks; tick++) {
          for (const half of [0, Math.PI]) {
            const angle = half + (RING.rotationPerVolley * tick) / RING.everyTicks;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            const room = edgeAlong(sim, centreX, centreY, dx, dy) - GAP_PLAYER_RADIUS - 2;
            const d = Math.min(distance, room);
            if (d < RING.minSafeDistance) {
              continue;
            }
            // Two gaps: stand in whichever the walls leave room for — the first
            // that fits, and only that one is moved to this tick.
            setPlayer(sim, centreX + dx * d, centreY + dy * d);
            checked += 1;
            break;
          }
          sim.step(IDLE);
          expect(sim.health.data[player * 2], `hit at tick ${String(tick)}`).toBe(100);
        }
        expect(checked).toBeGreaterThan(ticks * 0.7);
        expect(sim.world.states[wheel]).toBeDefined();
      },
    );

    it('keeps the line from the gap to the wheel open', () => {
      const { sim, centreX, centreY } = spinning();
      const hitRadius = GAP_PLAYER_RADIUS - 2 + 3;
      const turn = (2 * Math.PI) / RING.rotationPerVolley;
      const ticks = Math.ceil(turn * RING.everyTicks);
      for (let tick = 0; tick < ticks; tick++) {
        const angle = (RING.rotationPerVolley * tick) / RING.everyTicks;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const length = Math.min(100, edgeAlong(sim, centreX, centreY, dx, dy) - 8);
        sim.step(IDLE);
        sim.projectiles.forEachLive((slot) => {
          const px = (sim.projectiles.x[slot] ?? 0) - centreX;
          const py = (sim.projectiles.y[slot] ?? 0) - centreY;
          const along = px * dx + py * dy;
          if (along < RING.minSafeDistance || along > length) {
            return;
          }
          // Perpendicular distance from the shot to the line of fire.
          const across = Math.abs(px * dy - py * dx);
          expect(across, `a shot blocks the line at tick ${String(tick)}`).toBeGreaterThan(
            hitRadius,
          );
        });
      }
    });

    it('peaks well inside the projectile pool', () => {
      const { sim } = spinning();
      let peak = 0;
      for (let tick = 0; tick < 1800; tick++) {
        sim.step(IDLE);
        peak = Math.max(peak, sim.projectiles.liveCount);
      }
      // The measured number goes in the pull request; the bar here is that a
      // screen-filling ring is a fraction of the pool, not the whole of it.
      expect(peak).toBeGreaterThan(80);
      expect(peak).toBeLessThan(PROJECTILE_CAPACITY / 4);
    });
  });

  describe('content validation', () => {
    const base = (ring: Partial<FireRotatingRingBehaviour>): EnemyDefinition => ({
      ...waldradl,
      states: [
        {
          name: 'spin',
          behaviours: [{ behaviour: 'pause' }, { ...RING, ...ring }],
        },
      ],
      initial: 'spin',
    });
    const build = (ring: Partial<FireRotatingRingBehaviour>) => (): EnemyRegistry =>
      new EnemyRegistry([base(ring)]);

    it('accepts the shipped pattern', () => {
      expect(build({})).not.toThrow();
    });

    it('rejects a gap narrower than the player at minSafeDistance', () => {
      expect(build({ gaps: [{ at: 0, width: 1 }] })).toThrow(/narrower than/i);
      expect(build({ minSafeDistance: 8 })).toThrow(/narrower than/i);
    });

    it('accepts the same narrow gap once it is wide enough where it matters', () => {
      expect(build({ gaps: [{ at: 0, width: 1 }], minSafeDistance: 80 })).not.toThrow();
    });

    it('rejects a pattern with no gap, no shots, or no turn', () => {
      expect(build({ gaps: [] })).toThrow(/at least one gap/i);
      expect(build({ shots: 2 })).toThrow(/at least 3 shots/i);
      expect(build({ rotationPerVolley: Number.NaN })).toThrow(/rotationPerVolley/i);
      expect(build({ minSafeDistance: 0 })).toThrow(/minSafeDistance/i);
    });

    it('rejects gaps that leave no shot at all', () => {
      expect(
        build({
          shots: 6,
          gaps: [
            { at: 0, width: 3 },
            { at: Math.PI, width: 3 },
          ],
          minSafeDistance: 200,
        }),
      ).toThrow(/no shot at all/i);
    });

    it('measures the corridor between the shots either side of the gap', () => {
      // Three skipped slots of 28: four slot steps between the flanking shots.
      const step = (Math.PI * 2) / 28;
      expect(gapCorridorWidth(28, 3, 36)).toBeCloseTo(2 * 36 * Math.sin(2 * step), 9);
      expect(gapCorridorWidth(28, 3, 36)).toBeGreaterThan(requiredCorridor(3));
    });

    it('holds its copy of the player radius to the real one', () => {
      expect(GAP_PLAYER_RADIUS).toBe(PLAYER_RADIUS);
    });
  });
});
