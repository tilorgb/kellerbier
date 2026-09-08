import { describe, expect, it } from 'vitest';
import { AdditiveBlending, InstancedMesh, NormalBlending, type MeshBasicMaterial } from 'three';
import { GameSim } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { PROJECTILE_TINT_INDEX, PROJECTILE_TINT_NAMES } from '../../src/sim/projectile/tints.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { TARGET_RADIUS } from '../../src/sim/game/sim.js';
import { type Texture, textureFromPixels } from '../../src/render/gfx/index.js';
import { PROJECTILE_TINT_COLOURS } from '../../src/render/palette.js';
import { ProjectileView, type ProjectileArt } from '../../src/render/projectiles.js';
import {
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';

/**
 * The per-projectile tint (`sim/projectile/tints.ts`): the roster's "every
 * item is visible on the shot it changed" rule, checked end to end — a
 * content hook names a tint, the store carries it, a split child inherits
 * it, and the renderer's instanced layer writes it as the instance colour.
 */

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function baseItem(id: string, overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id,
    name: id,
    description: 'a test item',
    sprite: 'test',
    pools: ['treasure'],
    quality: 0,
    promilleRequirement: 'any',
    ...overrides,
  };
}

function texture(): Texture {
  return textureFromPixels(1, 1, new Int32Array([0xffffff]));
}

function art(): ProjectileArt {
  return {
    player: texture(),
    playerTags: [],
    enemyByName: {},
    enemyByFloor: { 1: texture() },
    fallback: texture(),
  };
}

const IDLE = createInputFrame();

describe('projectile tints — the names and the table', () => {
  it('index 0 is "none", and every name resolves to a colour the renderer knows', () => {
    expect(PROJECTILE_TINT_NAMES[0]).toBe('none');
    expect(PROJECTILE_TINT_INDEX.none).toBe(0);
    expect(PROJECTILE_TINT_COLOURS.none).toBe(0xffffff);
    for (const name of PROJECTILE_TINT_NAMES) {
      expect(PROJECTILE_TINT_COLOURS[name], `no colour authored for tint "${name}"`).toBeTypeOf(
        'number',
      );
    }
    // A `Uint8Array` field — the roster has room, but not unbounded room.
    expect(PROJECTILE_TINT_NAMES.length).toBeLessThan(256);
  });
});

describe('GameSim.tintProjectile', () => {
  it('writes the named index onto the shot, and spawn resets it for the next occupant', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const slot = sim.projectiles.spawn(0, 0, 1, 0, 3, 1, 30, ProjectileTeam.Player);
    expect(sim.projectiles.tint[slot]).toBe(0);
    sim.tintProjectile(slot, 'spezi');
    expect(sim.projectiles.tint[slot]).toBe(PROJECTILE_TINT_INDEX.spezi);

    sim.projectiles.despawn(slot);
    const reused = sim.projectiles.spawn(0, 0, 1, 0, 3, 1, 30, ProjectileTeam.Player);
    expect(reused).toBe(slot);
    expect(sim.projectiles.tint[reused]).toBe(0);
  });

  it('a tint set from onProjectileSpawn reaches the shot the player fires', () => {
    const item = baseItem('braun', {
      hooks: {
        onProjectileSpawn: (ctx) => {
          ctx.sim.tintProjectile(ctx.projectile, 'cola');
        },
      },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item], population: 'empty' });
    sim.pickUpItem('braun');
    const frame = createInputFrame();
    frame.aimX = quantiseAxis(1);
    setActionDown(frame, InputAction.Fire, true);
    sim.step(frame);
    let tinted = 0;
    sim.projectiles.forEachLive((slot) => {
      if (sim.projectiles.tint[slot] === PROJECTILE_TINT_INDEX.cola) {
        tinted += 1;
      }
    });
    expect(tinted).toBe(1);
  });

  it('a splitting shot hands its tint down to its children', () => {
    const item = baseItem('salat', {
      hooks: {
        onProjectileSpawn: (ctx) => {
          ctx.sim.addProjectileTag(ctx.projectile, 'splitting');
          ctx.sim.tintProjectile(ctx.projectile, 'kartoffel');
        },
      },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item], population: 'empty' });
    sim.pickUpItem('salat');
    const playerX = sim.positionX(sim.playerIndex);
    const playerY = sim.positionY(sim.playerIndex);
    sim.spawnTarget(playerX + 40, playerY, TARGET_RADIUS);
    sim.world.flush();

    const frame = createInputFrame();
    frame.aimX = quantiseAxis(1);
    setActionDown(frame, InputAction.Fire, true);
    sim.step(frame);
    // Step until the parent has hit and split — more than one shot in flight
    // — and check the brood on that tick, before the short-lived children
    // expire (`splitLifetimeScale`).
    let children = 0;
    for (let tick = 0; tick < 40 && children === 0; tick++) {
      sim.step(IDLE);
      if (sim.projectiles.liveCount > 1) {
        sim.projectiles.forEachLive((slot) => {
          expect(sim.projectiles.tint[slot]).toBe(PROJECTILE_TINT_INDEX.kartoffel);
          children += 1;
        });
      }
    }
    expect(children).toBeGreaterThan(1);
  });
});

