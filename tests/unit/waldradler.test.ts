import { describe, expect, it, vi } from 'vitest';
import waldBoss from '../../src/content/rooms/wald-boss.json';
import { ENEMY_WINDUP_SFX, SFX_DEFINITIONS } from '../../src/content/audio/sfx.js';
import { ENEMY_DEFINITIONS, waldradler } from '../../src/content/enemies/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import type { EnemyDefinition, EnemyState } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { ProjectileTag } from '../../src/sim/projectile/tags.js';
import {
  ENEMY_MOTION_STRIDE,
  ENEMY_STRIDE,
  type EnemyRampLineInfo,
  enemyHidden,
  enemyRampLine,
  type LobbedVolleyFlight,
  lobbedVolleyCount,
  lobbedVolleyFlight,
  stepEnemyDeaths,
} from '../../src/sim/systems/enemy.js';

/**
 * Der Waldradler (#412): a trail biker who never follows the player, with two
 * attacks — the ramp charge and the wrapper volley — and a Maß that drops when
 * he splits into the Waldradl.
 */

const IDLE = createInputFrame();

function emptySim(seed = 5, definitions: readonly EnemyDefinition[] = ENEMY_DEFINITIONS): GameSim {
  const sim = new GameSim({
    seed,
    roomTemplate: waldBoss,
    floor: 3,
    population: 'empty',
    enemies: definitions,
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
  // The room's warm-up window: enemies are inert until it runs out.
  for (let tick = 0; tick < 200 && sim.roomWarmupTicks > 0; tick++) {
    sim.step(IDLE);
  }
  return sim;
}

function spawn(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function placeBody(sim: GameSim, index: number, x: number, y: number): void {
  const t = sim.transform.data;
  t[index * 4] = x;
  t[index * 4 + 1] = y;
  t[index * 4 + 2] = x;
  t[index * 4 + 3] = y;
}

function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  return (
    sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0]?.name ?? ''
  );
}

/** The Waldradler, with his `ride` state going straight to `attack` after a tick — so a test can ask for one attack. */
function forcing(attack: 'rampTelegraph' | 'aim'): readonly EnemyDefinition[] {
  const states: EnemyState[] = waldradler.states.map((state) =>
    state.name === 'ride' ? { ...state, transitions: [{ to: attack, after: 2 }] } : state,
  );
  return ENEMY_DEFINITIONS.map((definition) =>
    definition.id === 'waldradler' ? { ...waldradler, states } : definition,
  );
}

/** Steps until the body is in `state`, or `limit` ticks pass; returns whether it got there. */
function stepUntil(sim: GameSim, index: number, state: string, limit = 400): boolean {
  for (let tick = 0; tick < limit; tick++) {
    if (stateName(sim, index) === state) {
      return true;
    }
    sim.step(IDLE);
  }
  return false;
}

function hardenPlayer(sim: GameSim): void {
  sim.health.data[sim.playerIndex * 2] = 1_000_000;
  sim.health.data[sim.playerIndex * 2 + 1] = 1_000_000;
}

describe('Der Waldradler (#412)', () => {
  it('is a boss on the bar that splits into the Waldradl and drops a Maß in every state', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    const compiled = registry.get('waldradler');
    expect(compiled.bossBar).toBe(true);
    expect(compiled.size).toBe(registry.get('waldradler').size);
    for (const state of compiled.states) {
      expect(
        state.splits.some((split) => split.definition === registry.indexOf('waldradl')),
        `"${state.name}" is missing the phase-two split`,
      ).toBe(true);
      expect(state.deathPickups, `"${state.name}" is missing the Maß`).toEqual(['mass-full']);
    }
    expect(registry.get('waldradl').bossBar).toBe(true);
  });

  it('rings a bell of its own as the charge winds up', () => {
    expect(ENEMY_WINDUP_SFX.waldradler).toBe('windup-waldradler-bell');
    expect(SFX_DEFINITIONS.some((sfx) => sfx.id === 'windup-waldradler-bell')).toBe(true);
  });

  it('stands on the Floor 3 boss room, and nowhere else', () => {
    const choices = waldBoss.spawnGroups.flatMap((group) => group.choices);
    expect(choices.map((choice) => choice.enemyId)).toEqual(['waldradler']);
    expect(choices[0]?.minFloor).toBe(3);
  });

  describe('riding', () => {
    // A boss that only rides: the same state, no attacks.
    const rideOnly = ENEMY_DEFINITIONS.map((definition) =>
      definition.id === 'waldradler'
        ? {
            ...waldradler,
            states: waldradler.states.map((state) =>
              state.name === 'ride' ? { ...state, transitions: [] } : state,
            ),
          }
        : definition,
    );

    it('never steers toward the player, and stays inside the room', () => {
      const sim = emptySim(11, rideOnly);
      hardenPlayer(sim);
      const player = sim.playerIndex;
      const boss = spawn(sim, 'waldradler', sim.positionX(player) + 70, sim.positionY(player));
      const room = sim.room;
      let alignment = 0;
      let samples = 0;
      for (let tick = 0; tick < 4000; tick++) {
        sim.step(IDLE);
        const vx = sim.velocity.data[boss * 2] ?? 0;
        const vy = sim.velocity.data[boss * 2 + 1] ?? 0;
        const speed = Math.hypot(vx, vy);
        const toX = sim.positionX(player) - sim.positionX(boss);
        const toY = sim.positionY(player) - sim.positionY(boss);
        const to = Math.hypot(toX, toY);
        if (speed > 0 && to > 0) {
          alignment += (vx * toX + vy * toY) / (speed * to);
          samples += 1;
        }
        expect(sim.positionX(boss)).toBeGreaterThan(room.minX);
        expect(sim.positionX(boss)).toBeLessThan(room.maxX);
        expect(sim.positionY(boss)).toBeGreaterThan(room.minY);
        expect(sim.positionY(boss)).toBeLessThan(room.maxY);
      }
      expect(samples).toBeGreaterThan(3000);
      // A homing body would average close to 1; a blind one is near 0.
      expect(Math.abs(alignment / samples)).toBeLessThan(0.2);
    });

    it('is fast and erratic: it turns, and it bounces off the walls', () => {
      const sim = emptySim(12, rideOnly);
      hardenPlayer(sim);
      const boss = spawn(sim, 'waldradler', 160, 90);
      const headings = new Set<string>();
      let bounces = 0;
      let previousX = 0;
      for (let tick = 0; tick < 3000; tick++) {
        sim.step(IDLE);
        const vx = sim.velocity.data[boss * 2] ?? 0;
        const vy = sim.velocity.data[boss * 2 + 1] ?? 0;
        headings.add(`${vx.toFixed(2)},${vy.toFixed(2)}`);
        if (Math.sign(vx) !== Math.sign(previousX) && Math.abs(previousX) > 0.5) {
          bounces += 1;
        }
        previousX = vx;
      }
      expect(headings.size).toBeGreaterThan(20);
      expect(bounces).toBeGreaterThan(2);
    });
  });

  describe('the ramp charge', () => {
    const info: EnemyRampLineInfo = { startX: 0, startY: 0, farX: 0, farY: 0, rise: 0 };

    it('captures a line through the player, horizontal or vertical about half each', () => {
      let horizontal = 0;
      const seeds = 80;
      for (let seed = 1; seed <= seeds; seed++) {
        const sim = emptySim(seed, forcing('rampTelegraph'));
        hardenPlayer(sim);
        const player = sim.playerIndex;
        const boss = spawn(sim, 'waldradler', 160, 90);
        expect(stepUntil(sim, boss, 'rampTelegraph', 20)).toBe(true);
        sim.step(IDLE);
        expect(enemyRampLine(sim, boss, info)).toBe(true);
        const radius = sim.body.data[boss * 2] ?? 0;
        const isHorizontal = Math.abs(info.startY - info.farY) < 0.001;
        const isVertical = Math.abs(info.startX - info.farX) < 0.001;
        expect(isHorizontal !== isVertical).toBe(true);
        if (isHorizontal) {
          horizontal += 1;
          // Through the player — to within the body's own width, which is all
          // a wall can take off a player standing right up against it.
          expect(Math.abs(info.startY - sim.positionY(player))).toBeLessThanOrEqual(radius);
        } else {
          expect(Math.abs(info.startX - sim.positionX(player))).toBeLessThanOrEqual(radius);
        }
      }
      expect(horizontal).toBeGreaterThan(seeds * 0.3);
      expect(horizontal).toBeLessThan(seeds * 0.7);
    });

    it('raises the ramps over the telegraph and keeps them up through both passes', () => {
      const sim = emptySim(3, forcing('rampTelegraph'));
      hardenPlayer(sim);
      const boss = spawn(sim, 'waldradler', 160, 90);
      expect(stepUntil(sim, boss, 'rampTelegraph', 20)).toBe(true);
      // The dodge the ramps are there for: off the line, into a corner.
      placeBody(sim, sim.playerIndex, 64, 30);
      let lastRise = -1;
      for (const state of ['rampTelegraph', 'toStart', 'pass1', 'offstage', 'pass2']) {
        expect(stepUntil(sim, boss, state, 400), `never reached ${state}`).toBe(true);
        sim.step(IDLE);
        expect(enemyRampLine(sim, boss, info), `no ramps in ${state}`).toBe(true);
        if (state === 'rampTelegraph') {
          expect(info.rise).toBeLessThan(0.2);
        } else {
          expect(info.rise).toBe(1);
        }
        lastRise = info.rise;
      }
      expect(lastRise).toBe(1);
      expect(stepUntil(sim, boss, 'ride', 400)).toBe(true);
      sim.step(IDLE);
      expect(enemyRampLine(sim, boss, info)).toBe(false);
    });

    it('rides the line out and back along the same line, off the arena in between', () => {
      const sim = emptySim(8, forcing('rampTelegraph'));
      hardenPlayer(sim);
      const boss = spawn(sim, 'waldradler', 160, 90);
      expect(stepUntil(sim, boss, 'rampTelegraph', 20)).toBe(true);
      sim.step(IDLE);
      enemyRampLine(sim, boss, info);
      const { startX, startY, farX, farY } = info;
      // Dodged: a player stood on the line would shove the charge.
      placeBody(sim, sim.playerIndex, 64, 30);
      const along = Math.abs(farX - startX) > Math.abs(farY - startY) ? 0 : 1;
      const coordinate = (index: number): number =>
        along === 0 ? sim.positionY(index) : sim.positionX(index);
      const position = (index: number): number =>
        along === 0 ? sim.positionX(index) : sim.positionY(index);
      const lineAt = along === 0 ? startY : startX;
      const sign = Math.sign((along === 0 ? farX - startX : farY - startY) || 1);

      expect(stepUntil(sim, boss, 'pass1', 400)).toBe(true);
      sim.step(IDLE);
      let previous = position(boss);
      let passOneTicks = 0;
      while (stateName(sim, boss) === 'pass1' && passOneTicks < 400) {
        sim.step(IDLE);
        if (stateName(sim, boss) !== 'pass1') {
          break;
        }
        expect(Math.abs(coordinate(boss) - lineAt)).toBeLessThan(1);
        expect((position(boss) - previous) * sign).toBeGreaterThanOrEqual(-0.001);
        previous = position(boss);
        passOneTicks += 1;
      }
      expect(stateName(sim, boss)).toBe('offstage');

      // Off the arena: nothing can touch him and nothing draws him.
      sim.step(IDLE);
      expect(enemyHidden(sim, boss)).toBe(true);
      expect(sim.collision.data[boss * 2]).toBe(0);
      const healthBefore = sim.health.data[boss * 2] ?? 0;
      sim.applySplashDamage(sim.positionX(boss), sim.positionY(boss), 40, 10, -1);
      expect(sim.health.data[boss * 2]).toBe(healthBefore);

      expect(stepUntil(sim, boss, 'pass2', 100)).toBe(true);
      sim.step(IDLE);
      expect(enemyHidden(sim, boss)).toBe(false);
      expect(sim.collision.data[boss * 2]).not.toBe(0);
      previous = position(boss);
      let passTwoTicks = 0;
      while (stateName(sim, boss) === 'pass2' && passTwoTicks < 400) {
        sim.step(IDLE);
        // The step that leaves `pass2` already rides on, in its own heading.
        if (stateName(sim, boss) !== 'pass2') {
          break;
        }
        expect(Math.abs(coordinate(boss) - lineAt)).toBeLessThan(1);
        // The other way.
        expect((position(boss) - previous) * sign).toBeLessThanOrEqual(0.001);
        previous = position(boss);
        passTwoTicks += 1;
      }
      expect(stateName(sim, boss)).toBe('ride');
      expect(sim.world.states[boss]).toBe(World.ALIVE);
    });
  });

  describe('the wrapper volley', () => {
    const flight: LobbedVolleyFlight = {
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      progress: 0,
      radius: 0,
    };

    it('lands two or three wrappers around the player, never on them, inside the room', () => {
      const counts = new Set<number>();
      for (let seed = 1; seed <= 60; seed++) {
        const sim = emptySim(seed, forcing('aim'));
        hardenPlayer(sim);
        const player = sim.playerIndex;
        // From the middle of the room to right up against each wall in turn.
        const spots = [
          [160, 90],
          [60, 36],
          [262, 144],
        ] as const;
        const [px, py] = spots[seed % spots.length] ?? spots[0];
        placeBody(sim, player, px, py);
        const boss = spawn(sim, 'waldradler', 160, 90);
        expect(stepUntil(sim, boss, 'aim', 20)).toBe(true);
        sim.step(IDLE);
        sim.step(IDLE);
        const count = lobbedVolleyCount(sim, boss);
        counts.add(count);
        expect(count).toBeGreaterThanOrEqual(2);
        expect(count).toBeLessThanOrEqual(3);
        for (let point = 0; point < count; point++) {
          lobbedVolleyFlight(sim, boss, point, flight);
          expect(flight.radius).toBe(28);
          expect(sim.room.isClear(flight.endX, flight.endY, 4), `seed ${String(seed)}`).toBe(true);
          const away = Math.hypot(
            flight.endX - sim.positionX(player),
            flight.endY - sim.positionY(player),
          );
          expect(away, `seed ${String(seed)} point ${String(point)}`).toBeGreaterThan(20);
        }
      }
      expect(counts).toEqual(new Set([2, 3]));
    });

    it('bursts each wrapper into a poison cloud and a ring of poisoned shots — and opens no secret wall', () => {
      const sim = emptySim(4, forcing('aim'));
      hardenPlayer(sim);
      const explode = vi.spyOn(sim, 'triggerExplosion');
      const boss = spawn(sim, 'waldradler', 160, 90);
      expect(stepUntil(sim, boss, 'aim', 20)).toBe(true);
      sim.step(IDLE);
      const wrappers = lobbedVolleyCount(sim, boss);
      expect(wrappers).toBeGreaterThanOrEqual(2);
      expect(sim.clouds.count).toBe(0);
      expect(stepUntil(sim, boss, 'land', 200)).toBe(true);
      // The burst happens on entry; look at what it left.
      sim.step(IDLE);
      expect(sim.clouds.count).toBe(wrappers);
      let poisoned = 0;
      sim.projectiles.forEachLive((slot) => {
        if (((sim.projectiles.tags[slot] ?? 0) & ProjectileTag.Poison) !== 0) {
          poisoned += 1;
        }
      });
      expect(poisoned).toBe(wrappers * 6);
      expect(explode).not.toHaveBeenCalled();
    });
  });

  describe('choosing', () => {
    it('picks both attacks and never the same one three times in a row', () => {
      const sim = emptySim(21);
      hardenPlayer(sim);
      const boss = spawn(sim, 'waldradler', 160, 90);
      sim.health.data[boss * 2] = 1_000_000;
      sim.health.data[boss * 2 + 1] = 1_000_000;
      const picks: string[] = [];
      let previous = stateName(sim, boss);
      for (let tick = 0; tick < 40_000 && picks.length < 60; tick++) {
        sim.step(IDLE);
        const now = stateName(sim, boss);
        if (now !== previous && (now === 'rampTelegraph' || now === 'aim')) {
          picks.push(now);
        }
        previous = now;
      }
      expect(picks.length).toBe(60);
      expect(new Set(picks)).toEqual(new Set(['rampTelegraph', 'aim']));
      for (let i = 2; i < picks.length; i++) {
        expect(picks[i] === picks[i - 1] && picks[i] === picks[i - 2]).toBe(false);
      }
    });
  });

  describe('the transition', () => {
    it('splits into the Waldradl and drops exactly one Maß, in any state', () => {
      for (const attack of ['ride', 'rampTelegraph', 'offstage', 'aim'] as const) {
        const sim = emptySim(6, ENEMY_DEFINITIONS);
        hardenPlayer(sim);
        const boss = spawn(sim, 'waldradler', 160, 90);
        // Put him in the state under test directly: it is the death that is asked about.
        const compiled = sim.enemies.get('waldradler');
        const stateIndex = compiled.states.findIndex((state) => state.name === attack);
        sim.enemy.data[boss * ENEMY_STRIDE + 1] = stateIndex;
        const before = massPickups(sim);
        sim.forceEnemyDeath(boss);
        // The death event is read by `stepEnemyDeaths` within the step it was
        // raised in; there is no step around this call, so run it by hand.
        stepEnemyDeaths(sim);
        sim.world.flush();
        expect(massPickups(sim) - before, attack).toBe(1);
        let wheels = 0;
        sim.world.forEach(sim.enemyMask, (index) => {
          if (sim.enemies.at(sim.enemy.data[index * ENEMY_STRIDE] ?? 0).id === 'waldradl') {
            wheels += 1;
          }
        });
        expect(wheels, attack).toBe(1);
      }
    });
  });

  it('keeps its per-body storage inside the motion row', () => {
    expect(ENEMY_MOTION_STRIDE).toBeGreaterThan(0);
  });
});

function massPickups(sim: GameSim): number {
  let count = 0;
  const kind = sim.pickups.indexOf('mass-full');
  sim.world.forEach(sim.pickupKind.bit, (index) => {
    if ((sim.pickupKind.data[index] ?? -1) === kind) {
      count += 1;
    }
  });
  return count;
}
