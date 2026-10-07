import { describe, expect, it } from 'vitest';
import { type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, RingGeometry } from 'three';
import { ENEMY_DEFINITIONS, fliegenpilz } from '../../src/content/enemies/index.js';
import { EntityView } from '../../src/render/entities.js';
import { ENTITY_PALETTE } from '../../src/render/palette.js';
import { BitmapText, Container, Texture } from '../../src/render/gfx/index.js';
import { installPixelFonts, UI_FONT_FAMILY } from '../../src/render/ui/font.js';
import { UI_TEXT_HEIGHT } from '../../src/render/ui/text.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * Fliegenpilz (#405): a static fly agaric that bloats, greens and deflates in
 * a poison cloud while the player is near — and goes quiet once they back off.
 * The cloud itself (grow, linger, poison only the player) is #401's and is
 * covered in `player-poison.test.ts`; this is the rhythm around it, and the
 * render-side `telegraphLook: 'bloat'` that makes the rhythm readable.
 */

const IDLE = createInputFrame();
const RANGE = 64;

installPixelFonts();

function bareSim(): GameSim {
  const sim = new GameSim({ room: new RoomGeometry(0, 0, 320, 180) });
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

function placeFliegenpilz(sim: GameSim, dx: number): number {
  const player = sim.playerIndex;
  const entity = sim.spawnEnemyKind(
    sim.enemies.indexOf('fliegenpilz'),
    sim.positionX(player) + dx,
    sim.positionY(player),
  );
  sim.world.flush();
  return entityIndex(entity);
}

function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  return compiled.states[sim.enemy.data[base + 1] ?? 0]?.name ?? '';
}

function stepUntil(sim: GameSim, index: number, state: string, limit: number): number {
  for (let tick = 0; tick < limit; tick++) {
    if (stateName(sim, index) === state) {
      return tick;
    }
    sim.step(IDLE);
  }
  return stateName(sim, index) === state ? limit : -1;
}

/** Moves the player outright, both current and previous position, so no movement is interpolated. */
function teleportPlayer(sim: GameSim, x: number): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = x;
  sim.transform.data[base + 2] = x;
}

