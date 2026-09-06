import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, PointLight, DoubleSide } from 'three';
import type { GameSim } from '../sim/game/sim.js';
import type { Texture } from './gfx/index.js';
import { ENTITY_PALETTE } from './palette.js';
import { Billboard } from './world/billboard.js';
import { FloorSprite, PLINTH_HEIGHT } from './world/flat.js';

/**
 * Item pedestals: a plinth on the floor, a beam of light standing on it in
 * the item's quality colour, and the item bobbing in the beam.
 *
 * The beam used to be a stretched translucent sprite; here it is a
 * translucent cylinder with a point light in it, so the item is lit by its
 * own quality colour and so is the floor around the plinth — a treasure room
 * glows before the player has read what is in it. The bob is unchanged: a
 * sine on the tick with a phase from the pedestal's position, so two pedestals
 * never lock step.
 */
const BEAM_RADIUS = 5;
const BEAM_HEIGHT = 26;
const BEAM_ALPHA = 0.3;
const ITEM_HEIGHT = BEAM_HEIGHT * 0.6;

interface PedestalSlot {
  readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  readonly light: PointLight;
  readonly item: Billboard;
  readonly plinth: FloorSprite | null;
  readonly group: Group;
}

export class PedestalView {
  readonly group = new Group();

  private readonly sim: GameSim;
  private readonly itemTexture: Texture;
  private readonly plinthTexture: Texture | undefined;
  private readonly slots: PedestalSlot[] = [];
  private readonly slotForPedestal: number[] = [];
  private lean = 0;

  constructor(sim: GameSim, itemTexture: Texture, plinthTexture?: Texture) {
    this.sim = sim;
    this.itemTexture = itemTexture;
    this.plinthTexture = plinthTexture;
  }

  setLean(lean: number): void {
    this.lean = lean;
  }

  sync(): void {
    const sim = this.sim;
    const tuning = sim.tuning.itemPool;
    const pedestals = sim.activePedestals;
    let used = 0;
    this.slotForPedestal.length = pedestals.length;
    for (const [index, pedestal] of pedestals.entries()) {
      if (pedestal.itemIndex < 0) {
        this.slotForPedestal[index] = -1;
        continue;
      }
      const item = sim.items.at(pedestal.itemIndex);
      const tint = ENTITY_PALETTE.itemQualityTints[item.quality] ?? ENTITY_PALETTE.normalTint;
      const slot = this.slotAt(used);
      this.slotForPedestal[index] = used;
      used += 1;
      slot.group.visible = true;
      slot.group.position.set(pedestal.x, 0, pedestal.y);
      slot.beam.material.color.setHex(tint);
      slot.light.color.setHex(tint);
      const period = Math.max(1, tuning.bobPeriodTicks);
      const phase = ((pedestal.x + pedestal.y) / period) * Math.PI * 2;
      const bob = Math.sin((sim.tick / period) * Math.PI * 2 + phase) * tuning.bobAmplitude;
      slot.item.tint = tint;
      slot.item.place(0, ITEM_HEIGHT + bob, 0, this.lean);
    }
    for (let index = used; index < this.slots.length; index++) {
      const slot = this.slots[index];
      if (slot !== undefined) {
        slot.group.visible = false;
      }
    }
  }

  /** The item's world position, for the name plate the HUD hangs over it — or null when the pedestal is empty. */
  itemWorldPosition(pedestalIndex: number): { x: number; height: number; z: number } | null {
    const at = this.slotForPedestal[pedestalIndex];
    if (at === undefined || at < 0) {
      return null;
    }
    const slot = this.slots[at];
    if (slot === undefined || !slot.group.visible) {
      return null;
    }
    return {
      x: slot.group.position.x,
      height: slot.item.mesh.position.y + slot.item.heightUnits,
      z: slot.group.position.z,
    };
  }

  private slotAt(index: number): PedestalSlot {
    const existing = this.slots[index];
    if (existing !== undefined) {
      return existing;
    }
    const group = new Group();
    const beam = new Mesh(
      new CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 12, 1, true),
      new MeshBasicMaterial({
        transparent: true,
        opacity: BEAM_ALPHA,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    );
    beam.position.y = BEAM_HEIGHT / 2;
    group.add(beam);
    const light = new PointLight(0xffffff, 600, 90, 2);
    light.position.y = BEAM_HEIGHT * 0.5;
    group.add(light);
    const item = new Billboard();
    item.setTexture(this.itemTexture);
    item.visible = true;
    item.castShadow = false;
    group.add(item.mesh);
    let plinth: FloorSprite | null = null;
    if (this.plinthTexture !== undefined) {
      plinth = new FloorSprite(true);
      plinth.setTexture(this.plinthTexture);
      plinth.place(0, 0, 16, 16, 0, PLINTH_HEIGHT);
      plinth.visible = true;
      group.add(plinth.mesh);
    }
    this.group.add(group);
    const slot: PedestalSlot = { beam, light, item, plinth, group };
    this.slots.push(slot);
    return slot;
  }

  destroy(): void {
    for (const slot of this.slots) {
      slot.beam.geometry.dispose();
      slot.beam.material.dispose();
      slot.item.dispose();
      slot.plinth?.dispose();
    }
    this.group.removeFromParent();
  }
}
