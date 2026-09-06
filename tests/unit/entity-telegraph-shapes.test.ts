import { describe, expect, it } from 'vitest';
import { type BufferGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry } from 'three';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { EntityView } from '../../src/render/entities.js';
import { BitmapText, Container, Texture } from '../../src/render/gfx/index.js';
import { installPixelFonts, UI_FONT_FAMILY } from '../../src/render/ui/font.js';
import { UI_TEXT_HEIGHT } from '../../src/render/ui/text.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * `EntityView` draws a telegraph's *shape* off `enemyTelegraphShape` (#233),
 * not just its growth — this is the render-side half of that: given the
 * shape the sim already worked out, does the right flat shape lie on the
 * floor, turned the right way, in the right place. `tests/unit/enemy.test.ts`'s
 * own `enemyTelegraphShape` suite covers the lookup itself; this is only about
 * what `EntityView.sync` does with the answer.
 *
 * The shapes are `render/world/flat.ts`'s `FloorRing`, `FloorWedge` and
 * `FloorBar`, told apart by the geometry each one is built on: a ring is a
 * `RingGeometry`, a bar a `PlaneGeometry`, and a wedge a fan built by hand
 * into a bare `BufferGeometry`.
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

function place(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
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

const project = (x: number, _height: number, z: number, out: { x: number; y: number }): void => {
  out.x = x;
  out.y = z;
};

type FlatMesh = Mesh<BufferGeometry, MeshBasicMaterial>;
type Shape = 'ring' | 'wedge' | 'bar';

/** The flat colour shapes the view has on the floor this frame, with which pool each came from. */
function visibleTelegraphs(view: EntityView): { shape: Shape; mesh: FlatMesh }[] {
  const out: { shape: Shape; mesh: FlatMesh }[] = [];
  for (const child of view.group.children) {
    if (
      !(child instanceof Mesh) ||
      !child.visible ||
      !(child.material instanceof MeshBasicMaterial)
    ) {
      continue;
    }
    const mesh = child;
    const shape: Shape =
      mesh.geometry instanceof RingGeometry
        ? 'ring'
        : mesh.geometry instanceof PlaneGeometry
          ? 'bar'
          : 'wedge';
    out.push({ shape, mesh: mesh as FlatMesh });
  }
  return out;
}

describe('EntityView, drawing a telegraph shape (#233)', () => {
  it("draws a charge's telegraph as a wedge on the floor, turned to face the player", () => {
    const sim = bareSim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'kuh', sim.positionX(player) + 40, sim.positionY(player));
    for (let tick = 0; tick < 30 && stateName(sim, enemy) !== 'telegraph'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('telegraph');
    sim.step(IDLE);

    const view = harness(sim);
    view.sync(0, 0, project);

    const drawn = visibleTelegraphs(view);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.shape).toBe('wedge');
    // The player sits due west of the body, so the sim's angle is π; the wedge
    // fan is built along +x and turned about the vertical to point that way.
    const yaw = drawn[0]?.mesh.rotation.y ?? 0;
    expect(Math.cos(yaw)).toBeCloseTo(-1, 1);
    // It lies at the attacker, on the floor.
    expect(drawn[0]?.mesh.position.x).toBeCloseTo(sim.positionX(enemy), 0);
    expect(drawn[0]?.mesh.position.z).toBeCloseTo(sim.positionY(enemy), 0);
  });

  it('draws a radial burst as the ring every telegraph used to draw', () => {
    const sim = bareSim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'zapfhahn', sim.positionX(player) + 60, sim.positionY(player));
    for (let tick = 0; tick < 30 && stateName(sim, enemy) !== 'wind'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('wind');
    sim.step(IDLE);

    const view = harness(sim);
    view.sync(0, 0, project);

    const drawn = visibleTelegraphs(view);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.shape).toBe('ring');
    expect(drawn[0]?.mesh.position.x).toBeCloseTo(sim.positionX(enemy), 0);
    expect(drawn[0]?.mesh.position.z).toBeCloseTo(sim.positionY(enemy), 0);
  });

  it("draws Böllerschmeißer's warning away from the thrower, at the spot the bomb will land", () => {
    const sim = bareSim();
    const player = sim.playerIndex;
    const enemy = place(
      sim,
      'boellerschmeisser',
      sim.positionX(player) + 60,
      sim.positionY(player),
    );
    for (let tick = 0; tick < 10 && stateName(sim, enemy) !== 'wind'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('wind');
    sim.step(IDLE);

    const view = harness(sim);
    view.sync(0, 0, project);

    const drawn = visibleTelegraphs(view);
    expect(drawn).toHaveLength(1);
    const marker = drawn[0];
    expect(marker?.shape).toBe('bar');
    // Anchored on the player, not on the thrower's own body — the whole
    // point being fixed rather than a ring the thrower would otherwise grow.
    expect(marker?.mesh.position.x).toBeCloseTo(sim.positionX(player), 0);
    expect(marker?.mesh.position.z).toBeCloseTo(sim.positionY(player), 0);
    expect(marker?.mesh.position.x).not.toBeCloseTo(sim.positionX(enemy), 0);
  });

  it('draws nothing for a body that is not telegraphing', () => {
    const sim = bareSim();
    const player = sim.playerIndex;
    place(sim, 'kuh', sim.positionX(player) + 200, sim.positionY(player));
    const view = harness(sim);
    view.sync(0, 0, project);
    expect(visibleTelegraphs(view)).toHaveLength(0);
  });

  it('keeps drawing every shape with `reduceFlashes` on, just without the pulse', () => {
    const sim = bareSim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'kuh', sim.positionX(player) + 40, sim.positionY(player));
    for (let tick = 0; tick < 30 && stateName(sim, enemy) !== 'telegraph'; tick++) {
      sim.step(IDLE);
    }
    sim.step(IDLE);

    const view = harness(sim);
    view.setRingPulses(false);
    view.sync(0, 0, project);
    const drawn = visibleTelegraphs(view);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.mesh.visible).toBe(true);
    expect(drawn[0]?.mesh.material.opacity).toBeGreaterThan(0);
  });
});
