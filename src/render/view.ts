import { Container, type Graphics, type Texture } from 'pixi.js';
import { ROOM_TRANSITION_TICKS, type GameSim, type RoomDirection } from '../sim/game/sim.js';
import { roomFrameSize, type RoomGeometry } from '../sim/room/geometry.js';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../sim/room/playground.js';
import type { CompiledDoor } from '../sim/room/template.js';
import { clamp, lerp } from '../sim/math.js';
import { AmbientLight } from './ambient-light.js';
import { DamageNumberView } from './damage-numbers.js';
import { DecalView } from './decals.js';
import { EntityView } from './entities.js';
import { ParticleView, type ParticleAccessibility, type ParticleTextures } from './particles.js';
import { PedestalView } from './pedestal-view.js';
import { MachineView } from './machine-view.js';
import { ProjectileView, type ProjectileArt } from './projectiles.js';
import {
  createDoorView,
  createRoomView,
  createSecretHintView,
  type DoorState,
  type DoorTextures,
  type DoorView,
} from './room.js';
import { createPropView } from './prop-view.js';
import { MaibaumView } from './maibaum-view.js';
import { BombFlightView } from './bomb-flight-view.js';
import { CorpseView } from './corpse-view.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, WORLD_ZOOM } from './resolution.js';
import { ENTITY_PALETTE } from './palette.js';
import type { EntityAnimator } from './animation/animator.js';
import type { AnimatedSpriteSet, RoomTileArt } from './floor-art.js';
import type { PlayerArt } from './player-art.js';
import { PlayerView } from './player-view.js';

export interface GameViewTextures {
  /**
   * Alois's own strips (#151), replacing the single static player texture
   * this used to be. He is animated, four-way and two-layered, so "the
   * player's texture" stopped being a thing there is exactly one of.
   */
  readonly playerArt: PlayerArt;
  /** Every projectile sprite, and the rule for which shot draws which (#152). */
  readonly projectileArt: ProjectileArt;
  /** `art` slot to sprite name, from `EnemyRegistry.projectileArtNames`. */
  readonly projectileArtNames: readonly (string | null)[];
  readonly entity: Texture;
  /** The entity shape in solid white, for the one-tick hit flash. */
  readonly entityFlash: Texture;
  /** The ring an enemy telegraphs an attack with. */
  readonly telegraph: Texture;
  /** One effect sprite per `ParticleKind` (#153), plus what an unauthored kind falls back to. */
  readonly particleArt: ParticleTextures;
  readonly decal: Texture;
  /** Font family for damage numbers. */
  readonly numberFont: string;
  /** A pedestal's floating item icon (#28). */
  readonly pedestalItem: Texture;
  /** A pedestal's light beam. */
  readonly pedestalBeam: Texture;
  /** The plinth the item floats over (#152). Omitted leaves the beam hanging in mid-air, as it did before. */
  readonly pedestalPlinth?: Texture | undefined;
  /** The two door sprites (#152). Omitted falls back to the flat coloured band. */
  readonly doors?: DoorTextures | undefined;
  /** Pickup art (#152), keyed by `PickupDefinition.id`. */
  readonly pickupArt?: Readonly<Record<string, Texture>> | undefined;
  /** The ground shadow a boss stands on (#152). Omitted leaves bosses drawn as they were. */
  readonly bossShadow?: Texture | undefined;
  /** Which ids draw off `bosses/` art, so only those get a shadow. */
  readonly bossIds?: ReadonlySet<string> | undefined;
  /**
   * The shared ground shadow every other standing/dropped body draws — the
   * player, a walking enemy, a piece of loot. Omitted leaves them exactly as
   * they were before this existed: no shadow at all, the same graceful
   * fallback `bossShadow`'s absence already gets.
   */
  readonly actorShadow?: Texture | undefined;
  /** Every tile in the tree by name — what `render/prop-view.ts` draws a room's `decorativeProps` from (#152). */
  readonly tileTextures?: Readonly<Record<string, Texture>> | undefined;
  /**
   * Real tile art (#35, #37, #152), keyed by floor number: the floor
   * variants (`render/room.ts`'s `pickTileVariant` picks between them per
   * cell), the wall band, the course where wall meets floor, what an obstacle
   * is drawn as, and the floor's destructible prop. A floor with no entry
   * here falls back to `createRoomView`'s flat palette fill — every floor but
   * 1 and 2, today.
   */
  readonly roomTiles: Readonly<Record<number, RoomTileArt>>;
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
  /**
   * Animated character art (#150), keyed by `EnemyDefinition.id` — the frames
   * of that creature's strip, the same frames as flash silhouettes, and its
   * compiled clips. An enemy in here animates; one that is not draws its
   * single `enemyArt` texture forever, exactly as before.
   *
   * Built by `render/floor-art.ts`'s `buildAnimatedSets` from what
   * `loadFloorArt` scanned, because the silhouettes need a renderer and the
   * loader deliberately has none.
   */
  readonly enemyAnimation: Readonly<Record<string, AnimatedSpriteSet>>;
}

