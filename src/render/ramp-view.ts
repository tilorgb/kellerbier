import { ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape } from 'three';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { enemyRampLine, type EnemyRampLineInfo } from '../sim/systems/enemy.js';

/**
 * The two ramps of a Waldradler charge (#412): wooden wedges at either end of
 * the line he is about to ride, rising out of the floor over the telegraph and
 * sinking back once the line is done.
 *
 * Purely a telegraph and a set piece — the sim knows only the line's two ends
 * and how far up the ramps are (`enemyRampLine`); nothing here is solid and
 * nothing here can be hit. They stay up through both passes on purpose: where he
 * will come back in is the ramp he jumped from.
 *
 * Placeholder art, like the boss: untextured wood-coloured geometry until the
 * ramp design is signed off (`CLAUDE.md`, "New pixel art needs sign-off").
 */
const RAMP_WOOD = 0x7a5230;
const RAMP_LENGTH = 22;
const RAMP_WIDTH = 30;
const RAMP_HEIGHT = 11;
/** How much of the gap to its target height a ramp closes each frame: a quick rise, a slower sink. */
const RISE_EASE = 0.18;
const SINK_EASE = 0.1;
/** Below this a sunk ramp is not drawn at all. */
const HIDDEN_BELOW = 0.02;

interface Ramp {
  readonly mesh: Mesh<ExtrudeGeometry, MeshStandardMaterial>;
  height: number;
  target: number;
}

export class RampView {
  readonly group = new Group();

  private readonly ramps: Ramp[] = [];
  private readonly geometry: ExtrudeGeometry;
  private readonly scratch: EnemyRampLineInfo = { startX: 0, startY: 0, farX: 0, farY: 0, rise: 0 };

  constructor() {
    // A triangle in the x/y plane, high edge at +x, extruded across the ride.
    const shape = new Shape();
    shape.moveTo(-RAMP_LENGTH / 2, 0);
    shape.lineTo(RAMP_LENGTH / 2, 0);
    shape.lineTo(RAMP_LENGTH / 2, RAMP_HEIGHT);
    shape.closePath();
    this.geometry = new ExtrudeGeometry(shape, { depth: RAMP_WIDTH, bevelEnabled: false });
    this.geometry.translate(0, 0, -RAMP_WIDTH / 2);
  }

  sync(sim: GameSim): void {
    for (const ramp of this.ramps) {
      ramp.target = 0;
    }
    const world = sim.world;
    const states = world.states;
    const masks = world.masks;
    const required = sim.enemyMask;
    let used = 0;
    for (let index = 0; index < world.highWater; index++) {
      if (states[index] !== World.ALIVE || ((masks[index] ?? 0) & required) !== required) {
        continue;
      }
      if (!enemyRampLine(sim, index, this.scratch)) {
        continue;
      }
      const { startX, startY, farX, farY, rise } = this.scratch;
      // Each ramp rises toward the wall it stands against.
      const alongX = farX - startX;
      const alongY = farY - startY;
      const startAngle = Math.atan2(-alongY, -alongX);
      const farAngle = Math.atan2(alongY, alongX);
      this.place(used, startX, startY, startAngle, rise);
      this.place(used + 1, farX, farY, farAngle, rise);
      used += 2;
    }
    for (const ramp of this.ramps) {
      const ease = ramp.target > ramp.height ? RISE_EASE : SINK_EASE;
      ramp.height += (ramp.target - ramp.height) * ease;
      ramp.mesh.visible = ramp.height > HIDDEN_BELOW;
      ramp.mesh.scale.y = Math.max(0.001, ramp.height);
    }
  }

  private place(slot: number, x: number, y: number, angle: number, rise: number): void {
    const ramp = this.rampAt(slot);
    ramp.target = rise;
    // Sim angles turn x toward y (down the screen); three's y-rotation turns x toward -z.
    ramp.mesh.position.set(x, 0, y);
    ramp.mesh.rotation.y = -angle;
  }

  private rampAt(slot: number): Ramp {
    const existing = this.ramps[slot];
    if (existing !== undefined) {
      return existing;
    }
    const mesh = new Mesh(
      this.geometry,
      new MeshStandardMaterial({ color: RAMP_WOOD, roughness: 0.9 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    this.group.add(mesh);
    const created: Ramp = { mesh, height: 0, target: 0 };
    this.ramps[slot] = created;
    return created;
  }

  destroy(): void {
    this.geometry.dispose();
    for (const ramp of this.ramps) {
      ramp.mesh.material.dispose();
    }
    this.group.removeFromParent();
  }
}