describe('Fliegenpilz (#405)', () => {
  it('compiles with the bloat look and a spore death', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    const compiled = registry.get('fliegenpilz');
    expect(compiled.telegraphBloat).toBe(true);
    expect(compiled.mass).toBe(12);
    expect(compiled.locksRoom).toBe(true);
    expect(fliegenpilz.deathEffect).toBe('spore');
    const burst = compiled.states.find((state) => state.name === 'burst');
    expect(burst?.emitCloud).toEqual({ radius: 28, growTicks: 12, lifetimeTicks: 90 });
  });

  it('sits idle while the player is out of range', () => {
    const sim = bareSim();
    const enemy = placeFliegenpilz(sim, RANGE + 40);
    for (let tick = 0; tick < 200; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('idle');
    expect(sim.clouds.count).toBe(0);
  });

  it('bloats, bursts one cloud on itself, cools down, and goes again while the player stays near', () => {
    const sim = bareSim();
    const enemy = placeFliegenpilz(sim, 60);
    const x = sim.positionX(enemy);
    const y = sim.positionY(enemy);

    expect(stepUntil(sim, enemy, 'bloat', 5)).toBeGreaterThanOrEqual(0);
    expect(sim.clouds.count).toBe(0);
    // The whole wind-up passes before anything comes out.
    expect(stepUntil(sim, enemy, 'cooldown', 60)).toBeGreaterThanOrEqual(44);
    expect(sim.clouds.count).toBe(1);
    const cloud = sim.clouds.oldest;
    expect(sim.clouds.radius[cloud]).toBe(28);
    expect(sim.clouds.lifetimeTicks[cloud]).toBe(90);

    // Long enough a gap to step in and shoot it, then it winds up again.
    const gap = stepUntil(sim, enemy, 'bloat', 200);
    expect(gap).toBeGreaterThanOrEqual(115);
    expect(stepUntil(sim, enemy, 'cooldown', 60)).toBeGreaterThan(0);

    // Static: never moved an inch through all of it.
    expect(sim.positionX(enemy)).toBeCloseTo(x, 5);
    expect(sim.positionY(enemy)).toBeCloseTo(y, 5);
  });

  it('goes back to idle, without another burst, once the player backs off during the cooldown', () => {
    const sim = bareSim();
    const enemy = placeFliegenpilz(sim, 60);
    expect(stepUntil(sim, enemy, 'cooldown', 80)).toBeGreaterThan(0);
    teleportPlayer(sim, sim.positionX(enemy) - RANGE - 60);
    sim.step(IDLE);
    expect(stateName(sim, enemy)).toBe('idle');
    for (let tick = 0; tick < 300; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('idle');
  });
});

describe("telegraphLook: 'bloat' (#405)", () => {
  const walker: EnemyDefinition = {
    id: 'walker',
    name: 'Walker',
    size: 'normal',
    health: 2,
    contactDamage: 1,
    initial: 'go',
    states: [{ name: 'go', behaviours: [{ behaviour: 'walkTowardPlayer', speed: 1 }] }],
  };

  it('defaults to no look', () => {
    expect(new EnemyRegistry([walker]).get('walker').telegraphBloat).toBe(false);
  });

  it('rejects a look that does not exist, rather than quietly drawing none', () => {
    const typo = { ...walker, telegraphLook: 'blaot' } as unknown as EnemyDefinition;
    expect(() => new EnemyRegistry([typo])).toThrow(/telegraphLook "blaot"/);
  });

  function harness(sim: GameSim): EntityView {
    return new EntityView(
      sim,
      {
        fallback: Texture.EMPTY,
        enemyArt: {},
        enemyAnimation: {},
        pickupArt: {},
        bossIds: new Set(),
      },
      new Container(),
      () =>
        new BitmapText({
          text: '',
          style: { fontFamily: UI_FONT_FAMILY, fontSize: UI_TEXT_HEIGHT },
        }),
    );
  }

  const project = (x: number, _h: number, z: number, out: { x: number; y: number }): void => {
    out.x = x;
    out.y = z;
  };

  /** The one enemy billboard — every other mesh in this harness is a flat floor shape. */
  function body(view: EntityView): Mesh {
    const mesh = view.group.children.find(
      (child) => child.visible && !((child as Mesh).geometry instanceof RingGeometry),
    );
    if (mesh === undefined) {
      throw new Error('no body drawn');
    }
    return mesh as Mesh;
  }

  function ring(view: EntityView): Mesh | undefined {
    return view.group.children.find(
      (child) => child.visible && (child as Mesh).geometry instanceof RingGeometry,
    ) as Mesh | undefined;
  }

  it("swells the body over the wind-up, greens it in the last third, and marks the cloud's edge in faint green", () => {
    const sim = bareSim();
    const enemy = placeFliegenpilz(sim, 60);
    const view = harness(sim);
    view.sync(1, 0, project);
    const restWidth = body(view).scale.x;
    const restRadius = sim.enemies.get('fliegenpilz').radius;

    expect(stepUntil(sim, enemy, 'bloat', 5)).toBeGreaterThanOrEqual(0);
    sim.step(IDLE);
    view.sync(1, 0, project);
    const early = body(view);
    const earlyEmissive = (early.material as MeshStandardMaterial).emissive.getHex();
    expect(earlyEmissive).toBe(0);

    for (let tick = 0; tick < 42; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('bloat');
    view.sync(1, 0, project);
    const late = body(view);
    expect(late.scale.x).toBeGreaterThan(restWidth * 1.3);
    const glow = (late.material as MeshStandardMaterial).emissive;
    // Green dominant, on the emissive channel a dark room cannot swallow.
    expect(glow.g).toBeGreaterThan(glow.r);
    expect(glow.g).toBeGreaterThan(glow.b);
    expect(glow.g).toBeGreaterThan(0.3);
    // One marking, at the cloud's true 28 — not the red attack ring, which
    // would stop at the body's own radius times 2.6.
    const drawn = ring(view);
    expect(drawn?.scale.x).toBe(28);
    expect(drawn?.scale.x ?? 0).toBeGreaterThan(restRadius * 2.6);
    const edge = drawn?.material as MeshBasicMaterial | undefined;
    expect(edge?.color.getHex()).toBe(ENTITY_PALETTE.cloudEdgeTelegraph);
    expect(edge?.opacity ?? 1).toBeLessThan(0.6);
    expect(
      view.group.children.filter((c) => c.visible && (c as Mesh).geometry instanceof RingGeometry),
    ).toHaveLength(1);

    // The deflate: the telegraph ends and the body snaps back to rest size.
    expect(stepUntil(sim, enemy, 'cooldown', 10)).toBeGreaterThanOrEqual(0);
    view.sync(1, 0, project);
    expect(body(view).scale.x).toBeCloseTo(restWidth, 5);
    expect((body(view).material as MeshStandardMaterial).emissive.getHex()).toBe(0);
  });
});