/**
 * Everything `RenderView.setAccessibility` accepts: `ParticleAccessibility`'s
 * two fields, plus #53's colourblind-safe projectile marker toggle
 * (`ProjectileView.setAccessibility`'s own `ProjectileAccessibility`).
 * Combined here rather than passed as two separate arguments so `main.ts`
 * has one call site to make when any accessibility setting changes.
 */
export interface RenderAccessibility extends ParticleAccessibility {
  readonly colorblindPalette: boolean;
}

/** What reduced motion multiplies screen shake by. A quarter still reads; nothing does not. */
const REDUCED_MOTION_SHAKE = 0.25;

/** Rendered frames the doors pulse for when a room clears. About a third of a second at 60 Hz. */
const DOOR_PULSE_FRAMES = 20;
/** How far the pulse dips the doors' alpha at its deepest. */
const DOOR_PULSE_DEPTH = 0.55;

/**
 * Rendered frames a door's open/close transition takes. Quicker than the
 * amber clear-pulse it plays alongside — a door swinging is a mechanical
 * beat, not a celebration — about a fifth of a second at 60 Hz.
 */
const DOOR_TRANSITION_FRAMES = 12;
/**
 * The depth-axis scale a door tile settles at mid-swing, never quite zero:
 * a door collapsed to nothing reads as a rendering glitch, not a door
 * edge-on, and the two overlapping tiles of the incoming/outgoing state
 * cover for the sliver either one leaves.
 */
const DOOR_TRANSITION_MIN_SCALE = 0.08;

/**
 * Slides every door half in `view` apart from its partner along the
 * doorway's long axis — that axis is each sprite's own local x once its
 * `rotation` is applied (`render/room.ts`'s `doorHalfPlacements`), so this
 * only ever scales `scale.x`, toward the `anchor` at the sprite's outer edge.
 * A north/south door parts sideways, a west/east door up and down ("Isaac
 * like", `#196`). `1` is the door at rest; the transition sweeps this from
 * `DOOR_TRANSITION_MIN_SCALE` up to `1` (or back) over
 * `DOOR_TRANSITION_FRAMES`.
 *
 * `retractSign` carries the half's mirror (`-1` for the left/near half) and
 * `baseScale` the 32px→tile-grid factor (`docs/DECISIONS.md` #48), both
 * rebuilt into `scale.x` here rather than nudged — `progress` reaches `1` at
 * rest, and a bare `1` would be double the sprite's real on-screen size.
 * `scale.y` is left alone: `doorHalfPlacements` may have set it negative (a
 * south door's vertical flip), and the slide never touches the short axis.
 */
