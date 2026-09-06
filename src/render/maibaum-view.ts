import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { GameSim } from '../sim/game/sim.js';

/**
 * Der Stier's Maibaum (#199): planted, a tall ceremonial pole with its wreath
 * and crown; held, a shorter splintered pole swung flat at the player.
 *
 * Both are built from primitives in the pole's own colours — the blue and
 * cream barber stripes are alternating bands of cylinder — rather than a
 * sprite, because a pole is the one object in the game that is genuinely a
 * 3D shape the player reads by its *angle*: the held pole's rotation about
 * the vertical is the swing's telegraph, and it is the same angle the hit
 * check reads (`sim.maibaumHeld.poleAngle`).
 *
 * The planted pole flushes on a hit, as before.
 */
const INK = 0x141216;
const POLE_BLUE = 0x3962af;
const POLE_CREAM = 0xe8e2d0;
const WREATH = 0x4f9a4a;
const WREATH_LIT = 0x74c46a;
const BASE_WOOD = 0x4a4451;
const HIT_FLUSH = 0xff8f7a;

const PLANTED_HEIGHT = 78;
const HELD_LENGTH = 40;

function stripedPole(length: number, radius: number, band: number): Group {
  const group = new Group();
  for (let y = 0; y < length; y += band) {
    const segment = new Mesh(
      new CylinderGeometry(radius, radius, Math.min(band, length - y), 8),
      new MeshStandardMaterial({
        color: Math.floor(y / band) % 2 === 0 ? POLE_BLUE : POLE_CREAM,
        roughness: 0.8,
      }),
    );
    segment.position.y = y + Math.min(band, length - y) / 2;
    segment.castShadow = true;
    group.add(segment);
  }
  return group;
}

function wreath(radius: number, y: number): Mesh {
  const ring = new Mesh(
    new TorusGeometry(radius, radius * 0.22, 6, 14),
    new MeshStandardMaterial({ color: WREATH, emissive: WREATH_LIT, emissiveIntensity: 0.25 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = y;
  return ring;
}

function buildPlanted(): Group {
  const group = new Group();
  const base = new Mesh(
    new CylinderGeometry(4.5, 6, 8, 8),
    new MeshStandardMaterial({ color: BASE_WOOD, roughness: 1 }),
  );
  base.position.y = 4;
  base.castShadow = true;
  group.add(base);
  const foot = new Mesh(
    new CylinderGeometry(6.5, 6.5, 1.5, 8),
    new MeshStandardMaterial({ color: INK, roughness: 1 }),
  );
  foot.position.y = 0.75;
  group.add(foot);
  group.add(stripedPole(PLANTED_HEIGHT, 2.5, 4));
  group.add(wreath(9, PLANTED_HEIGHT - 20));
  const crown = new Mesh(
    new SphereGeometry(3, 10, 8),
    new MeshStandardMaterial({ color: WREATH_LIT, emissive: WREATH_LIT, emissiveIntensity: 0.4 }),
  );
  crown.position.y = PLANTED_HEIGHT;
  group.add(crown);
  return group;
}

function buildHeld(): Group {
  const group = new Group();
  // Built along +y and turned flat: the sim's angle is in the floor plane.
  const pole = stripedPole(HELD_LENGTH, 1.5, 3);
  pole.add(wreath(4, HELD_LENGTH - 3));
  const tip = new Mesh(
    new SphereGeometry(2, 8, 6),
    new MeshStandardMaterial({ color: WREATH_LIT, emissive: WREATH_LIT, emissiveIntensity: 0.4 }),
  );
  tip.position.y = HELD_LENGTH;
  pole.add(tip);
  pole.rotation.z = -Math.PI / 2;
  group.add(pole);
  return group;
}

export class MaibaumView {
  readonly group = new Group();

  private readonly planted = buildPlanted();
  private readonly held = buildHeld();

  constructor() {
    this.group.add(this.planted, this.held);
    this.group.visible = false;
  }

  sync(sim: GameSim): void {
    const plantedAt = sim.maypolePlanted;
    const heldAt = plantedAt === null ? sim.maibaumHeld : null;
    this.planted.visible = plantedAt !== null;
    if (plantedAt !== null) {
      this.planted.position.set(plantedAt.x, 0, plantedAt.y);
      const flush = plantedAt.flash > 0;
      this.planted.traverse((object) => {
        if (object instanceof Mesh) {
          const material = (object as Mesh).material as MeshStandardMaterial;
          material.emissive.setHex(flush ? HIT_FLUSH : 0x000000);
        }
      });
    }
    this.held.visible = heldAt !== null;
    if (heldAt !== null) {
      // Swung at hip height; a sim angle measured with +y south is a negative turn about the vertical.
      this.held.position.set(heldAt.x, 6, heldAt.y);
      this.held.rotation.y = -heldAt.poleAngle;
    }
    this.group.visible = plantedAt !== null || heldAt !== null;
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
