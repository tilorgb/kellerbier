import { describe, expect, it } from 'vitest';
import { type BufferGeometry, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
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
 * The flat-colour shapes are `render/world/flat.ts`'s `FloorRing` (a
 * `RingGeometry`) and `FloorWedge` (a fan built by hand into a bare
 * `BufferGeometry`). A lobbed Böller's ground marker is the textured
 * `FloorHazardDisc` every explosive shares (#12), not one of these — see its
 * own suite below.
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
type Shape = 'ring' | 'wedge';

/** The flat colour shapes the view has on the floor this frame, with which pool each came from. */
function visibleTelegraphs(view: EntityView): { shape: Shape; mesh: FlatMesh }[] {
  const out: { shape: Shape; mesh: FlatMesh }[] = [];
  for (const child of view.group.children) {
    if (
      !(child instanceof Mesh) ||
      !child.visible ||
      !(child.material instanceof MeshBasicMaterial) ||
      // The explosion hatch (`FloorHazardBar`/`FloorHazardDisc`) is textured,
      // not one of the enemy telegraph's flat colour shapes — see the bomb
      // and Böllerschmeißer suites below.
      child.material.map !== null
    ) {
      continue;
    }
    const mesh = child;
    const shape: Shape = mesh.geometry instanceof RingGeometry ? 'ring' : 'wedge';
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

  it("draws Böllerschmeißer's warning as a hatch disc where the bomb will land, not on the thrower (#12)", () => {
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

    // Not one of the flat-colour telegraph shapes any more — it is the same
    // textured hatch every explosive shows.
    expect(visibleTelegraphs(view)).toHaveLength(0);
    const discs = view.group.children.filter(
      (c): c is FlatMesh =>
        c instanceof Mesh &&
        c.visible &&
        c.material instanceof MeshBasicMaterial &&
        c.material.map !== null,
    );
    expect(discs).toHaveLength(1);
    const marker = discs[0];
    // Anchored on the player (where they stood when the throw began), not the
    // thrower, and at the blast's true radius from the first frame.
    expect(marker?.position.x).toBeCloseTo(sim.positionX(player), 0);
    expect(marker?.position.z).toBeCloseTo(sim.positionY(player), 0);
    expect(marker?.position.x).not.toBeCloseTo(sim.positionX(enemy), 0);
    expect(marker?.scale.x).toBeGreaterThan(0);
    expect(marker?.scale.x).toBeCloseTo(marker?.scale.y ?? 0, 5);
  });

  it('draws the bomb blast as two crossed hatch arms at full size from the moment it is placed (#3)', () => {
    const sim = bareSim();
    const player = sim.playerIndex;
    const bx = sim.positionX(player) + 40;
    const by = sim.positionY(player);
    sim.spawnBierfassl(bx, by, 0, 0, false);
    sim.world.flush();
    sim.step(IDLE); // fuse ticks once — barely started

    const view = harness(sim);

    const hazardArms = (): FlatMesh[] =>
      view.group.children.filter(
        (c): c is FlatMesh =>
          c instanceof Mesh &&
          c.visible &&
          c.material instanceof MeshBasicMaterial &&
          c.material.map !== null,
      );

    view.sync(0, 0, project);
    const early = hazardArms();
    expect(early).toHaveLength(2);
    // Centred on the bomb, and one arm long the other way.
    for (const arm of early) {
      expect(arm.position.x).toBeCloseTo(bx, 0);
      expect(arm.position.z).toBeCloseTo(by, 0);
    }
    const armSpan = Math.max(...early.map((a) => Math.max(a.scale.x, a.scale.y)));
    const width = Math.min(...early.map((a) => Math.min(a.scale.x, a.scale.y)));

    // Run the fuse most of the way down and re-sync: the footprint must not
    // have grown — only the blink alpha changes.
    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick < fuseTicks - 2; tick++) {
      sim.step(IDLE);
    }
    view.sync(0, 1234, project);
    const late = hazardArms();
    expect(late).toHaveLength(2);
    const lateSpan = Math.max(...late.map((a) => Math.max(a.scale.x, a.scale.y)));
    expect(lateSpan).toBeCloseTo(armSpan, 3);
    expect(Math.min(...late.map((a) => Math.min(a.scale.x, a.scale.y)))).toBeCloseTo(width, 3);
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
