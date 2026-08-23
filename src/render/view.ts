import { Container, Sprite, type Graphics, type Texture } from 'pixi.js';
import { ROOM_TRANSITION_TICKS, type GameSim } from '../sim/game/sim.js';
import type { RoomGeometry } from '../sim/room/geometry.js';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../sim/room/playground.js';
import { lerp } from '../sim/math.js';
import { DamageNumberView } from './damage-numbers.js';
import { DecalView } from './decals.js';
import { EntityView } from './entities.js';
import { ParticleView } from './particles.js';
import { ProjectileView } from './projectiles.js';
import { createDoorView, createRoomView } from './room.js';
import { WORLD_ZOOM } from './resolution.js';

/**
 * Where the player sprite's anchor sits in its texture.
 *
 * Measured off the art rather than assumed: the opaque pixels of `mass.png`
 * span x 2-12 and y 1-14 of a 16x16 texture, so the mug's centre is (7.5, 8).
 */
const PLAYER_ANCHOR_X = 7.5 / 16;
const PLAYER_ANCHOR_Y = 8 / 16;

export interface GameViewTextures {
  readonly player: Texture;
  readonly projectile: Texture;
  readonly entity: Texture;
  /** The entity shape in solid white, for the one-tick hit flash. */
  readonly entityFlash: Texture;
  /** The ring an enemy telegraphs an attack with. */
  readonly telegraph: Texture;
  readonly foam: Texture;
  readonly splash: Texture;
  readonly decal: Texture;
  /** Font family for damage numbers. */
  readonly numberFont: string;
}

/**
 * The scene graph for one running game.
 *
 * Reads simulation state and writes sprite positions. It never writes back —
 * the arrow only ever points this way, which is what keeps the simulation
 * headless and the renderer replaceable.
 *
 * `sync` runs once per rendered frame, which on a 144 Hz display is more often
 * than the simulation ticks, so positions are interpolated between the previous
 * and current tick rather than snapped.
 */
export class GameView {
  readonly stage = new Container();

  /** The container everything in the room lives in. The overlay draws into it. */
  get worldLayer(): Container {
    return this.world;
  }

  private readonly sim: GameSim;
  private readonly player: Sprite;
  private readonly projectiles: ProjectileView;
  private readonly entities: EntityView;
  private readonly particles: ParticleView;
  private readonly decals: DecalView;
  private readonly damageNumbers: DamageNumberView;
  private roomGeometry: RoomGeometry;
  private roomView: Container;
  private doorView: Graphics;
  private doorsLocked: boolean;

  /**
   * Everything the camera shakes.
   *
   * The room, the bodies and the effects all sit inside one container that is
   * offset each frame. The HUD does not, because a health bar that slides
   * around when the player takes a hit is the fastest way to make shake
   * unbearable.
   */
  private readonly world = new Container();

  /**
   * Free-camera offset, in pixels.
   *
   * Zero in a normal run. The debug overlay drives it so a scene can be looked
   * at from outside the room — which is how a collider sitting where nothing is
   * drawn gets found.
   */
  cameraX = 0;
  cameraY = 0;

  constructor(sim: GameSim, textures: GameViewTextures) {
    this.sim = sim;
    this.stage.addChild(this.world);
    // The room is authored at half the internal resolution and blown up here,
    // which is the whole of the camera for now. Scaling the container rather
    // than every sprite keeps the debug overlay's world layer — hitboxes, the
    // broadphase grid — lined up with what it is drawing over for free.
    this.world.scale.set(WORLD_ZOOM);
    this.roomGeometry = sim.room;
    this.roomView = createRoomView(sim.room);
    this.world.addChild(this.roomView);
    this.doorsLocked = sim.doorsLocked;
    this.doorView = createDoorView(sim.room, sim.doors, this.doorsLocked);
    this.world.addChild(this.doorView);

    this.decals = new DecalView(sim.decals, textures.decal);
    this.world.addChild(this.decals.container);

    this.entities = new EntityView(sim, textures.entity, textures.entityFlash, textures.telegraph);
    this.world.addChild(this.entities.container);

    this.player = new Sprite(textures.player);
    // Not 0.5. The mug is drawn across columns 2-12 of a 16px texture, so its
    // centre is at 7.5 and a centred anchor hangs the art half a pixel left of
    // the body it belongs to. Half a pixel was invisible before the room was
    // zoomed; at 2x it is a whole screen pixel of the collider poking out on
    // one side and a gap on the other.
    this.player.anchor.set(PLAYER_ANCHOR_X, PLAYER_ANCHOR_Y);
    this.world.addChild(this.player);

    this.projectiles = new ProjectileView(sim.projectiles, textures.projectile);
    this.world.addChild(this.projectiles.container);

    this.particles = new ParticleView(sim.particles, {
      foam: textures.foam,
      splash: textures.splash,
    });
    this.world.addChild(this.particles.container);

    this.damageNumbers = new DamageNumberView(sim.damageNumbers, textures.numberFont);
    this.world.addChild(this.damageNumbers.container);
  }