describe('ProjectileView — tint as instance colour', () => {
  /** The instanced layer wearing `texture`, if the view has built one. */
  function layerFor(view: ProjectileView, wanted: Texture): InstancedMesh | undefined {
    return view.group.children.find(
      (child) =>
        child instanceof InstancedMesh &&
        (child.material as MeshBasicMaterial).map === wanted.source.texture,
    ) as InstancedMesh | undefined;
  }

  it('writes the tint colour per instance, white for an untinted shot', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const set = art();
    const view = new ProjectileView(sim.projectiles, set);
    const plain = sim.projectiles.spawn(10, 10, 1, 0, 3, 1, 30, ProjectileTeam.Player);
    const tinted = sim.projectiles.spawn(20, 10, 1, 0, 3, 1, 30, ProjectileTeam.Player);
    sim.tintProjectile(tinted, 'spezi');

    view.sync(1, 1);

    const layer = layerFor(view, set.player);
    expect(layer).toBeDefined();
    expect(layer?.count).toBe(2);
    const colours = layer?.instanceColor;
    expect(colours).not.toBeNull();
    // Oldest first — `forEachLive`'s order — so `plain` is instance 0.
    expect(plain).toBeLessThan(tinted);
    expect(colours?.getX(0)).toBeCloseTo(1, 5);
    expect(colours?.getY(0)).toBeCloseTo(1, 5);
    expect(colours?.getZ(0)).toBeCloseTo(1, 5);
    const spezi = PROJECTILE_TINT_COLOURS.spezi;
    // three.js converts the sRGB hex to linear when it stores a colour, so
    // compare against the same conversion rather than the raw byte.
    const expected = { r: ((spezi >> 16) & 0xff) / 255, g: ((spezi >> 8) & 0xff) / 255 };
    expect(colours?.getX(1)).toBeLessThan(colours?.getX(0) ?? 0);
    expect((colours?.getX(1) ?? 0) > (colours?.getY(1) ?? 0)).toBe(expected.r > expected.g);
    view.destroy();
  });

  it('never tints an enemy shot, whatever its store field says', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const set = art();
    const enemyTexture = set.enemyByFloor[1];
    if (enemyTexture === undefined) {
      throw new Error('fixture has no floor-1 enemy texture');
    }
    const view = new ProjectileView(sim.projectiles, set);
    const enemyShot = sim.projectiles.spawn(10, 10, 1, 0, 3, 1, 30, ProjectileTeam.Enemy);
    sim.projectiles.tint[enemyShot] = PROJECTILE_TINT_INDEX.cola;
    view.sync(1, 1);
    const layer = layerFor(view, enemyTexture);
    expect(layer?.instanceColor?.getX(0)).toBeCloseTo(1, 5);
    view.destroy();
  });

  it('pre-allocates the colour attribute so the first tinted shot never grows a layer', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const set = art();
    const view = new ProjectileView(sim.projectiles, set);
    sim.projectiles.spawn(10, 10, 1, 0, 3, 1, 30, ProjectileTeam.Player);
    view.sync(1, 1);
    const layer = layerFor(view, set.player);
    expect(layer?.instanceColor).not.toBeNull();
    view.destroy();
  });
});

/**
 * Promille's shot heat (#311): the reward's readout, on the same instance
 * colour the item tints ride on, plus its own additive glow layer and the
 * shot light it brightens.
 */
