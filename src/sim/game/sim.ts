import { type Component, World } from '../ecs/world.js';
import { type Entity, entityIndex } from '../ecs/entity.js';
import type { InputFrame } from '../input/frame.js';
import { createInputFrame } from '../input/frame.js';
import { type RunRandom, createRunRandom } from '../rng/streams.js';
import type { RoomGeometry } from '../room/geometry.js';
import { createPlaygroundRoom } from '../room/playground.js';
import { type SimTuning, createTuning } from '../tuning.js';
import { stepPlayerMovement } from '../systems/movement.js';

/** Entity slots reserved up front. Sized well above M1's population. */
const DEFAULT_CAPACITY = 8192;

/** Collider radius of the player, in pixels. */
export const PLAYER_RADIUS = 7;

export interface GameSimOptions {
  readonly seed?: number;
  readonly capacity?: number;
  readonly room?: RoomGeometry;
}

/**
 * One running game.
 *
 * Owns the world, the component storage, the room and the tuning, and advances
 * all of it by exactly one tick at a time. It reads a single `InputFrame` per
 * tick and nothing else — no clock, no DOM, no renderer — which is what makes a
 * run reproducible from a seed and an input log.
 */
export class GameSim {
  readonly world: World;
  readonly random: RunRandom;
  readonly room: RoomGeometry;
  readonly tuning: SimTuning;
  readonly seed: number;

  /** Position and the previous tick's position, for render interpolation. */
  readonly transform: Component<Float32Array>;
  /** Velocity in pixels per tick. */
  readonly velocity: Component<Float32Array>;
  /** Collider radius and mass. Mass is what knockback is divided by. */
  readonly body: Component<Float32Array>;

  /** Ticks run since construction. */
  private currentTick = 0;

  private readonly playerHandle: Entity;

  /** Neutral input, used when a caller steps without supplying a frame. */
  private readonly idleInput = createInputFrame();

  constructor(options: GameSimOptions = {}) {
    this.seed = options.seed ?? 0;
    this.world = new World({ capacity: options.capacity ?? DEFAULT_CAPACITY });
    this.random = createRunRandom(this.seed);
    this.room = options.room ?? createPlaygroundRoom();
    this.tuning = createTuning();

    this.transform = this.world.defineComponent('transform', Float32Array, 4);
    this.velocity = this.world.defineComponent('velocity', Float32Array, 2);
    this.body = this.world.defineComponent('body', Float32Array, 2);

    this.playerHandle = this.spawnPlayer();
    this.world.flush();
  }

  get tick(): number {
    return this.currentTick;
  }

  get player(): Entity {
    return this.playerHandle;
  }

  /** The player's storage slot. Stable for the lifetime of the run. */
  get playerIndex(): number {
    return entityIndex(this.playerHandle);
  }

  /** Advances the simulation exactly one tick. */
  step(input: Readonly<InputFrame> = this.idleInput): void {
    stepPlayerMovement(this, input);
    this.world.flush();
    this.currentTick += 1;
  }

  /** Reads a transform field without the index arithmetic at every call site. */
  positionX(index: number): number {
    return this.transform.data[index * 4] ?? 0;
  }

  positionY(index: number): number {
    return this.transform.data[index * 4 + 1] ?? 0;
  }

  previousX(index: number): number {
    return this.transform.data[index * 4 + 2] ?? 0;
  }

  previousY(index: number): number {
    return this.transform.data[index * 4 + 3] ?? 0;
  }

  private spawnPlayer(): Entity {
    const entity = this.world.create();
    this.world.add(entity, this.transform);
    this.world.add(entity, this.velocity);
    this.world.add(entity, this.body);

    const index = entityIndex(entity);
    const startX = (this.room.minX + this.room.maxX) / 2;
    const startY = (this.room.minY + this.room.maxY) / 2;
    const transform = this.transform.data;
    transform[index * 4] = startX;
    transform[index * 4 + 1] = startY;
    transform[index * 4 + 2] = startX;
    transform[index * 4 + 3] = startY;

    const body = this.body.data;
    body[index * 2] = PLAYER_RADIUS;
    body[index * 2 + 1] = 1;

    return entity;
  }
}
