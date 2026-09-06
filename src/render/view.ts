import { Color, type Object3D, Scene, type WebGLRenderer } from 'three';
import { ROOM_TRANSITION_TICKS, type GameSim, type RoomDirection } from '../sim/game/sim.js';
import { roomFrameSize, type RoomGeometry } from '../sim/room/geometry.js';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../sim/room/playground.js';
import type { CompiledDoor } from '../sim/room/template.js';
import type { EntityAnimator } from './animation/animator.js';
import { BombFlightView } from './bomb-flight-view.js';
import { CorpseView } from './corpse-view.js';
import { DamageNumberView } from './damage-numbers.js';
import { DecalView } from './decals.js';
import { EntityView } from './entities.js';
import type { AnimatedSpriteSet, RoomTileArt } from './floor-art.js';
import { BitmapText, Container, type Texture } from './gfx/index.js';
import { MachineView } from './machine-view.js';
import { MaibaumView } from './maibaum-view.js';
import { ParticleView, type ParticleAccessibility, type ParticleTextures } from './particles.js';
import { PedestalView } from './pedestal-view.js';
import type { PlayerArt } from './player-art.js';
import { PlayerView } from './player-view.js';
import { ProjectileView, type ProjectileArt } from './projectiles.js';
import { UI_TEXT_HEIGHT } from './ui/text.js';
import { ELEVATION, WorldCamera, type WorldPoint } from './world/camera.js';
import { ACTOR_LAYER } from './world/layers.js';
import { Lighting } from './world/lighting.js';
import { type DoorState, Scenery } from './world/scenery.js';

/**
 * The game as a scene: everything the player sees in the room, and the fixed
 * camera it is seen through.
 *
 * ## One class, same job
 *
 * `GameView` owns the three.js scene the way it used to own a Pixi container
 * tree, and `app/main.ts` drives it the same way: construct it with the art,
 * call `sync(alpha, nowMs)` once a rendered frame, `render()` to draw, ask it
 * where the player is on screen for the overlays. The simulation is read, never
 * written (`docs/DECISIONS.md` #2) — and it does not know this renderer
 * exists any more than it knew the last one.
 *
 * ## What each frame does, in order
 *
 * 1. If the room changed under us, rebuild the scenery and re-light.
 * 2. Doors: state changes, the leaf sliding aside, the room-clear pulse.
 * 3. Every view reads its slice of the simulation.
 * 4. The camera follows the player (clamped to the room), plus shake, sway,
 *    the room-transition slide and the debug pan.
 *
 * ## Two world passes
 *
 * `render` draws the scene twice: the room (floor, walls, doors, decals), then
 * everything that *stands in* it (`world/layers.ts`'s `ACTOR_LAYER` — every
 * sprite, boulder, projectile, particle) again, over the top, with the depth
 * buffer cleared. A standing sprite is a quad leaned right back by the camera
 * angle, so at 65° its head is ~14 units behind its feet — inside the back
 * wall's box, and a single pass lets the wall's depth clip it. The second pass
 * is the 2D renderer's painter's-order compositing: sprites on top of the
 * room, still depth-sorted against each other so one body stands behind
 * another. The UI is a third pass, drawn by the caller.
 *
 * ## Screen positions
 *
 * The HUD sits over the world in a separate 2D pass, so anything the HUD
 * anchors to a world point — the vignette, a pedestal's name plate, a damage
 * number — asks this class to project it. That is the one seam between the
 * two passes, and it is one function.
 */
export interface GameViewTextures {
  readonly playerArt: PlayerArt;
  readonly projectileArt: ProjectileArt;
  readonly projectileArtNames: readonly (string | null)[];
  /** What an un-drawn body falls back to. */
  readonly entity: Texture;
  readonly particleArt: ParticleTextures;
  readonly decal: Texture;
  /** The bitmap font family for damage numbers and pickup labels. */
  readonly numberFont: string;
  readonly pedestalItem: Texture;
  readonly pedestalPlinth?: Texture | undefined;
  readonly pickupArt?: Readonly<Record<string, Texture>> | undefined;
  readonly bossIds?: ReadonlySet<string> | undefined;
  readonly tileTextures?: Readonly<Record<string, Texture>> | undefined;
  readonly roomTiles: Readonly<Record<number, RoomTileArt>>;
  readonly enemyArt: Readonly<Record<string, Texture>>;
  readonly enemyAnimation: Readonly<Record<string, AnimatedSpriteSet>>;
}

