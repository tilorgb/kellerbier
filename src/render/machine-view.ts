import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type PointLight,
} from 'three';
import type { GameSim } from '../sim/game/sim.js';
import type { Texture } from './gfx/index.js';
import { ENTITY_PALETTE } from './palette.js';
import { FloorSprite, PLINTH_HEIGHT } from './world/flat.js';
import type { Lighting } from './world/lighting.js';

/**
 * Der Losbrunnen (#218): at most one per room, a plinth and a beam in the
 * machine's own colour — a different colour from any item quality, so it is
 * never mistaken for a pedestal — and a dimmer, greyer one once it has broken.
 * Placeholder art pending sign-off, as before.
 */
const BEAM_RADIUS = 5;
const BEAM_HEIGHT = 26;

export class MachineView {
  readonly group = new Group();

  private readonly sim: GameSim;
  private readonly lighting: Lighting;
  private readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  /** Pooled from `Lighting`, driven in world space, never parented — see `PedestalSlot.light`. */
  private readonly light: PointLight | null;
  private readonly plinth: FloorSprite | null;

  constructor(sim: GameSim, lighting: Lighting, plinthTexture?: Texture) {
    this.sim = sim;
    this.lighting = lighting;
    this.beam = new Mesh(
      new CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 12, 1, true),
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    );
    this.beam.position.y = BEAM_HEIGHT / 2;
    this.group.add(this.beam);
    this.light = lighting.acquirePropLight();
    if (plinthTexture !== undefined) {
      this.plinth = new FloorSprite(true);
      this.plinth.setTexture(plinthTexture);
      this.plinth.place(0, 0, 16, 16, 0, PLINTH_HEIGHT);
      this.plinth.visible = true;
      this.group.add(this.plinth.mesh);
    } else {
      this.plinth = null;
    }
    this.group.visible = false;
  }

  sync(): void {
    const machine = this.sim.activeMachine;
    if (machine === null) {
      this.group.visible = false;
      if (this.light !== null) {
        this.light.intensity = 0;
      }
      return;
    }
    this.group.visible = true;
    const tint = machine.broken ? ENTITY_PALETTE.machineBrokenTint : ENTITY_PALETTE.machineTint;
    this.beam.material.color.setHex(tint);
    if (this.light !== null) {
      this.light.color.setHex(tint);
      this.light.intensity = machine.broken ? 150 : 500;
      this.light.position.set(machine.x, BEAM_HEIGHT / 2, machine.y);
    }
    if (this.plinth !== null) {
      this.plinth.tint = tint;
    }
    this.group.position.set(machine.x, 0, machine.y);
  }

  /** The machine's world position, or null when there is none in the room. */
  worldPosition(): { x: number; height: number; z: number } | null {
    if (!this.group.visible) {
      return null;
    }
    return { x: this.group.position.x, height: BEAM_HEIGHT * 0.5, z: this.group.position.z };
  }

  destroy(): void {
    this.beam.geometry.dispose();
    this.beam.material.dispose();
    this.plinth?.dispose();
    this.lighting.releasePropLight(this.light);
    this.group.removeFromParent();
  }
}
