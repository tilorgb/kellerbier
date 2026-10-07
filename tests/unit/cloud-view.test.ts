import { Mesh, type MeshBasicMaterial, type PlaneGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { CloudView } from '../../src/render/cloud-view.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';

/**
 * A poison cloud is drawn as ground fog out to its true radius, with puffs
 * seeping up out of it — not as a ring of motes turning round its rim.
 */

const IDLE = createInputFrame();

type Quad = Mesh<PlaneGeometry, MeshBasicMaterial>;

function visible(view: CloudView): Quad[] {
  const out: Quad[] = [];
  view.group.traverse((object) => {
    if (object instanceof Mesh && object.visible) {
      out.push(object as Quad);
    }
  });
  return out;
}

/** The flat haze discs — the meshes laid on the floor. */
function discs(view: CloudView): Quad[] {
  return visible(view).filter((mesh) => Math.abs(mesh.rotation.x + Math.PI / 2) < 1e-6);
}

describe('CloudView', () => {
  it('draws nothing while there is no cloud', () => {
    const sim = new GameSim({ seed: 1, room: new RoomGeometry(0, 0, 320, 180) });
    const view = new CloudView();
    view.sync(sim, 0);
    expect(visible(view)).toHaveLength(0);
  });

  it('lays a haze on the floor out to the cloud radius once grown, and does not spin it', () => {
    const sim = new GameSim({ seed: 1, room: new RoomGeometry(0, 0, 320, 180) });
    const view = new CloudView();
    sim.spawnPoisonCloud(100, 90, 28, 12, 90);
    for (let tick = 0; tick < 20; tick++) {
      sim.step(IDLE);
    }
    view.sync(sim, 0);
    const [disc] = discs(view);
    expect(disc).toBeDefined();
    // Diameter, give or take the slow breath (±4%).
    expect(disc?.scale.x).toBeGreaterThan(56 * 0.95);
    expect(disc?.scale.x).toBeLessThan(56 * 1.05);
    expect(disc?.position.x).toBe(100);
    expect(disc?.position.z).toBe(90);
    const spin = disc?.rotation.z;
    for (let tick = 0; tick < 20; tick++) {
      sim.step(IDLE);
      view.sync(sim, 0);
    }
    expect(discs(view)[0]?.rotation.z).toBe(spin);
    // And puffs rising out of it.
    expect(visible(view).length).toBeGreaterThan(1);
  });

  it('fades out at the end of its life and is gone after', () => {
    const sim = new GameSim({ seed: 1, room: new RoomGeometry(0, 0, 320, 180) });
    const view = new CloudView();
    sim.spawnPoisonCloud(100, 90, 28, 12, 90);
    for (let tick = 0; tick < 80; tick++) {
      sim.step(IDLE);
    }
    view.sync(sim, 0);
    const opacity = discs(view)[0]?.material.opacity ?? 1;
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    for (let tick = 0; tick < 20; tick++) {
      sim.step(IDLE);
    }
    view.sync(sim, 0);
    expect(visible(view)).toHaveLength(0);
  });

  it('no longer spends particles on a ring round the rim', () => {
    const sim = new GameSim({ seed: 1, room: new RoomGeometry(0, 0, 320, 180) });
    sim.particles.clear();
    sim.spawnPoisonCloud(100, 90, 28, 12, 90);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(IDLE);
    }
    expect(sim.particles.liveCount).toBe(0);
  });
});