export interface RenderAccessibility extends ParticleAccessibility {
  readonly colorblindPalette: boolean;
}

const REDUCED_MOTION_SHAKE = 0.25;
const DOOR_PULSE_FRAMES = 20;
const DOOR_PULSE_DEPTH = 0.55;
/** Frames a door takes to swing open once the room is cleared — half a second, a real door's pace. */
const DOOR_TRANSITION_FRAMES = 30;
/** Where the player's "screen position" is taken: mid-body, so the vignette centres on him, not his feet. */
const PLAYER_ANCHOR_HEIGHT = 8;

/** Moves an object onto `ACTOR_LAYER` only — off the pass-one layer, into pass two. */
function toActorLayer(object: Object3D): void {
  object.layers.set(ACTOR_LAYER);
}

export class GameView {
  readonly scene = new Scene();
  readonly camera = new WorldCamera();
  /**
   * World-anchored HUD text (damage numbers, prices) lives here. The caller
   * puts this container on the UI layer at internal-pixel scale.
   */
  readonly labelLayer = new Container();

  /** Debug free-camera pan, in room units. */
  cameraX = 0;
  cameraY = 0;

  private readonly sim: GameSim;
  private readonly textures: GameViewTextures;
  private readonly lighting: Lighting;
  private scenery: Scenery;
  private roomGeometry: RoomGeometry;
  private doorsLocked: boolean;
  private lockedDoorDirections: ReadonlySet<RoomDirection> = new Set();
  private bossDoorDirections: ReadonlySet<RoomDirection> = new Set();
  private secretHintDoors: readonly CompiledDoor[] = [];
  private doorTransitionTicks = 0;
  private doorPulseFrames = 0;

  private readonly entities: EntityView;
  private readonly playerView: PlayerView;
  private readonly projectiles: ProjectileView;
  private readonly particles: ParticleView;
  private readonly decals: DecalView;
  private readonly damageNumbers: DamageNumberView;
  private readonly pedestals: PedestalView;
  private readonly machine: MachineView;
  private readonly maibaumView: MaibaumView;
  private readonly bombFlightView: BombFlightView;
  private readonly corpseView: CorpseView;
  private readonly actorGroups: readonly Object3D[];

  private shakeScale = 1;
  private accessibility: RenderAccessibility = {
    reducedMotion: false,
    reduceFlashes: false,
    colorblindPalette: false,
  };
  private readonly point: WorldPoint = { x: 0, y: 0 };

