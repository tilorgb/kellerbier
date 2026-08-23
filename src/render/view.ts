import { Container, Sprite, type Texture } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import { DamageNumberView } from './damage-numbers.js';
import { DecalView } from './decals.js';
import { EntityView } from './entities.js';
import { ParticleView } from './particles.js';
import { ProjectileView } from './projectiles.js';
import { createRoomView } from './room.js';
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
    this.world.addChild(createRoomView(sim.room));

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

  /** `alpha` is the fraction of a tick elapsed since the last simulation step. */
  sync(alpha: number): void {
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

    // Rounded to whole pixels. A camera offset by a fraction of a pixel makes
    // every sprite in the room resample, which on pixel art looks like the
    // whole screen crawling. Sway (#17) is additive alongside shake — both
    // land in the same offset, but they come from separate accumulators with
    // separate accessibility scales, so zeroing one never touches the other.
    this.world.position.set(
      Math.round(this.sim.shakeX + this.sim.swayX + this.cameraX),
      Math.round(this.sim.shakeY + this.sim.swayY + this.cameraY),
    );
  }
}
