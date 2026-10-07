import { Group } from 'three';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import {
  ORDNER_ACTIVE,
  ORDNER_DIRECTION,
  ORDNER_FACING,
  ORDNER_NORTH,
  ORDNER_PREV_X,
  ORDNER_PREV_Y,
  ORDNER_RADIUS,
  ORDNER_SHOVE_POSE,
  ORDNER_SIDE,
  ORDNER_SOUTH,
  ORDNER_X,
  ORDNER_Y,
} from '../sim/systems/ordner.js';
import { AUTHORED_FACING } from './animation/state.js';
import type { AnimatedSpriteSet } from './floor-art.js';
import { Billboard } from './world/billboard.js';

/** Frames of each strip (`tools/art/authoring/ordner.mjs`): standing, a step on each foot, the shove. */
const FRAME_STAND = 0;
const FRAME_SHOVE = 3;
/** The walk: step, stand, other step, stand. */
const WALK_FRAMES = [1, 0, 2, 0] as const;
const WALK_FRAME_MS = 100;
/** Below this, in room units per tick, he is standing still. */
const MOVING = 0.05;

/** The strip names he is drawn from, in `common/characters/` — what `GameView` asks the art for. */
export const ORDNER_STRIP_NAMES = {
  side: 'der-ordner-side',
  south: 'der-ordner-south',
  north: 'der-ordner-north',
} as const;

/** His three strips, by `ORDNER_DIRECTION`. */
export interface OrdnerStrips {
  readonly side: AnimatedSpriteSet | undefined;
  readonly south: AnimatedSpriteSet | undefined;
  readonly north: AnimatedSpriteSet | undefined;
}

/**
 * Der Ordner, the bouncer familiar (`sim/systems/ordner.ts`): one billboard
 * standing beside Alois while the item is held — walking when he walks,
 * throwing his fists forward on a shove, turned the way he is going: side-on
 * (mirrored for right), toward the camera or away, the same three strips
 * Alois has. Reads only `GameSim.ordner`; draws nothing until the item is
 * picked up.
 */
export class OrdnerView {
  readonly group = new Group();
  private readonly billboard = new Billboard();
  private lean = 0;

  constructor(private readonly strips: OrdnerStrips) {
    this.group.add(this.billboard.mesh);
  }

  setLean(lean: number): void {
    this.lean = lean;
  }

  sync(sim: GameSim, alpha: number, nowMs: number): void {
    const state = sim.ordner;
    const direction = state[ORDNER_DIRECTION] ?? ORDNER_SIDE;
    const strip =
      direction === ORDNER_SOUTH
        ? this.strips.south
        : direction === ORDNER_NORTH
          ? this.strips.north
          : this.strips.side;
    if ((state[ORDNER_ACTIVE] ?? 0) === 0 || strip === undefined) {
      this.billboard.visible = false;
      return;
    }
    const prevX = state[ORDNER_PREV_X] ?? 0;
    const prevY = state[ORDNER_PREV_Y] ?? 0;
    const nowX = state[ORDNER_X] ?? 0;
    const nowY = state[ORDNER_Y] ?? 0;
    const moving = Math.abs(nowX - prevX) > MOVING || Math.abs(nowY - prevY) > MOVING;
    const frame =
      (state[ORDNER_SHOVE_POSE] ?? 0) > 0
        ? FRAME_SHOVE
        : moving
          ? (WALK_FRAMES[Math.floor(nowMs / WALK_FRAME_MS) % WALK_FRAMES.length] ?? FRAME_STAND)
          : FRAME_STAND;
    const texture = strip.frames[frame] ?? strip.frames[FRAME_STAND];
    if (texture === undefined) {
      this.billboard.visible = false;
      return;
    }
    // Only the side strip mirrors; the front and back are drawn as authored.
    const facing = state[ORDNER_FACING] ?? AUTHORED_FACING;
    const mirror = direction === ORDNER_SIDE && facing !== AUTHORED_FACING ? -1 : 1;
    this.billboard.visible = true;
    this.billboard.setTexture(texture, mirror);
    this.billboard.place(
      lerp(prevX, nowX, alpha),
      0.2,
      lerp(prevY, nowY, alpha) + ORDNER_RADIUS,
      this.lean,
    );
  }

  destroy(): void {
    this.billboard.dispose();
    this.group.removeFromParent();
  }
}