  constructor(sim: GameSim, textures: GameViewTextures) {
    this.sim = sim;
    this.textures = textures;
    this.roomGeometry = sim.room;
    this.doorsLocked = sim.doorsLocked;

    this.lighting = new Lighting(this.scene);
    this.scenery = this.buildScenery();
    this.scene.add(this.scenery.group);

    const makeLabel = (): BitmapText =>
      new BitmapText({
        text: '',
        style: { fontFamily: textures.numberFont, fontSize: UI_TEXT_HEIGHT },
      });

    this.entities = new EntityView(
      sim,
      {
        fallback: textures.entity,
        enemyArt: textures.enemyArt,
        enemyAnimation: textures.enemyAnimation,
        pickupArt: textures.pickupArt ?? {},
        bossIds: textures.bossIds ?? new Set(),
      },
      this.labelLayer,
      makeLabel,
    );
    this.entities.setTargetTextures(textures.roomTiles[sim.currentFloor]?.destructibles);
    this.scene.add(this.entities.group);

    this.playerView = new PlayerView(textures.playerArt);
    this.scene.add(this.playerView.group);

    this.projectiles = new ProjectileView(
      sim.projectiles,
      textures.projectileArt,
      textures.projectileArtNames,
    );
    this.projectiles.setLighting(this.lighting);
    this.scene.add(this.projectiles.group);

    this.particles = new ParticleView(sim.particles, textures.particleArt);
    this.scene.add(this.particles.group);

    this.decals = new DecalView(sim.decals, textures.decal);
    this.scene.add(this.decals.group);

    this.damageNumbers = new DamageNumberView(sim.damageNumbers, this.labelLayer, makeLabel);

    this.pedestals = new PedestalView(sim, textures.pedestalItem, textures.pedestalPlinth);
    this.scene.add(this.pedestals.group);

    this.machine = new MachineView(sim, textures.pedestalPlinth);
    this.scene.add(this.machine.group);

    this.maibaumView = new MaibaumView();
    this.scene.add(this.maibaumView.group);

    this.bombFlightView = new BombFlightView();
    this.scene.add(this.bombFlightView.group);

    this.corpseView = new CorpseView();
    this.scene.add(this.corpseView.group);

    // The groups whose contents stand in the room: drawn a second time in
    // `render`, over the architecture, so a sprite leaning back into the wall
    // behind it is not clipped by it. See `world/layers.ts`.
    this.actorGroups = [
      this.entities.group,
      this.playerView.group,
      this.projectiles.group,
      this.particles.group,
      this.pedestals.group,
      this.machine.group,
      this.maibaumView.group,
      this.bombFlightView.group,
      this.corpseView.group,
    ];

    this.relight();
    this.applyDoorStates();
    this.applyLean();
  }

  // ---------------------------------------------------------- settings

  setAccessibility(accessibility: RenderAccessibility): void {
    this.accessibility = accessibility;
    this.particles.setAccessibility(accessibility);
    this.entities.setRingPulses(!accessibility.reduceFlashes);
    this.shakeScale = accessibility.reducedMotion ? REDUCED_MOTION_SHAKE : 1;
    this.lighting.setReducedMotion(accessibility.reducedMotion);
    this.projectiles.setAccessibility({ colorblindPalette: accessibility.colorblindPalette });
  }

  /** The camera's angle above the floor — a debug knob; `ELEVATION` is the game's. */
  setElevation(radians: number): void {
    this.camera.setElevation(radians);
    this.applyLean();
  }

  get elevation(): number {
    return this.camera.elevation;
  }

  static get defaultElevation(): number {
    return ELEVATION;
  }

  private applyLean(): void {
    const lean = this.camera.lean;
    this.entities.setLean(lean);
    this.playerView.setLean(lean);
    this.projectiles.setLean(lean);
    this.particles.setLean(lean);
    this.pedestals.setLean(lean);
    this.scenery.setLean(lean);
  }

  get animator(): EntityAnimator {
    return this.entities.animator;
  }

  get player(): PlayerView {
    return this.playerView;
  }

  // ------------------------------------------------------------- frame

