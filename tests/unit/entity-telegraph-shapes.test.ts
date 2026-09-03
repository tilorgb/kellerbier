import { describe, expect, it } from 'vitest';
import { Sprite, Texture } from 'pixi.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { EntityView } from '../../src/render/entities.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * `EntityView` draws a telegraph's *shape* off `enemyTelegraphShape` (#233),
 * not just its growth — this is the render-side half of that: given the
 * shape the sim already worked out, does the right pool draw, with the right
 * texture, in the right place. `tests/unit/enemy.test.ts`'s own
 * `enemyTelegraphShape` suite covers the lookup itself; this is only about
 * what `EntityView.sync` does with the answer.
 */

const IDLE = createInputFrame();

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

/** The layer `EntityView` draws rings, wedges and bars into (`shadow, ring, corpse, body, label`). */
const RING_LAYER = 1;

interface Harness {
  view: EntityView;
  ringTexture: Texture;
  wedgeTexture: Texture;
  barTexture: Texture;
}

/** Three distinct textures, so a visible sprite's pool can be told apart by which one it draws. */
function harness(sim: GameSim): Harness {
  const ringTexture = new Texture();
  const wedgeTexture = new Texture();
  const barTexture = new Texture();
  const view = new EntityView(
    sim,
    Texture.EMPTY,
    Texture.EMPTY,
    ringTexture,
    wedgeTexture,
    {},
    {},
    {},
    {},
    undefined,
    new Set(),
    undefined,
    barTexture,
  );
  return { view, ringTexture, wedgeTexture, barTexture };
}

function visibleTelegraphSprites(view: EntityView): Sprite[] {
  const layer = view.container.children[RING_LAYER];
  return (layer?.children ?? []).filter(
    (child): child is Sprite => child instanceof Sprite && child.visible,
  );
}

describe('EntityView, drawing a telegraph shape (#233)', () => {
  it("draws a charge's telegraph from the wedge pool, rotated to face the player", () => {
    const sim = bareSim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'kuh', sim.positionX(player) + 40, sim.positionY(player));
    for (let tick = 0; tick < 30 && stateName(sim, enemy) !== 'telegraph'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('telegraph');
    sim.step(IDLE);

    const { view, wedgeTexture, ringTexture, barTexture } = harness(sim);
    view.sync(0, 0);

    const drawn = visibleTelegraphSprites(view);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.texture).toBe(wedgeTexture);
    expect(drawn[0]?.texture).not.toBe(ringTexture);
    expect(drawn[0]?.texture).not.toBe(barTexture);
    // The player sits due west of the body, so the wedge points at π.
    expect(drawn[0]?.rotation).toBeCloseTo(Math.PI, 1);
  });

  it('draws a radial burst as the same ring every telegraph used to draw', () => {
    const sim = bareSim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'zapfhahn', sim.positionX(player) + 60, sim.positionY(player));
    for (let tick = 0; tick < 30 && stateName(sim, enemy) !== 'wind'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('wind');
    sim.step(IDLE);

    const { view, ringTexture, wedgeTexture } = harness(sim);
    view.sync(0, 0);

    const drawn = visibleTelegraphSprites(view);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.texture).toBe(ringTexture);
    expect(drawn[0]?.texture).not.toBe(wedgeTexture);
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

    const { view, barTexture, ringTexture, wedgeTexture } = harness(sim);
    view.sync(0, 0);

    const drawn = visibleTelegraphSprites(view);
    expect(drawn).toHaveLength(1);
    const marker = drawn[0];
    expect(marker?.texture).toBe(barTexture);
    expect(marker?.texture).not.toBe(ringTexture);
    expect(marker?.texture).not.toBe(wedgeTexture);
    // Anchored on the player, not on the thrower's own body — the whole
    // point being fixed rather than a ring the thrower would otherwise grow.
    expect(marker?.position.x).toBeCloseTo(sim.positionX(player), 0);
    expect(marker?.position.y).toBeCloseTo(sim.positionY(player), 0);
    expect(marker?.position.x).not.toBeCloseTo(sim.positionX(enemy), 0);
  });

  it('draws nothing for a body that is not telegraphing', () => {
    const sim = bareSim();
    const player = sim.playerIndex;
    place(sim, 'kuh', sim.positionX(player) + 200, sim.positionY(player));
    const { view } = harness(sim);
    view.sync(0, 0);
    expect(visibleTelegraphSprites(view)).toHaveLength(0);
  });

  it('keeps drawing every shape with `reduceFlashes` on, just without the pulse', () => {
    const sim = bareSim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'kuh', sim.positionX(player) + 40, sim.positionY(player));
    for (let tick = 0; tick < 30 && stateName(sim, enemy) !== 'telegraph'; tick++) {
      sim.step(IDLE);
    }
    sim.step(IDLE);

    const { view } = harness(sim);
    view.setRingPulses(false);
    view.sync(0, 0);
    const drawn = visibleTelegraphSprites(view);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.visible).toBe(true);
    expect(drawn[0]?.alpha).toBeGreaterThan(0);
  });
});