function applyDoorSwingScale(view: DoorView, progress: number): void {
  for (const { sprite, retractSign, baseScale } of view.sprites) {
    sprite.scale.x = retractSign * baseScale * progress;
  }
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
  private readonly roomTiles: Readonly<Record<number, RoomTileArt>>;
  private readonly doorTextures: DoorTextures | undefined;
  private readonly tileTextures: Readonly<Record<string, Texture>>;
  private propView: Container;
  private readonly ambientLight: AmbientLight;
  private readonly maibaumView: MaibaumView;
  private readonly corpseView: CorpseView;
  private readonly playerView: PlayerView;
  private readonly projectiles: ProjectileView;
  private readonly bombFlightView: BombFlightView;
  private readonly entities: EntityView;
  private readonly pedestals: PedestalView;
  private readonly machine: MachineView;
  private readonly particles: ParticleView;
  private readonly decals: DecalView;
  private readonly damageNumbers: DamageNumberView;
  private roomGeometry: RoomGeometry;
  private roomView: Container;
  private doorView: DoorView;
  /** The outgoing door state, kept alive and animated out while `doorView` animates in. */
  private previousDoorView: DoorView | undefined;
  private doorTransitionTicks = 0;
  private doorsLocked: boolean;
  /**
   * Doorways that lead to an unopened key-locked treasure room (`#196`) —
   * set by `app/main.ts` (which has the floor plan) on every room load, and
   * drawn `locked` instead of `open` once the room's own enemies are down.
   * Empty on a room with no such neighbour, which is almost every room.
   */
  private lockedDoorDirections: ReadonlySet<RoomDirection> = new Set();
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

  /**
   * What screen shake is multiplied by before it is applied.
   *
   * Damped rather than removed under reduced motion: shake is the cheapest
   * signal that a hit was *yours* rather than something that happened
   * elsewhere on screen, and a quarter of it still reads where none at all
   * does not. `GameSim.screenShakeScale` is the separate, sim-side control
   * the debug tuning window drives; this one is the accessibility toggle's,
   * and it is render-side because it must not change a replay.
   */
  private shakeScale = 1;

  private accessibility: RenderAccessibility = {
    reducedMotion: false,
    reduceFlashes: false,
    colorblindPalette: false,
  };

  /**
   * Frames left of the amber pulse the doors give when a room clears (#153).
   *
   * Counted in rendered frames rather than simulation ticks because it is
   * purely presentational and must not exist in a replay — and because the
   * thing it decorates, the doors unlocking, is already visible without it.
   */
  private doorPulseFrames = 0;

  constructor(sim: GameSim, textures: GameViewTextures) {
    this.sim = sim;
    this.roomTiles = textures.roomTiles;
    this.doorTextures = textures.doors;
    this.tileTextures = textures.tileTextures ?? {};
    this.stage.addChild(this.world);
    // The room is authored at half the internal resolution and blown up here,
    // which is the whole of the camera for now. Scaling the container rather
    // than every sprite keeps the debug overlay's world layer — hitboxes, the
    // broadphase grid — lined up with what it is drawing over for free.
    this.world.scale.set(WORLD_ZOOM);
    this.roomGeometry = sim.room;
    this.roomView = createRoomView(sim.room, sim.currentFloor, this.roomTiles[sim.currentFloor]);
    this.world.addChild(this.roomView);
    this.doorsLocked = sim.doorsLocked;
    this.doorView = createDoorView(
      sim.room,
      sim.doors,
      this.doorStateFor.bind(this),
      this.doorTextures,
    );
    this.world.addChild(this.doorView.container);
    this.secretHintView = createSecretHintView(sim.room, []);
    this.world.addChild(this.secretHintView);
    // A room's authored furniture (#152), over the floor and under everything
    // that moves: a fence post must never hide the enemy standing behind it.
    this.propView = createPropView(sim.roomDecorativeProps, this.tileTextures);
    this.world.addChild(this.propView);

    // Ambient per-floor lighting: over the floor/walls/props, under anything
    // that moves or has to stay readable (decals down through damage numbers)
    // — see `ambient-light.ts`'s own doc comment for why it stops there.
    this.ambientLight = new AmbientLight();
    this.ambientLight.onRoomChanged(sim.room, sim.currentFloor);
    this.world.addChild(this.ambientLight.container);

    this.decals = new DecalView(sim.decals, textures.decal);
    this.world.addChild(this.decals.container);

    this.entities = new EntityView(
      sim,
      textures.entity,
      textures.entityFlash,
      textures.telegraph,
      textures.enemyArt,
      textures.enemyFlash,
      textures.enemyAnimation,
      textures.pickupArt,
      textures.bossShadow,
      textures.bossIds,
      textures.actorShadow,
      // `pedestalBeam` is already a generic 1x1 solid meant to be stretched
      // into a bar — reused here rather than generating a second identical
      // texture for the bomb cross telegraph's two bars (#210).
      textures.pedestalBeam,
    );
    this.entities.setTargetTextures(this.roomTiles[sim.currentFloor]?.destructibles);
    this.world.addChild(this.entities.container);

    this.pedestals = new PedestalView(
      sim,
      textures.pedestalItem,
      textures.pedestalBeam,
      textures.pedestalPlinth,
    );
    this.world.addChild(this.pedestals.container);

    // Der Losbrunnen (#218) reuses the same generic beam/plinth textures as
    // a pedestal, tinted distinctly — see `MachineView`'s own doc comment.
    this.machine = new MachineView(sim, textures.pedestalBeam, textures.pedestalPlinth);
    this.world.addChild(this.machine.container);

    // Blutwurz (#84): drawn just before the player, ground-level, so a
    // corpse in the room the player is standing in reads as part of the
    // floor rather than floating over it.
    this.corpseView = new CorpseView();
    this.world.addChild(this.corpseView.container);

    this.playerView = new PlayerView(textures.playerArt, textures.actorShadow);
    this.world.addChild(this.playerView.container);

    // The arena Maibaum (#199): drawn just after the player, then re-ordered
    // against them every frame in `sync` so a player standing behind it is
    // hidden by it and one in front is not.
    this.maibaumView = new MaibaumView(textures.actorShadow);
    this.world.addChild(this.maibaumView.container);

    this.projectiles = new ProjectileView(
      sim.projectiles,
      textures.projectileArt,
      textures.projectileArtNames,
    );
    this.world.addChild(this.projectiles.container);

    // A Böllerschmeißer's lobbed bomb (#243): drawn above bodies and shots
    // alike, the same z-order a real projectile takes, since it is — for the
    // second it is in the air — exactly that.
    this.bombFlightView = new BombFlightView();
    this.world.addChild(this.bombFlightView.container);

    this.particles = new ParticleView(sim.particles, textures.particleArt);
    this.world.addChild(this.particles.container);

    this.damageNumbers = new DamageNumberView(sim.damageNumbers, textures.numberFont);
    this.world.addChild(this.damageNumbers.container);
  }

  /**
   * Which effects the player has switched off (#153).
   *
   * Held here and pushed down rather than read from a module global, so a
   * headless test or the room editor's playtest view gets the full set without
   * having to know the setting exists. Never reaches `GameSim`: a
   * reduced-motion run steps identically to a full one, or a recorded replay
   * would not play back (`docs/DECISIONS.md` #41).
   */
  setAccessibility(accessibility: RenderAccessibility): void {
    this.accessibility = accessibility;
    this.particles.setAccessibility(accessibility);
    this.entities.setRingPulses(!accessibility.reduceFlashes);
    this.shakeScale = accessibility.reducedMotion ? REDUCED_MOTION_SHAKE : 1;
    this.ambientLight.setReducedMotion(accessibility.reducedMotion);
    this.projectiles.setAccessibility({ colorblindPalette: accessibility.colorblindPalette });
  }

  /** The frame animator, for the debug overlay's clip panel. */
  get animator(): EntityAnimator {
    return this.entities.animator;
  }

  /**
   * `alpha` is the fraction of a tick elapsed since the last simulation step.
   *
   * `outerZoom` is the whole-number scale `main.ts` fits the game to the
   * window at (`GameLayout.scale`) — see the rounding comment below for why
   * `sync` needs to know it.
   *
   * `nowMs` is the render clock animation clips advance on (#150). It defaults
   * to reading the clock here so that every caller does not have to, but
   * `app/main.ts` passes the reading it already took for its own frame timing:
   * two `performance.now()` calls a frame that could disagree by a fraction of
   * a millisecond is two clocks where one will do.
   */
  sync(alpha: number, outerZoom = 1, nowMs: number = performance.now()): void {
    const roomChanged = this.sim.room !== this.roomGeometry;
    if (roomChanged) {
      // Before anything is drawn: the old room's bodies are gone, and they
      // left because the room did, not because they died.
      this.entities.resetAnimation();
      this.world.removeChild(this.roomView);
      this.roomView.destroy();
      this.roomGeometry = this.sim.room;
      this.roomView = createRoomView(
        this.roomGeometry,
        this.sim.currentFloor,
        this.roomTiles[this.sim.currentFloor],
      );
      this.world.addChildAt(this.roomView, 0);
      // Which barrel is a property of the floor, and a run crosses floors.
      this.entities.setTargetTextures(this.roomTiles[this.sim.currentFloor]?.destructibles);
    }
    // Rebuilt on room change too: a fresh room's door state is not necessarily
    // "locked", e.g. a cleared room re-entered still has none of its own enemies.
    if (roomChanged || this.sim.doorsLocked !== this.doorsLocked) {
      const justUnlocked = !this.sim.doorsLocked && !roomChanged;
      this.doorsLocked = this.sim.doorsLocked;
      const nextDoorView = createDoorView(
        this.roomGeometry,
        this.sim.doors,
        this.doorStateFor.bind(this),
        this.doorTextures,
      );
      // A swing animation needs the outgoing sprites kept around to animate
      // out, not just a texture to snap away from — so the old `doorView`
      // becomes `previousDoorView` and animates alongside the new one instead
      // of being destroyed on the spot. That only makes sense between two
      // real door states in the same room; a room change has no "outgoing
      // door" to swing (the whole room just changed under it), and a
      // transition already in flight when another one starts has nothing
      // coherent to animate from, so both hard-cut instead.
      if (this.previousDoorView !== undefined) {
        this.world.removeChild(this.previousDoorView.container);
        this.previousDoorView.container.destroy();
        this.previousDoorView = undefined;
      }
      const canAnimate =
        !roomChanged && this.doorView.sprites.length > 0 && nextDoorView.sprites.length > 0;
      if (canAnimate) {
        this.previousDoorView = this.doorView;
        this.previousDoorView.container.alpha = 1;
        this.doorTransitionTicks = DOOR_TRANSITION_FRAMES;
      } else {
        this.world.removeChild(this.doorView.container);
        this.doorView.container.destroy();
        this.doorTransitionTicks = 0;
      }
      this.doorView = nextDoorView;
      this.world.addChildAt(this.doorView.container, 1);
      if (this.previousDoorView !== undefined) {
        this.world.addChildAt(this.previousDoorView.container, 1);
      }
      // The doors are what actually changed when a room cleared, so they are
      // what says so (#153). Only on an unlock inside the same room — walking
      // into an already-cleared room rebuilds the same view and has nothing to
      // announce.
      this.doorPulseFrames = justUnlocked ? DOOR_PULSE_FRAMES : 0;
    }
    if (this.doorTransitionTicks > 0) {
      this.doorTransitionTicks -= 1;
      // 0 at the first animated frame, 1 once the swing completes.
      const progress = 1 - this.doorTransitionTicks / DOOR_TRANSITION_FRAMES;
      applyDoorSwingScale(
        this.doorView,
        DOOR_TRANSITION_MIN_SCALE + (1 - DOOR_TRANSITION_MIN_SCALE) * progress,
      );
      if (this.previousDoorView !== undefined) {
        applyDoorSwingScale(
          this.previousDoorView,
          DOOR_TRANSITION_MIN_SCALE + (1 - DOOR_TRANSITION_MIN_SCALE) * (1 - progress),
        );
        if (this.doorTransitionTicks === 0) {
          this.world.removeChild(this.previousDoorView.container);
          this.previousDoorView.container.destroy();
          this.previousDoorView = undefined;
        }
      }
    }
    if (this.doorPulseFrames > 0) {
      this.doorPulseFrames -= 1;
      const progress = this.doorPulseFrames / DOOR_PULSE_FRAMES;
      // Suppressed by `reduceFlashes`, and by nothing else: it is a bright
      // thing that happens repeatedly over a run, which is the exact hazard
      // that toggle exists for.
      this.doorView.container.tint = ENTITY_PALETTE.normalTint;
      this.doorView.container.alpha = this.accessibility.reduceFlashes
        ? 1
        : 1 - Math.sin(progress * Math.PI) * DOOR_PULSE_DEPTH;
    } else {
      this.doorView.container.alpha = 1;
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
      this.world.removeChild(this.propView);
      this.propView.destroy({ children: true });
      this.propView = createPropView(this.sim.roomDecorativeProps, this.tileTextures);
      this.world.addChildAt(this.propView, 3);
      this.ambientLight.onRoomChanged(this.roomGeometry, this.sim.currentFloor);
    }
    this.ambientLight.sync(this.sim.tick);
    this.decals.sync();
    this.entities.sync(alpha, nowMs);
    this.pedestals.sync();
    this.machine.sync();
    this.corpseView.sync(this.sim);
    this.projectiles.sync(alpha, this.sim.currentFloor);
    this.bombFlightView.sync(this.sim);
    this.particles.sync(alpha);
    this.damageNumbers.sync(alpha);

    const index = this.sim.playerIndex;
    const playerX = lerp(this.sim.previousX(index), this.sim.positionX(index), alpha);
    const playerY = lerp(this.sim.previousY(index), this.sim.positionY(index), alpha);
    this.playerView.sync(this.sim, alpha, nowMs);

    // The Maibaum, and where it sits relative to the player: behind the pole's
    // base means it draws in front of them (they are behind it), otherwise
    // after. Only the planted pole has a `footY` to sort against — the held
    // one just rides wherever it was left, which is next to the player anyway.
    this.maibaumView.sync(this.sim);
    const foot = this.maibaumView.footY;
    this.world.removeChild(this.maibaumView.container);
    const playerChildIndex = this.world.getChildIndex(this.playerView.container);
    const behindPole = foot !== null && playerY <= foot;
    this.world.addChildAt(
      this.maibaumView.container,
      behindPole ? playerChildIndex + 1 : playerChildIndex,
    );
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
      roundToScreenPixel(
        follow.x + this.sim.shakeX * this.shakeScale + this.sim.swayX + this.cameraX + slide.x,
      ),
      roundToScreenPixel(
        follow.y + this.sim.shakeY * this.shakeScale + this.sim.swayY + this.cameraY + slide.y,
      ),
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
   * The doorways that lead to an unopened key-locked treasure room (`#196`).
   * Called by `app/main.ts` on every room load — it is the side that has the
   * floor plan and the visited-room set; `GameSim` only knows the door
   * geometry. Rebuilds the door layer in place (no slide — this is a load-time
   * fact, not a state change a player watches happen) when the set actually
   * changes and nothing is mid-transition.
   */
  setLockedDoors(directions: Iterable<RoomDirection>): void {
    const next = new Set(directions);
    const same =
      next.size === this.lockedDoorDirections.size &&
      [...next].every((d) => this.lockedDoorDirections.has(d));
    this.lockedDoorDirections = next;
    if (same || this.doorTransitionTicks > 0) {
      return;
    }
    this.world.removeChild(this.doorView.container);
    this.doorView.container.destroy();
    this.doorView = createDoorView(
      this.roomGeometry,
      this.sim.doors,
      this.doorStateFor.bind(this),
      this.doorTextures,
    );
    this.world.addChildAt(this.doorView.container, 1);
  }

  /** Which of `open`/`closed`/`locked` a given door draws in this frame. */
  private doorStateFor(door: CompiledDoor): DoorState {
    if (this.doorsLocked) {
      return 'closed';
    }
    return this.lockedDoorDirections.has(door.direction) ? 'locked' : 'open';
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
    return this.playerView.screenPosition();
  }

  /** Alois's animation state, for the debug overlay's animation panel. */
  get player(): PlayerView {
    return this.playerView;
  }

  /**
   * Where pedestal `pedestalIndex`'s item icon lands on screen, for the
   * approach name plate (#28) — `null` while it has nothing to show (empty,
   * or not drawn this frame). Call after `sync`, same as `playerScreenPosition`.
   */
  pedestalScreenPosition(pedestalIndex: number): { readonly x: number; readonly y: number } | null {
    return this.pedestals.screenPositionFor(pedestalIndex);
  }

  /** Where the current floor's Losbrunnen lands on screen, or `null` while nothing is drawn — same shape as `pedestalScreenPosition`. */
  machineScreenPosition(): { readonly x: number; readonly y: number } | null {
    return this.machine.screenPosition();
  }
}
