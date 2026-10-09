import { Group } from 'three';
import { PLAYER_FOOTPRINT, type GameSim } from '../sim/game/sim.js';
import { PromilleTier } from '../sim/game/promille.js';
import { lerp } from '../sim/math.js';
import { createStatusLook, readStatusLook } from './status-look.js';
import { mixColor } from './entities.js';
import {
  AnimationState,
  ClipStateResolver,
  clipFrameAt,
  clipHasEnded,
  type AnimationStateIndex,
  type CompiledAnimationSet,
} from './animation/definition.js';
import { MAX_FRAME_DELTA_MS } from './animation/animator.js';
import {
  PlayerFacing,
  resolvePlayerAnimationState,
  resolvePlayerHeading,
  schlauchOctant,
  type PlayerFacingIndex,
  type PlayerHeading,
} from './animation/state.js';
import type { Texture } from './gfx/index.js';
import { BLUTWURZ_SPIRIT_TINT, SNEEZE_GLOW_TINT, STATUS_MARK_GLOW } from './palette.js';
import { HAT_ANCHORS } from './hat-anchors.js';
import { SCHLAUCH_OCTANTS, type PlayerArt, type PlayerBodyKey } from './player-art.js';
import { ACTOR_PIXELS_PER_UNIT } from './resolution.js';
import { Billboard } from './world/billboard.js';

/** Authored pixels a worn hat sprite sinks below the old hat's bottom edge, so nothing of the felt peeks out. */
const HAT_SINK = 1;
/** Room units the hat sits in front of the body quad. */
const HAT_FORWARD = 0.06;

/**
 * Alois: a four-way body and the Schlauch he shoots from, two billboards
 * standing at his footprint.
 *
 * ## What the hose does in 3D
 *
 * In the 2D renderer the nozzle was re-sorted in front of or behind the body
 * by hand as the aim swung past north. Here the nozzle sits a little in front
 * of the body along the view direction whenever it should be in front, and a
 * little behind when the aim points away, and the depth buffer does the rest.
 *
 * ## What stayed exactly as it was
 *
 * The body direction and mirror (`resolvePlayerHeading`), the drunk strips
 * from `DRUNK_FROM_TIER` up — read off the tier, not the drift, so turning
 * drift off for accessibility does not sober him up — the sober strip for a
 * flinch or a death, the poison and Blutwurz spirit tints, the nozzle's
 * firing frame and its recoil. All of it is the same simulation state read
 * by the same functions.
 */
const SCHLAUCH_ANCHOR: Readonly<Record<PlayerFacingIndex, { x: number; y: number }>> = {
  [PlayerFacing.South]: { x: 6, y: 4 },
  [PlayerFacing.North]: { x: -6, y: 4 },
  [PlayerFacing.Side]: { x: 5, y: 4 },
};

const FIRING_TICKS = 6;
const RECOIL_TICKS = 3;
const RECOIL_PIXELS = 1;
const SCHLAUCH_REACH = 4;
const DRUNK_FROM_TIER = PromilleTier.Beduselt;
const SOBER_KEYS: Readonly<Record<PlayerFacingIndex, PlayerBodyKey>> = {
  [PlayerFacing.South]: 'south',
  [PlayerFacing.North]: 'north',
  [PlayerFacing.Side]: 'side',
};
const DRUNK_KEYS: Readonly<Record<PlayerFacingIndex, PlayerBodyKey>> = {
  [PlayerFacing.South]: 'drunk-south',
  [PlayerFacing.North]: 'drunk-north',
  [PlayerFacing.Side]: 'drunk-side',
};
/**
 * The sneeze blink (#396): how fast it pulses when a build-up has just begun
 * and when it is about to go, in radians per millisecond, and how bright the
 * pulse's trough and peak are. Through the inhale it stops pulsing and holds
 * the peak — the held breath is the one moment that should not flicker.
 */
