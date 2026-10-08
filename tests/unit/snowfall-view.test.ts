import { InstancedMesh, Matrix4, type MeshBasicMaterial, type PlaneGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { SnowfallView } from '../../src/render/snowfall-view.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';

/**
 * Die Alpen's ambient snow (#40) is render-only, so what there is to test is
 * that it is a pure function of the tick, shows only on the alpine rig, and
 * honours reduced motion.
 */

const IDLE = createInputFrame();

type FlakeMesh = InstancedMesh<PlaneGeometry, MeshBasicMaterial>;

function flakeMesh(view: SnowfallView): FlakeMesh {
  const mesh: unknown = view.group.children[0];
  if (!(mesh instanceof InstancedMesh)) {
    throw new Error('the snowfall view holds one instanced mesh');
  }
  return mesh as FlakeMesh;
}

function matrices(view: SnowfallView): number[] {
  const mesh = flakeMesh(view);
  const out: number[] = [];
  const m = new Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    out.push(...m.elements);
  }
  return out;
}

describe('SnowfallView (#40)', () => {
  it('falls only on the alpine rig, and not under reduced motion', () => {
    const sim = new GameSim({ seed: 1, room: new RoomGeometry(0, 0, 320, 180) });
    const view = new SnowfallView();
    view.sync(sim, 0);
    expect(flakeMesh(view).visible).toBe(false);
    view.setRig('alpine');
    view.sync(sim, 0);
    expect(flakeMesh(view).visible).toBe(true);
    view.setReducedMotion(true);
    view.sync(sim, 0);
    expect(flakeMesh(view).visible).toBe(false);
    view.setRig('forest');
    view.setReducedMotion(false);
    view.sync(sim, 0);
    expect(flakeMesh(view).visible).toBe(false);
    view.destroy();
  });

  it('is a pure function of the tick: the same tick draws the same flakes, a later tick moves them', () => {
    const draw = (ticks: number): number[] => {
      const sim = new GameSim({ seed: 7, room: new RoomGeometry(0, 0, 320, 180) });
      for (let i = 0; i < ticks; i++) {
        sim.step(IDLE);
      }
      const view = new SnowfallView();
      view.setRig('alpine');
      view.sync(sim, 0);
      const out = matrices(view);
      view.destroy();
      return out;
    };
    expect(draw(30)).toEqual(draw(30));
    expect(draw(31)).not.toEqual(draw(30));
  });

  it('keeps every flake inside the room, above the floor', () => {
    const sim = new GameSim({ seed: 3, room: new RoomGeometry(40, 18, 248, 130) });
    const view = new SnowfallView();
    view.setRig('alpine');
    view.sync(sim, 0.5);
    const mesh = flakeMesh(view);
    const m = new Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      const x = m.elements[12];
      const y = m.elements[13];
      const z = m.elements[14];
      expect(x).toBeGreaterThanOrEqual(40);
      expect(x).toBeLessThanOrEqual(248);
      expect(z).toBeGreaterThanOrEqual(18);
      expect(z).toBeLessThanOrEqual(130);
      expect(y).toBeGreaterThanOrEqual(0);
    }
    view.destroy();
  });
});
