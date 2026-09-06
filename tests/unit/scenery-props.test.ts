import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOM_TILE_UNITS } from '../../src/content/rooms/definition.js';
import { MAIBAUM_TOP_TILE, PROP_TILE_NAMES } from '../../src/render/floor-art.js';
import { type Texture, textureFromPixels } from '../../src/render/gfx/index.js';
import { Scenery } from '../../src/render/world/scenery.js';
import { DESTRUCTIBLE_PROP_KINDS, GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { billboardMeshes } from '../helpers/billboard.js';

/**
 * Decorative props as `Scenery` stands them in the room (#152): one billboard
 * per mapped prop on its cell, the Maibaum as two, nothing for a prop
 * something else draws, and a warning — once — for a prop nobody has drawn
 * art for (`docs/DECISIONS.md` #19).
 *
 * `Scenery` also builds the floor, walls and hazards, so the props are picked
 * back out of the group as the billboards: the only lit, alpha-tested quads
 * with a shadow material in a room with no obstacles.
 */

function tile(): Texture {
  return textureFromPixels(16, 16, new Int32Array(256).fill(0xffffff));
}

const tiles: Record<string, Texture> = {
  'crate-opa': tile(),
  'crate-neu': tile(),
  'rural-maibaum-base': tile(),
  [MAIBAUM_TOP_TILE]: tile(),
};

afterEach(() => {
  vi.restoreAllMocks();
});

function scenery(
  props: readonly { x: number; y: number; type: string }[],
  tileTextures: Readonly<Record<string, Texture>> = tiles,
): Scenery {
  return new Scenery(new RoomGeometry(0, 0, 320, 180), 1, [], props, { tileTextures }, 0);
}

describe('Scenery, standing decorative props', () => {
  it('stands one billboard per mapped prop, its feet on the south edge of its authored cell', () => {
    const built = scenery([
      { x: 72, y: 32, type: 'crate-opa' },
      { x: 88, y: 32, type: 'crate-neu' },
    ]);
    const standing = billboardMeshes(built.group);
    expect(standing).toHaveLength(2);
    // Bottom-anchored on the cell's lower edge, so the quad covers exactly the
    // cell it is authored in — with anything taller than a tile overhanging
    // upward, which is what a player walks behind.
    expect(standing.map((mesh) => [mesh.position.x, mesh.position.z])).toEqual([
      [72, 32 + ROOM_TILE_UNITS / 2],
      [88, 32 + ROOM_TILE_UNITS / 2],
    ]);
    for (const mesh of standing) {
      expect(mesh.position.y).toBeCloseTo(0.2);
    }
  });

  it('draws a 16px prop tile one cell wide, on the tile grid rather than the actor grid', () => {
    const built = scenery([{ x: 72, y: 32, type: 'crate-opa' }]);
    const [crate] = billboardMeshes(built.group);
    expect(crate?.scale.x).toBe(ROOM_TILE_UNITS);
    expect(crate?.scale.y).toBe(ROOM_TILE_UNITS);
  });

  it('draws the Maibaum as two tiles, its crown standing directly on its base', () => {
    const built = scenery([{ x: 120, y: 96, type: 'maibaum' }]);
    const standing = billboardMeshes(built.group);
    expect(standing).toHaveLength(2);
    const [base, crown] = standing;
    expect(base?.position.x).toBe(120);
    expect(crown?.position.x).toBe(120);
    // Both halves stand on the same foot line, so neither can sort between
    // a player standing in front of the pole and the other half.
    expect(base?.position.z).toBe(96 + ROOM_TILE_UNITS / 2);
    expect(crown?.position.z).toBe(96 + ROOM_TILE_UNITS / 2);
    expect((crown?.position.y ?? 0) - (base?.position.y ?? 0)).toBeCloseTo(ROOM_TILE_UNITS);
  });

  it('draws nothing for a prop something else already draws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const built = scenery([
      { x: 10, y: 10, type: 'pedestal' },
      { x: 20, y: 20, type: 'hop-trellis' },
      // A barrel is a real destructible entity, drawn by `EntityView` from
      // the floor's own tileset — never here, and never as a warning.
      { x: 30, y: 30, type: 'barrel' },
    ]);
    expect(billboardMeshes(built.group)).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('degrades gracefully on a prop type nobody has drawn art for, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const built = scenery([
      { x: 10, y: 10, type: 'unauthored-thing' },
      { x: 20, y: 20, type: 'unauthored-thing' },
      { x: 30, y: 30, type: 'crate-opa' },
    ]);
    // The run continues, and the props that *do* have art still draw — the
    // shape `docs/DECISIONS.md` #19 asks for.
    expect(billboardMeshes(built.group)).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns once for a mapped prop whose tile is not loaded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const built = scenery([{ x: 10, y: 10, type: 'well' }], {});
    expect(billboardMeshes(built.group)).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('collects bulbs for the lighting rig rather than standing them as tiles', () => {
    const built = scenery([{ x: 50, y: 60, type: 'bulb' }]);
    expect(billboardMeshes(built.group)).toHaveLength(0);
    expect(built.bulbs).toEqual([{ x: 50, y: 60 }]);
  });
});

describe('destructible props keep their identity through the simulation', () => {
  it('records which authored prop type spawned each target', () => {
    const sim = new GameSim({ seed: 1, population: 'empty' });
    const barrel = sim.spawnTarget(40, 40, 8, DESTRUCTIBLE_PROP_KINDS.indexOf('barrel'));
    const maypole = sim.spawnTarget(80, 40, 8, DESTRUCTIBLE_PROP_KINDS.indexOf('maypole'));
    sim.world.flush();
    const propKind = sim.propKind.data;
    expect(propKind[barrel & 0xffff]).not.toBe(propKind[maypole & 0xffff]);
  });

  it('defaults a target spawned without a kind to the first one', () => {
    // The tuning playground's training target, and any test calling
    // `spawnTarget` directly — both should read as the thing every target used
    // to be, not as a Maibaum in a cellar.
    const sim = new GameSim({ seed: 1, population: 'empty' });
    const target = sim.spawnTarget(40, 40, 8);
    sim.world.flush();
    expect(sim.propKind.data[target & 0xffff]).toBe(0);
    expect(DESTRUCTIBLE_PROP_KINDS[0]).toBe('barrel');
  });
});

describe('PROP_TILE_NAMES', () => {
  it('never maps two prop types to the same tile by accident', () => {
    const named = Object.values(PROP_TILE_NAMES).filter((name): name is string => name !== null);
    expect(new Set(named).size).toBe(named.length);
  });
});