const SNEEZE_PULSE_SLOW = 0.012;
const SNEEZE_PULSE_FAST = 0.05;
const SNEEZE_GLOW_MIN = 0.03;
/** How hard the flare's mark glows (#40) — plainly visible, under the sneeze's peak. */
const MARK_GLOW_STRENGTH = 0.45;
const SNEEZE_GLOW_MAX = 0.22;
/**
 * Where a strip keeps the lids-shut twin of a frame (#396,
 * `tools/art/authoring/alois.mjs`): the sober strip's idle and two walk
 * contacts at 8-10 (its own blink frame, 1, is already shut), the drunk
 * strip's four poses again at 4-7. A frame with no twin — a flinch, a death —
 * maps to itself.
 */
const SOBER_SNEEZE_FRAMES: readonly number[] = [8, 1, 9, 10];
const DRUNK_SNEEZE_OFFSET = 4;
/** How far in front of (or behind) the body the nozzle sits along the view direction, in room units. */
const SCHLAUCH_DEPTH = 0.8;

export class PlayerView {
  readonly group = new Group();

  private readonly art: PlayerArt;
  private readonly body = new Billboard();
  private readonly statusLook = createStatusLook();
  private readonly schlauch = new Billboard();
  /** The worn hat item (`ItemDefinition.hat`), drawn over wherever Alois's own hat is in this frame. */
  private readonly hat = new Billboard();
  private readonly clipStates = new ClipStateResolver();
  private facing: PlayerFacingIndex = PlayerFacing.South;
  private mirror = 1;
  private readonly heading: PlayerHeading = { facing: PlayerFacing.South, mirror: 1 };
  private requested: AnimationStateIndex = AnimationState.Idle;
  private playing: AnimationStateIndex = AnimationState.Idle;
  private elapsedMs = 0;
  private lastNowMs: number | null = null;
  private lean = 0;
  private sneezePhase = 0;
  private x = 0;
  private y = 0;

  frame = 0;
  schlauchFrame = 0;
  private drunk = false;

  constructor(art: PlayerArt) {
    this.art = art;
    const south = art.body.south.frames[0];
    if (south !== undefined) {
      this.body.setTexture(south);
    }
    const nozzle = art.schlauch.frames[0];
    if (nozzle !== undefined) {
      this.schlauch.setTexture(nozzle);
    }
    this.schlauch.castShadow = false;
    this.hat.castShadow = false;
    // The body's own quad sits a hair behind the hat and would shade it black.
    this.hat.mesh.receiveShadow = false;
    this.body.visible = true;
    this.schlauch.visible = true;
    this.group.add(this.body.mesh, this.schlauch.mesh, this.hat.mesh);
  }

  setLean(lean: number): void {
    this.lean = lean;
  }

  /** Where he stands, in room units — the camera follows this and the lantern hangs over it. */
  get positionX(): number {
    return this.x;
  }

  get positionY(): number {
    return this.y;
  }

  /** His feet, for anything that projects him to the screen. */
  get footZ(): number {
    return this.y + PLAYER_FOOTPRINT;
  }

  get playingState(): AnimationStateIndex {
    return this.playing;
  }

  get bodyKey(): PlayerBodyKey {
    return this.keyFor(this.facing, this.drunk);
  }

  get bodyTexture(): Texture | null {
    return this.body.texture;
  }