  sync(alpha: number, nowMs: number = performance.now()): void {
    const sim = this.sim;
    const roomChanged = sim.room !== this.roomGeometry;
    if (roomChanged) {
      this.roomGeometry = sim.room;
      this.entities.resetAnimation();
      this.entities.setTargetTextures(this.textures.roomTiles[sim.currentFloor]?.destructibles);
      this.scenery.dispose();
      this.scenery = this.buildScenery();
      this.scene.add(this.scenery.group);
      this.scenery.setLean(this.camera.lean);
      this.doorsLocked = sim.doorsLocked;
      this.doorTransitionTicks = 0;
      this.doorPulseFrames = 0;
      this.applyDoorStates();
      this.relight();
    } else if (sim.doorsLocked !== this.doorsLocked) {
      const justUnlocked = !sim.doorsLocked;
      this.doorsLocked = sim.doorsLocked;
      this.applyDoorStates();
      if (justUnlocked) {
        // The doors swing open rather than vanish: start them shut and let
        // the transition below carry them round.
        for (const door of this.scenery.doors) {
          if (door.currentState === 'open') {
            door.setOpenness(0);
          }
        }
        this.doorTransitionTicks = DOOR_TRANSITION_FRAMES;
        this.doorPulseFrames = DOOR_PULSE_FRAMES;
      }
    }

    if (this.doorTransitionTicks > 0) {
      this.doorTransitionTicks -= 1;
      const progress = 1 - this.doorTransitionTicks / DOOR_TRANSITION_FRAMES;
      // Ease out: a door thrown open slows as it swings.
      const eased = 1 - (1 - progress) ** 3;
      for (const door of this.scenery.doors) {
        if (door.currentState === 'open') {
          door.setOpenness(eased);
        }
      }
    }
    if (this.doorPulseFrames > 0) {
      this.doorPulseFrames -= 1;
      const progress = this.doorPulseFrames / DOOR_PULSE_FRAMES;
      const strength = this.accessibility.reduceFlashes
        ? 0
        : Math.sin(progress * Math.PI) * DOOR_PULSE_DEPTH;
      for (const door of this.scenery.doors) {
        door.setPulse(strength);
      }
    }

    this.lighting.sync(sim.tick);
    this.decals.sync();
    this.entities.sync(alpha, nowMs, this.projectPoint);
    this.pedestals.sync();
    this.machine.sync();
    this.corpseView.sync(sim);
    this.projectiles.sync(alpha, sim.currentFloor);
    this.bombFlightView.sync(sim);
    this.particles.sync(alpha);
    this.playerView.sync(sim, alpha, nowMs);
    this.maibaumView.sync(sim);
    this.lighting.syncLantern(this.playerView.positionX, this.playerView.footZ, !sim.playerDead);

    const frame = roomFrameSize(this.roomGeometry);
    const slide = this.transitionSlideOffset(alpha);
    this.camera.follow(
      this.playerView.positionX,
      this.playerView.positionY,
      frame.width,
      frame.height,
      sim.shakeX * this.shakeScale + sim.swayX + this.cameraX + slide.x,
      sim.shakeY * this.shakeScale + sim.swayY + this.cameraY + slide.y,
    );
    // Labels project after the camera has moved, or they lag a frame.
    this.damageNumbers.sync(alpha, this.projectPoint);
    this.labelLayer.prepare(1);
  }

  /** Draws the world pass. The caller draws the UI pass over it. */
  render(renderer: WebGLRenderer): void {
    const camera = this.camera.camera;

    // Everything that stands in the room is on `ACTOR_LAYER` only (set on the
    // `Billboard`, on the block boxes and trellis, and swept here for the
    // pooled meshes those groups grow). Pass one draws the room without them.
    for (const group of this.actorGroups) {
      group.traverse(toActorLayer);
    }

    // Pass one: the room — floor, walls, doors, decals, lights, shadows.
    renderer.render(this.scene, camera);

    // Pass two: the standing sprites, over the room, with the depth buffer
    // cleared so a sprite leaning back into the wall behind it draws on top of
    // it. They still sort against each other, so one body stands behind
    // another. Shadows are the ones baked in pass one; nothing here casts anew.
    //
    // `scene.background` has to come off for this pass: a `Color` background
    // makes three force a full colour clear at the start of every `render`,
    // even with `autoClear` off, which would wipe pass one.
    const previousBackground = this.scene.background;
    const previousAutoClear = renderer.autoClear;
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const previousLayerMask = camera.layers.mask;
    this.scene.background = null;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    camera.layers.set(ACTOR_LAYER);
    renderer.clearDepth();
    renderer.render(this.scene, camera);
    this.scene.background = previousBackground;
    camera.layers.mask = previousLayerMask;
    renderer.autoClear = previousAutoClear;
    renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
  }

  private readonly projectPoint = (x: number, height: number, z: number, out: WorldPoint): void => {
    this.camera.project(x, height, z, out);
  };

  private buildScenery(): Scenery {
    const sim = this.sim;
    const scenery = new Scenery(
      sim.room,
      sim.currentFloor,
      sim.doors,
      sim.roomDecorativeProps,
      {
        tiles: this.textures.roomTiles[sim.currentFloor],
        tileTextures: this.textures.tileTextures ?? {},
      },
      this.camera.lean,
    );
    for (const door of scenery.doors) {
      door.setDouble(this.bossDoorDirections.has(door.door.direction));
    }
    return scenery;
  }

