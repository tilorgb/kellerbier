import { Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPropView, resetPropWarnings } from '../../src/render/prop-view.js';
import { MAIBAUM_TOP_TILE, PROP_TILE_NAMES } from '../../src/render/floor-art.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { DESTRUCTIBLE_PROP_KINDS } from '../../src/sim/game/sim.js';

const tiles: Record<string, Texture> = {
  'crate-opa': new Texture(),
  'crate-neu': new Texture(),
  'rural-maibaum-base': new Texture(),
  [MAIBAUM_TOP_TILE]: new Texture(),
};

afterEach(() => {
  resetPropWarnings();
  vi.restoreAllMocks();
});

describe('createPropView', () => {
  it('draws one sprite per mapped prop, at the authored position', () => {
    const view = createPropView(
      [
        { x: 72, y: 32, type: 'crate-opa' },
        { x: 88, y: 32, type: 'crate-neu' },
      ],
      tiles,
    );
    expect(view.children).toHaveLength(2);
    expect(view.children.map((child) => [child.x, child.y])).toEqual([
      [72, 32],
      [88, 32],
    ]);
  });

  it('draws the Maibaum as two tiles, its crown directly above its base', () => {
    const view = createPropView([{ x: 120, y: 96, type: 'maibaum' }], tiles);
    expect(view.children).toHaveLength(2);
    expect(view.children.map((child) => child.y)).toEqual([96, 80]);
  });

  it('draws nothing for a prop something else already draws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = createPropView(
      [
        { x: 10, y: 10, type: 'pedestal' },
        { x: 20, y: 20, type: 'hop-trellis' },
        // A barrel is a real destructible entity, drawn by `EntityView` from
        // the floor's own tileset — never here, and never as a warning.
        { x: 30, y: 30, type: 'barrel' },
      ],
      tiles,
    );
    expect(view.children).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('degrades gracefully on a prop type nobody has drawn art for, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = createPropView(
      [
        { x: 10, y: 10, type: 'unauthored-thing' },
        { x: 20, y: 20, type: 'unauthored-thing' },
        { x: 30, y: 30, type: 'crate-opa' },
      ],
      tiles,
    );
    // The run continues, and the props that *do* have art still draw — the
    // shape `docs/DECISIONS.md` #19 asks for.
    expect(view.children).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns once for a mapped prop whose tile is not loaded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = createPropView([{ x: 10, y: 10, type: 'well' }], {});
    expect(view.children).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
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
