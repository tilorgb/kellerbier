import { describe, expect, it } from 'vitest';
import { type Mesh, type MeshStandardMaterial, PlaneGeometry } from 'three';
import { EntityView } from '../../src/render/entities.js';
import { BitmapText, Container, Texture } from '../../src/render/gfx/index.js';
import { installPixelFonts, UI_FONT_FAMILY } from '../../src/render/ui/font.js';
import { UI_TEXT_HEIGHT } from '../../src/render/ui/text.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * #429: an ordinary enemy's telegraph is its own body — a crouch that loads
 * over the wind-up and a warm emissive glow — rather than a red ring on the
 * floor. These read what `EntityView.sync` does to the enemy's billboard.
 */

const IDLE = createInputFrame();

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

function place(sim: GameSim, id: string, dx: number): number {
  const player = sim.playerIndex;
  const entity = sim.spawnEnemyKind(
    sim.enemies.indexOf(id),
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
      new BitmapText({ text: '', style: { fontFamily: UI_FONT_FAMILY, fontSize: UI_TEXT_HEIGHT } }),
  );
}

const project = (x: number, _h: number, z: number, out: { x: number; y: number }): void => {
  out.x = x;
  out.y = z;
};

/** The enemy's billboard — the one visible plane in the view. */
function body(view: EntityView): Mesh {
  const mesh = view.group.children.find(
    (child) => child.visible && (child as Mesh).geometry instanceof PlaneGeometry,
  );
  if (mesh === undefined) {
    throw new Error('no body drawn');
  }
  return mesh as Mesh;
}

function emissive(mesh: Mesh): MeshStandardMaterial['emissive'] {
  return (mesh.material as MeshStandardMaterial).emissive;
}

describe('an ordinary enemy winds up on its body (#429)', () => {
  it('crouches wider and lower and glows warm over the wind-up, then snaps back', () => {
    const sim = bareSim();
    const enemy = place(sim, 'zapfhahn', 60);
    const view = harness(sim);
    view.sync(1, 0, project);
    const rest = { x: body(view).scale.x, y: body(view).scale.y };
    expect(emissive(body(view)).getHex()).toBe(0);

    for (let tick = 0; tick < 30 && stateName(sim, enemy) !== 'wind'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('wind');
    // Most of the way through Zapfhahn's 30-tick wind-up.
    for (let tick = 0; tick < 26; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('wind');
    view.sync(1, 0, project);
    const loaded = body(view);
    expect(loaded.scale.x).toBeGreaterThan(rest.x * 1.08);
    expect(loaded.scale.y).toBeLessThan(rest.y * 0.9);
    const glow = emissive(loaded);
    // Warm: red dominant, on the emissive channel a dark room cannot swallow.
    expect(glow.r).toBeGreaterThan(0.4);
    expect(glow.r).toBeGreaterThan(glow.g);
    expect(glow.r).toBeGreaterThan(glow.b);

    for (let tick = 0; tick < 10 && stateName(sim, enemy) === 'wind'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('spray');
    view.sync(1, 0, project);
    expect(body(view).scale.x).toBeCloseTo(rest.x, 5);
    expect(body(view).scale.y).toBeCloseTo(rest.y, 5);
    expect(emissive(body(view)).getHex()).toBe(0);
  });

  it('builds gradually rather than popping on', () => {
    const sim = bareSim();
    const enemy = place(sim, 'kuh', 40);
    const view = harness(sim);
    view.sync(1, 0, project);
    const restY = body(view).scale.y;
    for (let tick = 0; tick < 30 && stateName(sim, enemy) !== 'telegraph'; tick++) {
      sim.step(IDLE);
    }
    sim.step(IDLE);
    view.sync(1, 0, project);
    const early = { y: body(view).scale.y, r: emissive(body(view)).r };
    for (let tick = 0; tick < 15; tick++) {
      sim.step(IDLE);
    }
    view.sync(1, 0, project);
    const late = { y: body(view).scale.y, r: emissive(body(view)).r };
    expect(early.y).toBeGreaterThan(late.y);
    expect(early.y).toBeGreaterThan(restY * 0.97);
    expect(late.r).toBeGreaterThan(early.r);
  });

  it('leaves the Fliegenpilz to its own bloat, not the crouch', () => {
    const sim = bareSim();
    const enemy = place(sim, 'fliegenpilz', 60);
    const view = harness(sim);
    view.sync(1, 0, project);
    const rest = { x: body(view).scale.x, y: body(view).scale.y };
    for (let tick = 0; tick < 40 && stateName(sim, enemy) !== 'bloat'; tick++) {
      sim.step(IDLE);
    }
    for (let tick = 0; tick < 40; tick++) {
      sim.step(IDLE);
    }
    view.sync(1, 0, project);
    // Uniform swell: width and height grow by the same factor.
    const loaded = body(view);
    expect(loaded.scale.x / rest.x).toBeCloseTo(loaded.scale.y / rest.y, 5);
    expect(loaded.scale.x).toBeGreaterThan(rest.x);
  });
});