  /**
   * `alpha` is the fraction of a tick elapsed since the last simulation step.
   *
   * `outerZoom` is the whole-number scale `main.ts` fits the game to the
   * window at (`GameLayout.scale`) — see the rounding comment below for why
   * `sync` needs to know it.
   */
  sync(alpha: number, outerZoom = 1): void {
    const roomChanged = this.sim.room !== this.roomGeometry;
    if (roomChanged) {
      this.world.removeChild(this.roomView);
      this.roomView.destroy();
      this.roomGeometry = this.sim.room;
      this.roomView = createRoomView(this.roomGeometry);
      this.world.addChildAt(this.roomView, 0);
    }
    // Rebuilt on room change too: a fresh room's door state is not necessarily
    // "locked", e.g. a cleared room re-entered still has none of its own enemies.
    if (roomChanged || this.sim.doorsLocked !== this.doorsLocked) {
      this.world.removeChild(this.doorView);
      this.doorView.destroy();
      this.doorsLocked = this.sim.doorsLocked;
      this.doorView = createDoorView(this.roomGeometry, this.sim.doors, this.doorsLocked);
      this.world.addChildAt(this.doorView, 1);
    }
    this.decals.sync();
    this.entities.sync(alpha);
    this.projectiles.sync(alpha);
    this.particles.sync(alpha);
    this.damageNumbers.sync(alpha);

    const index = this.sim.playerIndex;
    this.player.position.set(
      lerp(this.sim.previousX(index), this.sim.positionX(index), alpha),
      lerp(this.sim.previousY(index), this.sim.positionY(index), alpha),
    );

    // Rounded, not left fractional — a camera offset by a fraction of a real
    // screen pixel makes every sprite in the room resample, which on pixel
    // art looks like the whole screen crawling. But rounded to the nearest
    // *screen* pixel, not the nearest *room* pixel: a room pixel is already
    // `WORLD_ZOOM * outerZoom` screen pixels wide, so rounding at room-pixel
    // granularity throws away most of the resolution a slow, small motion
    // like Promille sway (#17) actually needs to read as smooth rather than
    // as a handful of visible steps a second. Shake never noticed, because a
    // hit's shake is fast and large enough that the coarser grid was already
    // below the threshold of "looks stepped" — sway lives exactly at that
    // threshold, which is what made it look choppy.
    const zoom = WORLD_ZOOM * Math.max(1, outerZoom);
    const roundToScreenPixel = (value: number): number => Math.round(value * zoom) / zoom;
    const slide = this.transitionSlideOffset(alpha);
    this.world.position.set(
      roundToScreenPixel(this.sim.shakeX + this.sim.swayX + this.cameraX + slide.x),
      roundToScreenPixel(this.sim.shakeY + this.sim.swayY + this.cameraY + slide.y),
    );
  }

  /**
   * Offset that slides a just-loaded room in from the direction travelled.
   *
   * `roomTransitionTicks` counts down from `ROOM_TRANSITION_TICKS` to 0; `alpha`
   * fills the gap between ticks so the slide doesn't step at the sim's tick
   * rate. The room the player is sliding *out of* is already gone by the time
   * this runs — it's destroyed by `transitionTo` the same tick — so this only
   * ever animates the incoming room sliding into place, not a two-room wipe.
   */
  private transitionSlideOffset(alpha: number): { readonly x: number; readonly y: number } {
    const ticksLeft = this.sim.roomTransitionTicks - alpha;
    if (ticksLeft <= 0) {
      return { x: 0, y: 0 };
    }
    // Eased out, not linear: the "quick" in #96's brief reads as a fast start
    // that settles, not a constant crawl for the entire budget.
    const remaining = Math.min(1, ticksLeft / ROOM_TRANSITION_TICKS);
    const eased = remaining * remaining;
    switch (this.sim.roomTransitionDirection) {
      case 'north':
        return { x: 0, y: -PLAYFIELD_HEIGHT * eased };
      case 'south':
        return { x: 0, y: PLAYFIELD_HEIGHT * eased };
      case 'east':
        return { x: PLAYFIELD_WIDTH * eased, y: 0 };
      case 'west':
        return { x: -PLAYFIELD_WIDTH * eased, y: 0 };
      default:
        return { x: 0, y: 0 };
    }
  }

  /**
   * Where the player sprite actually lands on screen, in the same pixel
   * space `app.stage` renders into — after `world`'s shake/sway offset,
   * after `WORLD_ZOOM`, after every ancestor's own transform.
   *
   * `getGlobalPosition` walks the whole display-list chain rather than this
   * class re-deriving it by hand, which is what keeps it correct if a
   * container between here and the stage ever gets rescaled or repositioned
   * for an unrelated reason. Call after `sync`, so it reflects this frame's
   * layout — the vignette (#17) is the reason this exists: it has to follow
   * the player, and this room has no camera-follow of its own to piggyback
   * on.
   */
  playerScreenPosition(): { readonly x: number; readonly y: number } {
    const point = this.player.getGlobalPosition();
    return { x: point.x, y: point.y };
  }
}