  private relight(): void {
    const tiles = this.textures.roomTiles[this.sim.currentFloor];
    this.lighting.onRoomChanged(
      tiles?.lighting ?? 'cellar',
      this.scenery.frameWidth,
      this.scenery.frameHeight,
      this.scenery.bulbs,
    );
    this.scene.background = new Color(this.lighting.backgroundColour);
    this.scenery.setSecretHints(this.secretHintDoors);
  }

  private applyDoorStates(): void {
    for (const door of this.scenery.doors) {
      door.setState(this.doorStateFor(door.door));
      door.setPulse(0);
    }
  }

  private doorStateFor(door: CompiledDoor): DoorState {
    if (this.doorsLocked) {
      return 'closed';
    }
    return this.lockedDoorDirections.has(door.direction) ? 'locked' : 'open';
  }

  private transitionSlideOffset(alpha: number): { readonly x: number; readonly y: number } {
    const ticksLeft = this.sim.roomTransitionTicks - alpha;
    if (ticksLeft <= 0) {
      return { x: 0, y: 0 };
    }
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

  // ---------------------------------------------------------- app seams

  setSecretHints(doors: readonly CompiledDoor[]): void {
    this.secretHintDoors = doors;
    this.scenery.setSecretHints(doors);
  }

  setLockedDoors(directions: Iterable<RoomDirection>): void {
    const next = new Set(directions);
    const same =
      next.size === this.lockedDoorDirections.size &&
      [...next].every((d) => this.lockedDoorDirections.has(d));
    this.lockedDoorDirections = next;
    if (same || this.doorTransitionTicks > 0) {
      return;
    }
    this.applyDoorStates();
  }

  /**
   * Which of this room's doors lead to the boss room — those get a double
   * door. The floor plan knows; `app/main.ts` tells us, the same way it does
   * for key-locked doors.
   */
  setBossDoors(directions: Iterable<RoomDirection>): void {
    this.bossDoorDirections = new Set(directions);
    for (const door of this.scenery.doors) {
      door.setDouble(this.bossDoorDirections.has(door.door.direction));
    }
  }

  /** The player's mid-body, in internal-frame pixels. */
  playerScreenPosition(): { readonly x: number; readonly y: number } {
    const out = this.camera.project(
      this.playerView.positionX,
      PLAYER_ANCHOR_HEIGHT,
      this.playerView.footZ,
      this.point,
    );
    return { x: out.x, y: out.y };
  }

  /** How many internal pixels `units` room units span at the player's feet — for a world-radius overlay. */
  screenLengthAtPlayer(units: number): number {
    return this.camera.projectedLength(this.playerView.positionX, this.playerView.footZ, units);
  }

  pedestalScreenPosition(pedestalIndex: number): { readonly x: number; readonly y: number } | null {
    const at = this.pedestals.itemWorldPosition(pedestalIndex);
    if (at === null) {
      return null;
    }
    const out = this.camera.project(at.x, at.height, at.z, this.point);
    return { x: out.x, y: out.y };
  }

  machineScreenPosition(): { readonly x: number; readonly y: number } | null {
    const at = this.machine.worldPosition();
    if (at === null) {
      return null;
    }
    const out = this.camera.project(at.x, at.height, at.z, this.point);
    return { x: out.x, y: out.y };
  }

  /** The floor point under internal-frame pixels `(px, py)`, in room units — click-to-pick's question. */
  worldPointAt(px: number, py: number): { readonly x: number; readonly y: number } | null {
    return this.camera.unproject(px, py, { x: 0, y: 0 });
  }

  destroy(): void {
    this.scenery.dispose();
    this.entities.destroy();
    this.playerView.destroy();
    this.projectiles.destroy();
    this.particles.destroy();
    this.decals.destroy();
    this.damageNumbers.destroy();
    this.pedestals.destroy();
    this.machine.destroy();
    this.maibaumView.destroy();
    this.bombFlightView.destroy();
    this.corpseView.destroy();
    this.labelLayer.destroy({ children: true });
  }
}