  sync(sim: GameSim, alpha: number, nowMs: number): void {
    const deltaMs =
      this.lastNowMs === null
        ? 0
        : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, nowMs - this.lastNowMs));
    this.lastNowMs = nowMs;

    const index = sim.playerIndex;
    this.x = lerp(sim.previousX(index), sim.positionX(index), alpha);
    this.y = lerp(sim.previousY(index), sim.positionY(index), alpha);

    if (resolvePlayerHeading(sim, this.heading)) {
      this.facing = this.heading.facing;
      this.mirror = this.heading.mirror;
    }
    const state = resolvePlayerAnimationState(sim);
    this.drunk =
      sim.promilleTier >= DRUNK_FROM_TIER &&
      state !== AnimationState.Hurt &&
      state !== AnimationState.Death;
    const strip = this.art.body[this.keyFor(this.facing, this.drunk)];
    this.advance(strip.clips, state, deltaMs);
    const clip = strip.clips.clips[this.playing] ?? strip.clips.idle;
    this.frame = clipFrameAt(clip, this.elapsedMs);
    if (sim.sneezeBuildUp > 0) {
      this.frame = this.drunk
        ? this.frame + DRUNK_SNEEZE_OFFSET
        : (SOBER_SNEEZE_FRAMES[this.frame] ?? this.frame);
    }
    const frame = strip.frames[this.frame];
    if (frame !== undefined) {
      this.body.setTexture(frame, this.mirror);
    }
    this.body.place(this.x, 0.2, this.footZ, this.lean);

    const look = readStatusLook(sim, index, nowMs, this.statusLook);
    const spiritTint = sim.blutwurzActive
      ? BLUTWURZ_SPIRIT_TINT
      : look.tint >= 0
        ? mixColor(0xffffff, look.tint, look.mix)
        : 0xffffff;
    this.body.tint = spiritTint;
    this.schlauch.tint = spiritTint;
    const flashing = sim.playerHurtTick >= 0 && sim.tick - sim.playerHurtTick < 3;
    const buildUp = sim.sneezeBuildUp;
    if (flashing || buildUp <= 0) {
      this.sneezePhase = 0;
      this.body.flash = flashing;
      // Marked by a flare (#40): a steady pink glow for as long as the mark
      // burns, emissive so a dark room cannot hide what every enemy can see.
      if (!flashing && sim.playerMarked > 0) {
        this.body.setGlow(STATUS_MARK_GLOW, MARK_GLOW_STRENGTH);
      } else if (!flashing && !sim.blutwurzActive && look.glowStrength > 0) {
        this.body.setGlow(look.glow, look.glowStrength);
      }
    } else {
      this.sneezePhase += deltaMs * lerp(SNEEZE_PULSE_SLOW, SNEEZE_PULSE_FAST, buildUp);
      const pulse = buildUp >= 1 ? 1 : Math.sin(this.sneezePhase) * 0.5 + 0.5;
      this.body.setGlow(SNEEZE_GLOW_TINT, lerp(SNEEZE_GLOW_MIN, SNEEZE_GLOW_MAX, pulse * buildUp));
    }

    this.syncSchlauch(sim);
    this.syncHat(sim, strip.frames[this.frame], spiritTint, flashing);
  }

  /** Table lookup, not a template string: this runs every frame and a fresh string is garbage. */
  private keyFor(facing: PlayerFacingIndex, drunk: boolean): PlayerBodyKey {
    return (drunk ? DRUNK_KEYS : SOBER_KEYS)[facing];
  }

  private advance(set: CompiledAnimationSet, state: AnimationStateIndex, deltaMs: number): void {
    if (this.requested !== state) {
      this.requested = state;
      this.playing = this.clipStates.resolve(set, state);
      this.elapsedMs = 0;
    } else {
      this.elapsedMs += deltaMs;
      this.playing = this.clipStates.resolve(set, this.playing);
    }
    const clip = set.clips[this.playing] ?? set.idle;
    if (!clip.holds && clipHasEnded(clip, this.elapsedMs)) {
      this.elapsedMs -= clip.totalMs;
      this.playing = AnimationState.Idle;
    }
  }

  /**
   * Covers Alois's own hat with the held hat item's sprite. Where the felt sits in
   * each frame is `HAT_ANCHORS` (generated from the strips, `tools/art/hat-anchors.mjs`):
   * the sprite's bottom-centre goes there, sunk `HAT_SINK` pixels so a brim's corner
   * never peeks out underneath.
   */
  private syncHat(sim: GameSim, frame: Texture | undefined, tint: number, flashing: boolean): void {
    const key = sim.activeHat();
    const texture = key === undefined ? undefined : this.art.hats[key];
    const anchor = HAT_ANCHORS[this.keyFor(this.facing, this.drunk)]?.[this.frame];
    if (texture === undefined || anchor === undefined || frame === undefined || sim.playerDead) {
      this.hat.visible = false;
      return;
    }
    this.hat.setTexture(texture, this.mirror);
    this.hat.visible = true;
    this.hat.tint = tint;
    this.hat.flash = flashing;
    const frameWidth = frame.displayWidth;
    const frameHeight = frame.displayHeight;
    const sideways = ((anchor[0] - frameWidth / 2) * this.mirror) / ACTOR_PIXELS_PER_UNIT;
    // Up the face of the body quad from its feet: the anchor row is counted from the frame's top.
    const up = (frameHeight - anchor[1] - HAT_SINK) / ACTOR_PIXELS_PER_UNIT;
    const upY = Math.cos(this.lean);
    const upZ = Math.sin(this.lean);
    // A hair in front of the body, along the quad's normal, so the hat always wins the depth test.
    const normalY = -Math.sin(this.lean);
    const normalZ = Math.cos(this.lean);
    this.hat.place(
      this.x + sideways,
      0.2 + up * upY + HAT_FORWARD * normalY,
      this.footZ + up * upZ + HAT_FORWARD * normalZ,
      this.lean,
    );
  }

  private syncSchlauch(sim: GameSim): void {
    const aimX = sim.aimDirectionX;
    const aimY = sim.aimDirectionY;
    const sinceShot = sim.lastShotTick < 0 ? Number.POSITIVE_INFINITY : sim.tick - sim.lastShotTick;
    const firing = sinceShot < FIRING_TICKS;
    const octant = schlauchOctant(aimX, aimY);
    this.schlauchFrame = firing ? SCHLAUCH_OCTANTS + octant : octant;
    const frame = this.art.schlauch.frames[this.schlauchFrame];
    if (frame !== undefined) {
      this.schlauch.setTexture(frame);
    }
    this.schlauch.visible = !sim.playerDead;

    // The authored nozzle offset is in sprite pixels from the body's centre;
    // on the billboard that is sideways along the quad and up its face.
    const anchor = SCHLAUCH_ANCHOR[this.facing];
    const reach = SCHLAUCH_REACH - (sinceShot < RECOIL_TICKS ? RECOIL_PIXELS : 0);
    const nozzleX = (anchor.x * this.mirror + aimX * reach) / ACTOR_PIXELS_PER_UNIT;
    const bodyHeight = this.body.heightUnits;
    const nozzleUp = bodyHeight / 2 - (anchor.y + aimY * reach) / ACTOR_PIXELS_PER_UNIT;
    const nozzleHeight =
      this.schlauch.texture === null
        ? 0
        : this.schlauch.texture.displayHeight / ACTOR_PIXELS_PER_UNIT;
    // Along the leaning quad: "up" the face is (cos lean, -sin lean) in (y, z).
    const upY = Math.cos(this.lean);
    const upZ = Math.sin(this.lean);
    const forward = aimY < 0 ? -SCHLAUCH_DEPTH : SCHLAUCH_DEPTH;
    // The quad's normal points at the camera: (sin elevation, cos elevation) = (-sin lean, cos lean) in (y, z).
    const normalY = -Math.sin(this.lean);
    const normalZ = Math.cos(this.lean);
    const along = nozzleUp - nozzleHeight / 2;
    this.schlauch.place(
      this.x + nozzleX,
      0.2 + along * upY + forward * normalY,
      this.footZ + along * upZ + forward * normalZ,
      this.lean,
    );
  }

  destroy(): void {
    this.body.dispose();
    this.schlauch.dispose();
    this.hat.dispose();
    this.group.removeFromParent();
  }
}
