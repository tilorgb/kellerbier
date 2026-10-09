import { Group } from 'three';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { enemyRampLine, type EnemyRampLineInfo } from '../sim/systems/enemy.js';
import { buildRampTextures, rampLook, type RampTextures } from './ramp-art.js';
import { Billboard } from './world/billboard.js';

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
 * Each ramp is a 2D billboard like every other thing standing in the room, and
 * wears the drawing for the way its high edge points on screen (`rampLook`):
 * a profile (mirrored for the left-pointing one) along a horizontal line, the
 * plank face or the sloped deck along a vertical one. Rising and sinking
 * squashes the sprite up from its feet.
 */
/** How much of the gap to its target height a ramp closes each frame: a quick rise, a slower sink. */
const RISE_EASE = 0.18;
const SINK_EASE = 0.1;
/** Below this a sunk ramp is not drawn at all. */
const HIDDEN_BELOW = 0.02;

interface Ramp {
  readonly sprite: Billboard;
  height: number;
  target: number;
  x: number;
  y: number;
}

export class RampView {
  readonly group = new Group();

  private readonly ramps: Ramp[] = [];
  private readonly textures: RampTextures;
  private readonly scratch: EnemyRampLineInfo = { startX: 0, startY: 0, farX: 0, farY: 0, rise: 0 };
  private lean = 0;

  constructor(textures: RampTextures = buildRampTextures()) {
    this.textures = textures;
  }

  setLean(lean: number): void {
    this.lean = lean;
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
      this.place(used, startX, startY, -alongX, -alongY, rise);
      this.place(used + 1, farX, farY, alongX, alongY, rise);
      used += 2;
    }
    for (const ramp of this.ramps) {
      const ease = ramp.target > ramp.height ? RISE_EASE : SINK_EASE;
      ramp.height += (ramp.target - ramp.height) * ease;
      const visible = ramp.height > HIDDEN_BELOW;
      ramp.sprite.mesh.visible = visible;
      if (visible) {
        ramp.sprite.place(ramp.x, 0, ramp.y, this.lean, 1, ramp.height);
      }
    }
  }

  private place(slot: number, x: number, y: number, dx: number, dy: number, rise: number): void {
    const ramp = this.rampAt(slot);
    ramp.target = rise;
    ramp.x = x;
    ramp.y = y;
    const look = rampLook(dx, dy);
    ramp.sprite.setTexture(this.textures[look.view], look.mirror);
  }

  private rampAt(slot: number): Ramp {
    const existing = this.ramps[slot];
    if (existing !== undefined) {
      return existing;
    }
    const sprite = new Billboard();
    this.group.add(sprite.mesh);
    const created: Ramp = { sprite, height: 0, target: 0, x: 0, y: 0 };
    this.ramps[slot] = created;
    return created;
  }

  destroy(): void {
    for (const ramp of this.ramps) {
      ramp.sprite.dispose();
    }
    this.group.removeFromParent();
  }
}
