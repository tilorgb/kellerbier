import { Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import { lobbedBombFlight, type LobbedBombFlight } from '../sim/systems/enemy.js';

/**
 * A Böllerschmeißer's lobbed keg in flight.
 *
 * The 2D renderer faked the throw with a sine bump on the sprite's y, and
 * said so in its own comment: "this engine has no height axis a real
 * 'thrown' sprite could hang a z-offset on". It has one now. The keg is a
 * small dark sphere that rises `ARC_HEIGHT` above the floor at the top of its
 * arc and comes down where `lobbedBombFlight` says it lands — the landing
 * marker on the floor (`EntityView`'s ground telegraph) is what the player
 * dodges; this is what tells them why.
 */
const BOMB_BODY = 0x1c1a20;
const FUSE_SPARK = 0xffb347;
const BOMB_RADIUS = 4;
const ARC_HEIGHT = 22;

export class BombFlightView {
  readonly group = new Group();

  private readonly bombs: Mesh<SphereGeometry, MeshStandardMaterial>[] = [];
  private readonly scratch: LobbedBombFlight = {
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    progress: 0,
  };

  sync(sim: GameSim): void {
    const world = sim.world;
    const states = world.states;
    const masks = world.masks;
    const required = sim.enemyMask;
    const highWater = world.highWater;
    const scratch = this.scratch;
    let used = 0;
    for (let index = 0; index < highWater; index++) {
      if (states[index] !== World.ALIVE) {
        continue;
      }
      if (((masks[index] ?? 0) & required) !== required) {
        continue;
      }
      if (!lobbedBombFlight(sim, index, scratch)) {
        continue;
      }
      const bomb = this.bombAt(used);
      used += 1;
      bomb.visible = true;
      const t = scratch.progress;
      bomb.position.set(
        lerp(scratch.startX, scratch.endX, t),
        BOMB_RADIUS + Math.sin(Math.PI * t) * ARC_HEIGHT,
        lerp(scratch.startY, scratch.endY, t),
      );
      // The fuse spark: brighter as it comes down.
      bomb.material.emissiveIntensity = 0.3 + t * 0.7;
    }
    for (let slot = used; slot < this.bombs.length; slot++) {
      const bomb = this.bombs[slot];
      if (bomb !== undefined) {
        bomb.visible = false;
      }
    }
  }

  private bombAt(slot: number): Mesh<SphereGeometry, MeshStandardMaterial> {
    const existing = this.bombs[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Mesh(
      new SphereGeometry(BOMB_RADIUS, 10, 8),
      new MeshStandardMaterial({
        color: BOMB_BODY,
        roughness: 0.7,
        emissive: FUSE_SPARK,
        emissiveIntensity: 0.3,
      }),
    );
    created.castShadow = true;
    this.bombs[slot] = created;
    this.group.add(created);
    return created;
  }

  destroy(): void {
    for (const bomb of this.bombs) {
      bomb.geometry.dispose();
      bomb.material.dispose();
    }
    this.group.removeFromParent();
  }
}