describe('ProjectileView — Promille shot heat', () => {
  /** Every instanced layer the view has built — `layerFor`'s `find`, widened to all of them. */
  function layersOf(view: ProjectileView): InstancedMesh[] {
    return view.group.children.filter((child) => child instanceof InstancedMesh) as InstancedMesh[];
  }

  function mainLayer(view: ProjectileView, wanted: Texture): InstancedMesh | undefined {
    return layersOf(view).find(
      (child) =>
        (child.material as MeshBasicMaterial).map === wanted.source.texture &&
        (child.material as MeshBasicMaterial).blending === NormalBlending,
    );
  }

  function glowLayer(view: ProjectileView): InstancedMesh | undefined {
    return layersOf(view).find(
      (child) => (child.material as MeshBasicMaterial).blending === AdditiveBlending,
    );
  }

  function playerShot(sim: GameSim): void {
    sim.projectiles.spawn(10, 10, 1, 0, 3, 1, 30, ProjectileTeam.Player);
  }

  it('leaves a sober shot exactly as white as it was before any of this', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const set = art();
    const view = new ProjectileView(sim.projectiles, set);
    playerShot(sim);
    view.setShotHeat(0);
    view.sync(1, 1);
    const colours = mainLayer(view, set.player)?.instanceColor;
    expect(colours?.getX(0)).toBeCloseTo(1, 5);
    expect(colours?.getY(0)).toBeCloseTo(1, 5);
    expect(colours?.getZ(0)).toBeCloseTo(1, 5);
    expect(glowLayer(view)).toBeUndefined();
    view.destroy();
  });

  it('runs a hot shot red-over-blue and brighter than a sober one', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const set = art();
    const view = new ProjectileView(sim.projectiles, set);
    playerShot(sim);
    view.setShotHeat(1);
    view.sync(1, 1);
    const colours = mainLayer(view, set.player)?.instanceColor;
    const r = colours?.getX(0) ?? 0;
    const b = colours?.getZ(0) ?? 0;
    expect(r).toBeGreaterThan(1);
    expect(b).toBeLessThan(1);
    expect(r).toBeGreaterThan(b);
    view.destroy();
  });

  it('multiplies an item tint rather than replacing it', () => {
    // A Spezi's brown shot fired drunk should be a hot brown, not a generic
    // flame: the item still says what it did.
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const set = art();
    const view = new ProjectileView(sim.projectiles, set);
    const shot = sim.projectiles.spawn(10, 10, 1, 0, 3, 1, 30, ProjectileTeam.Player);
    sim.tintProjectile(shot, 'spezi');
    view.setShotHeat(0);
    view.sync(1, 1);
    const cold = mainLayer(view, set.player)?.instanceColor?.getX(0) ?? 0;
    view.setShotHeat(1);
    view.sync(1, 1);
    const hot = mainLayer(view, set.player)?.instanceColor?.getX(0) ?? 0;
    // Still the tint's own hue relationship, just hotter.
    expect(hot).toBeGreaterThan(cold);
    expect(cold).toBeGreaterThan(0);
    view.destroy();
  });

  it('never heats an enemy shot — the player drinking is not a buff for them', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const set = art();
    const enemyTexture = set.enemyByFloor[1];
    if (enemyTexture === undefined) {
      throw new Error('fixture has no floor-1 enemy texture');
    }
    const view = new ProjectileView(sim.projectiles, set);
    sim.projectiles.spawn(10, 10, 1, 0, 3, 1, 30, ProjectileTeam.Enemy);
    view.setShotHeat(1);
    view.sync(1, 1);
    const colours = layersOf(view).find(
      (child) => (child.material as MeshBasicMaterial).map === enemyTexture.source.texture,
    )?.instanceColor;
    expect(colours?.getX(0)).toBeCloseTo(1, 5);
    expect(colours?.getZ(0)).toBeCloseTo(1, 5);
    view.destroy();
  });

  it('adds exactly one additive glow layer once the shot is hot enough, however many sprites are in flight', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const set = art();
    const view = new ProjectileView(sim.projectiles, set);
    playerShot(sim);
    playerShot(sim);
    view.setShotHeat(1);
    view.sync(1, 1);
    const glow = glowLayer(view);
    expect(glow).toBeDefined();
    expect(glow?.count).toBe(2);
    // One extra shader program for the whole effect — see the comment on the
    // glow's `layerFor` call.
    expect(
      layersOf(view).filter(
        (child) => (child.material as MeshBasicMaterial).blending === AdditiveBlending,
      ),
    ).toHaveLength(1);
    // Behind the shots, and never writing depth over them.
    expect(glow?.renderOrder).toBeLessThan(0);
    expect((glow?.material as MeshBasicMaterial).depthWrite).toBe(false);
    view.destroy();
  });

  it('clamps how far past full heat it will draw', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const set = art();
    const view = new ProjectileView(sim.projectiles, set);
    playerShot(sim);
    // Trinkfest can push `promilleShotHeat` well past 1; the renderer decides
    // how much of that is still legible rather than drawing a white square.
    view.setShotHeat(50);
    view.sync(1, 1);
    const hottest = mainLayer(view, set.player)?.instanceColor?.getX(0) ?? 0;
    view.setShotHeat(1.35);
    view.sync(1, 1);
    expect(mainLayer(view, set.player)?.instanceColor?.getX(0)).toBeCloseTo(hottest, 5);
    view.destroy();
  });
});
