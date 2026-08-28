import { Container, Sprite, type Graphics, type Texture } from 'pixi.js';
import { PLAYER_RADIUS, ROOM_TRANSITION_TICKS, type GameSim } from '../sim/game/sim.js';
import { roomFrameSize, type RoomGeometry } from '../sim/room/geometry.js';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../sim/room/playground.js';
import type { CompiledDoor } from '../sim/room/template.js';
import { clamp, lerp } from '../sim/math.js';
import { DamageNumberView } from './damage-numbers.js';
import { DecalView } from './decals.js';
import { EntityView } from './entities.js';
import { ParticleView } from './particles.js';
import { PedestalView } from './pedestal-view.js';
import { ProjectileView } from './projectiles.js';
import { createDoorView, createRoomView, createSecretHintView } from './room.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, WORLD_ZOOM } from './resolution.js';

/**
 * Where the player sprite's anchor sits in its texture.
 *
 * Measured off the art rather than assumed: the opaque pixels of `mass.png`
 * span x 1-15 and y 3-30 of a 16x32 texture (#25's raised character ceiling,
 * #108's detailed redraw), so the mug's centre is (8, 16.5).
 */
const PLAYER_ANCHOR_X = 8 / 16;
const PLAYER_ANCHOR_Y = 16.5 / 32;

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
  /** A pedestal's floating item icon (#28). */
  readonly pedestalItem: Texture;
  /** A pedestal's light beam. */
  readonly pedestalBeam: Texture;
  /**
   * Real tile art (#35, #37), keyed by floor number, one or more variants
   * per floor (`render/room.ts`'s `pickTileVariant` picks between them per
   * cell). A floor with no entry here falls back to `createRoomView`'s flat
   * palette fill — every floor but 1 and 2, today.
   */
  readonly floorTiles: Readonly<Record<number, readonly Texture[]>>;
  /**
   * Real character art (#35), keyed by `EnemyDefinition.id`. An enemy with
   * no entry here falls back to `entity`, the shared blob every enemy used
   * to draw as — every enemy floors 2-7 haven't been drawn yet, today.
   */
  readonly enemyArt: Readonly<Record<string, Texture>>;
  /**
   * Each `enemyArt` entry's own hit-flash silhouette (#37's bug report) —
   * `render/placeholder-art.ts`'s `createSilhouetteTexture`, one per id,
   * built from that same texture so the flash is always that enemy's actual
   * shape rather than `entityFlash`'s generic circle. An enemy with no
   * `enemyArt` entry has no entry here either and falls back to
   * `entityFlash`, the same fallback `enemyArt` itself uses for `entity`.
   */
  readonly enemyFlash: Readonly<Record<string, Texture>>;
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
  private readonly floorTiles: Readonly<Record<number, readonly Texture[]>>;
  private readonly player: Sprite;
  private readonly projectiles: ProjectileView;
  private readonly entities: EntityView;
  private readonly pedestals: PedestalView;
  private readonly particles: ParticleView;
  private readonly decals: DecalView;
  private readonly damageNumbers: DamageNumberView;
  private roomGeometry: RoomGeometry;
  private roomView: Container;
  private doorView: Graphics;
  private doorsLocked: boolean;
  private secretHintView: Graphics;
  private secretHintDoors: readonly CompiledDoor[] = [];

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
    this.floorTiles = textures.floorTiles;
    this.stage.addChild(this.world);
    // The room is authored at half the internal resolution and blown up here,
    // which is the whole of the camera for now. Scaling the container rather
    // than every sprite keeps the debug overlay's world layer — hitboxes, the
    // broadphase grid — lined up with what it is drawing over for free.
    this.world.scale.set(WORLD_ZOOM);
    this.roomGeometry = sim.room;
    this.roomView = createRoomView(sim.room, sim.currentFloor, this.floorTiles[sim.currentFloor]);
    this.world.addChild(this.roomView);
    this.doorsLocked = sim.doorsLocked;
    this.doorView = createDoorView(sim.room, sim.doors, this.doorsLocked);
    this.world.addChild(this.doorView);
    this.secretHintView = createSecretHintView(sim.room, []);
    this.world.addChild(this.secretHintView);

    this.decals = new DecalView(sim.decals, textures.decal);
    this.world.addChild(this.decals.container);

    this.entities = new EntityView(
      sim,
      textures.entity,
      textures.entityFlash,
      textures.telegraph,
      textures.enemyArt,
      textures.enemyFlash,
    );
    this.world.addChild(this.entities.container);

    this.pedestals = new PedestalView(sim, textures.pedestalItem, textures.pedestalBeam);
    this.world.addChild(this.pedestals.container);

    this.player = new Sprite(textures.player);
    // The mug's opaque pixels span y 3-30 of a 32-tall texture, so its
    // vertical centre (16.5) is not the texture's own midpoint (16) — a
    // centred anchor would hang the art off-centre from the body it belongs
    // to. A fraction of a pixel was invisible before the room was zoomed; at
    // 2x it is a whole screen pixel of the collider poking out on one side
    // and a gap on the other.
    this.player.anchor.set(PLAYER_ANCHOR_X, PLAYER_ANCHOR_Y);
    // Scaled to the player's own collider, exactly like `EntityView` scales
    // every enemy body to its radius — not left at native texture size. Pixel
    // density and on-screen size are different questions: art authored at a
    // higher resolution for more visible detail (#25, #108's player redraw)
    // must not, by itself, change how big the player reads in the room.
    // Without this the two stayed accidentally coupled through the texture's
    // raw pixel height, so redrawing the same-size character denser silently
    // grew it on screen instead of just sharpening it.
    this.player.scale.set(PLAYER_RADIUS / (textures.player.height / 2));
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
      this.roomView = createRoomView(
        this.roomGeometry,
        this.sim.currentFloor,
        this.floorTiles[this.sim.currentFloor],
      );
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
    // A bombed-open wall stops being a hint the same tick it stops being
    // hidden — `setSecretHints` is what the caller (`app/main.ts`, which
    // notices the reveal) calls to clear it; this only re-anchors the
    // existing hint to a room that just changed under it.
    if (roomChanged) {
      this.world.removeChild(this.secretHintView);
      this.secretHintView.destroy();
      this.secretHintView = createSecretHintView(this.roomGeometry, this.secretHintDoors);
      this.world.addChildAt(this.secretHintView, 2);
    }
    this.decals.sync();
    this.entities.sync(alpha);
    this.pedestals.sync();
    this.projectiles.sync(alpha);
    this.particles.sync(alpha);
    this.damageNumbers.sync(alpha);

    const index = this.sim.playerIndex;
    const playerX = lerp(this.sim.previousX(index), this.sim.positionX(index), alpha);
    const playerY = lerp(this.sim.previousY(index), this.sim.positionY(index), alpha);
    this.player.position.set(playerX, playerY);
    const follow = this.followOffset(playerX, playerY);

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
      roundToScreenPixel(follow.x + this.sim.shakeX + this.sim.swayX + this.cameraX + slide.x),
      roundToScreenPixel(follow.y + this.sim.shakeY + this.sim.swayY + this.cameraY + slide.y),
    );
  }

  /**
   * Camera-follow offset (#100): keeps the player centred on screen inside a
   * room bigger than one screen, clamped so the room's own edges never pull
   * away from the viewport and show empty space beyond them.
   *
   * A plain per-axis bounding-box clamp, deliberately — `L`'s dropped corner
   * (#20's footprint) and `T`'s four dropped corners (#107) sit inside this
   * clamp's range too, but that's fine left alone: the voids are real
   * `RoomGeometry` wall (see `RoomGeometry`'s `voidRects` doc comment and
   * `render/room.ts`'s wall-coloured fill for them), so the viewport showing
   * a slice of one reads exactly like standing near any other wall — no
   * different from a `1x1` room showing its own margin at screen edge. An
   * earlier version of this method pushed the viewport fully clear of the
   * void whenever it detected an overlap; for a `2x2`/`L`/`T` room the
   * viewport (one screen) is wider *and* taller than half the room, so that
   * overlap check was true almost always, and which axis it "fixed" flipped
   * with tiny player movements — the camera would suddenly snap across to
   * the middle of the next glued sub-room. Not clamping around the voids at
   * all is both simpler and correct.
   *
   * Composed additively with shake/sway/the debug free camera in `sync`
   * rather than owning `world.position` outright — that's what "doesn't
   * fight the existing camera shake/sway" (#100's acceptance criterion)
   * means in practice: this just moves the baseline they jitter around.
   *
   * A `1x1` room's frame is exactly one screen (`INTERNAL_WIDTH`/`HEIGHT` at
   * `WORLD_ZOOM`), so the clamp range below collapses to a single value and
   * this returns a constant `{0, 0}` there — the pre-#100 "whole room always
   * on screen, no camera movement" behaviour falls out of the general case
   * rather than needing its own branch.
   *
   * Follows instantly rather than easing toward the player: this is a
   * twin-stick dodge-'em-up (`docs/GAME_DESIGN.md` §1) where the player's
   * on-screen position has to match their hitbox exactly, and a lagging
   * camera would put visible daylight between the sprite an attack is
   * telegraphed at and where the body actually is.
   */
  private followOffset(
    playerX: number,
    playerY: number,
  ): { readonly x: number; readonly y: number } {
    const viewWidth = INTERNAL_WIDTH / WORLD_ZOOM;
    const viewHeight = INTERNAL_HEIGHT / WORLD_ZOOM;
    const frame = roomFrameSize(this.roomGeometry);
    const viewportX = clamp(playerX - viewWidth / 2, 0, Math.max(0, frame.width - viewWidth));
    const viewportY = clamp(playerY - viewHeight / 2, 0, Math.max(0, frame.height - viewHeight));
    return { x: -viewportX * WORLD_ZOOM, y: -viewportY * WORLD_ZOOM };
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
   * Which of the current room's walls to draw a secret-room crack hint on.
   *
   * Called by `app/main.ts` right after a room load (it owns the floor plan
   * and is the one place that knows a neighbour is `secret`/`supersecret`
   * and not yet found) and again the moment it notices a hidden wall has
   * opened, so the crack disappears the same tick the door does.
   */
  setSecretHints(doors: readonly CompiledDoor[]): void {
    this.secretHintDoors = doors;
    this.world.removeChild(this.secretHintView);
    this.secretHintView.destroy();
    this.secretHintView = createSecretHintView(this.roomGeometry, doors);
    this.world.addChildAt(this.secretHintView, 2);
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
   * the player exactly, camera-follow (#100) included, rather than assume
   * screen centre the way it could before a room could be bigger than one
   * screen.
   */
  playerScreenPosition(): { readonly x: number; readonly y: number } {
    const point = this.player.getGlobalPosition();
    return { x: point.x, y: point.y };
  }

  /**
   * Where pedestal `pedestalIndex`'s item icon lands on screen, for the
   * approach name plate (#28) — `null` while it has nothing to show (empty,
   * or not drawn this frame). Call after `sync`, same as `playerScreenPosition`.
   */
  pedestalScreenPosition(pedestalIndex: number): { readonly x: number; readonly y: number } | null {
    return this.pedestals.screenPositionFor(pedestalIndex);
  }
}
