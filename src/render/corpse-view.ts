import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import type { GameSim } from '../sim/game/sim.js';

/**
 * The Blutwurz grave marker: a mound and a small cross where Alois fell, shown
 * only in the room he fell in. It is the revival's target and a gameplay
 * marker, so it is a real thing standing in the room, not a floor stain.
 */
const MOUND = 0x3a3228;
const MARKER = 0xc9c2a8;

export class CorpseView {
  readonly group = new Group();

  constructor() {
    const mound = new Mesh(
      new SphereGeometry(9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new MeshStandardMaterial({ color: MOUND, roughness: 1 }),
    );
    mound.scale.set(1, 0.4, 0.55);
    mound.receiveShadow = true;
    this.group.add(mound);
    const upright = new Mesh(
      new BoxGeometry(2, 12, 1),
      new MeshStandardMaterial({ color: MARKER, roughness: 0.9 }),
    );
    upright.position.set(0, 7, -1);
    upright.castShadow = true;
    this.group.add(upright);
    const arm = new Mesh(
      new BoxGeometry(8, 2, 1),
      new MeshStandardMaterial({ color: MARKER, roughness: 0.9 }),
    );
    arm.position.set(0, 10, -1);
    arm.castShadow = true;
    this.group.add(arm);
    this.group.visible = false;
  }

  sync(sim: GameSim): void {
    const corpse = sim.corpsePosition;
    const visible = corpse !== null && corpse.roomId === sim.roomId;
    this.group.visible = visible;
    if (visible) {
      this.group.position.set(corpse.x, 0, corpse.y);
    }
  }

  destroy(): void {
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        const mesh = object as Mesh;
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      }
    });
    this.group.removeFromParent();
  }
}
