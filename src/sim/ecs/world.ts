import {
  type Entity,
  MAX_ENTITY_SLOTS,
  entityGeneration,
  entityIndex,
  nextGeneration,
  packEntity,
} from './entity.js';

/** Every typed array the component storage supports. */
export type ComponentArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array;

export type ComponentArrayConstructor<T extends ComponentArray> = new (length: number) => T;

export interface Component<T extends ComponentArray = ComponentArray> {
  readonly id: number;
  /** Single-bit mask for this component, for building query masks. */
  readonly bit: number;
  readonly name: string;
  /** Elements per entity: 1 for a scalar, 2 for a vector, and so on. */
  readonly stride: number;
  /**
   * Structure-of-Arrays storage, indexed by `entityIndex * stride + offset`.
   *
   * Reallocated when the world grows. Read this at the top of a system, never
   * cache it across ticks — a stale reference writes into an abandoned buffer
   * and the writes silently vanish.
   */
  data: T;
}

/** Storage slot states. A slot moves Free -> Spawning -> Alive -> Dying -> Free. */
const SLOT_FREE = 0;
const SLOT_SPAWNING = 1;
const SLOT_ALIVE = 2;
const SLOT_DYING = 3;

/** Uint32 masks give 32 component types, which is more than this game needs. */
const MAX_COMPONENTS = 32;

export interface WorldOptions {
  /**
   * Slots reserved up front. Sizing this above the peak entity count is what
   * keeps `growths` at zero, and growth is the only thing here that allocates.
   */
  readonly capacity?: number;
}

/**
 * A small, purpose-built ECS.
 *
 * Structure-of-Arrays storage, dense handles with a generation counter, systems
 * as plain functions over component arrays. Structural changes are deferred, so
 * a system never mutates the set it is iterating.
 */
export class World {
  /** The slot state value that means a slot is iterable. */
  static readonly ALIVE = SLOT_ALIVE;

  private slotStates: Uint8Array;
  private slotGenerations: Uint16Array;
  private slotMasks: Uint32Array;

  private freeSlots: Uint32Array;
  private freeCount = 0;

  private spawnQueue: Uint32Array;
  private spawnCount = 0;

  private destroyQueue: Uint32Array;
  private destroyCount = 0;

  private slotCapacity: number;
  /** Slots ever handed out. Iteration stops here rather than at capacity. */
  private slotHighWater = 0;
  private liveCount = 0;
  private growthCount = 0;

  private readonly componentList: Component[] = [];

  constructor(options: WorldOptions = {}) {
    const capacity = options.capacity ?? 1024;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_ENTITY_SLOTS) {
      throw new RangeError(
        `World capacity must be an integer in [1, ${String(MAX_ENTITY_SLOTS)}], got ${String(capacity)}`,
      );
    }

    this.slotCapacity = capacity;
    this.slotStates = new Uint8Array(capacity);
    this.slotGenerations = new Uint16Array(capacity);
    this.slotMasks = new Uint32Array(capacity);
    this.freeSlots = new Uint32Array(capacity);
    this.spawnQueue = new Uint32Array(capacity);
    this.destroyQueue = new Uint32Array(capacity);

    // Generation 0 is reserved so that handle 0 is never a live entity.
    this.slotGenerations.fill(1);
  }

  /** Slots currently allocated. Grows by doubling; never shrinks. */
  get capacity(): number {
    return this.slotCapacity;
  }

  /** Entities visible to iteration. Excludes this tick's spawns and kills. */
  get count(): number {
    return this.liveCount;
  }

  /** One past the highest slot ever used — the bound for a manual loop. */
  get highWater(): number {
    return this.slotHighWater;
  }

  /**
   * Times the world has reallocated its arrays.
   *
   * This is the allocation the frame loop must not do. In steady state, with
   * capacity reserved above the peak entity count, it never moves.
   */
  get growths(): number {
    return this.growthCount;
  }

  get pendingSpawns(): number {
    return this.spawnCount;
  }

  get pendingDestroys(): number {
    return this.destroyCount;
  }

  /** Per-slot state, for hand-written system loops. Do not mutate. */
  get states(): Uint8Array {
    return this.slotStates;
  }

  /** Per-slot component mask, for hand-written system loops. Do not mutate. */
  get masks(): Uint32Array {
    return this.slotMasks;
  }

  /**
   * Registers a component type and allocates its storage.
   *
   * Define every component before the first tick: registration allocates, and
   * doing it mid-frame is exactly the allocation this design exists to avoid.
   */
  defineComponent<T extends ComponentArray>(
    name: string,
    arrayType: ComponentArrayConstructor<T>,
    stride = 1,
  ): Component<T> {
    if (this.componentList.length >= MAX_COMPONENTS) {
      throw new RangeError(`A world supports at most ${String(MAX_COMPONENTS)} component types`);
    }
    if (!Number.isInteger(stride) || stride < 1) {
      throw new RangeError(`Component stride must be a positive integer, got ${String(stride)}`);
    }
    if (this.componentList.some((existing) => existing.name === name)) {
      throw new Error(`Component "${name}" is already defined`);
    }

    const id = this.componentList.length;
    const component: Component<T> = {
      id,
      bit: 1 << id,
      name,
      stride,
      data: new arrayType(this.slotCapacity * stride),
    };
    this.componentList.push(component);
    return component;
  }

  /**
   * Builds a query mask from component types.
   *
   * Setup-time only — build a mask once and keep it, rather than rebuilding it
   * inside a system.
   */
  maskOf(...components: readonly Component[]): number {
    let mask = 0;
    for (const component of components) {
      mask |= component.bit;
    }
    return mask;
  }

  /**
   * Creates an entity and returns a usable handle immediately.
   *
   * The entity does not appear in iteration until the next `flush`. Components
   * can — and should — be attached before then.
   */
  create(): Entity {
    let index: number;
    if (this.freeCount > 0) {
      this.freeCount -= 1;
      index = this.freeSlots[this.freeCount] ?? 0;
    } else {
      if (this.slotHighWater >= this.slotCapacity) {
        this.grow();
      }
      index = this.slotHighWater;
      this.slotHighWater += 1;
    }

    this.slotStates[index] = SLOT_SPAWNING;
    this.slotMasks[index] = 0;
    this.spawnQueue[this.spawnCount] = index;
    this.spawnCount += 1;

    return packEntity(index, this.slotGenerations[index] ?? 1);
  }

  /**
   * Queues an entity for destruction.
   *
   * It leaves iteration immediately, so later systems in the same tick do not
   * process a dead entity, but its slot is not recycled until `flush`. That gap
   * is deliberate: recycling mid-tick would let a handle taken earlier in the
   * same tick silently resolve to a different entity.
   *
   * Returns false for a handle that was already dead or stale.
   */
  destroy(entity: Entity): boolean {
    if (!this.isAlive(entity)) {
      return false;
    }
    const index = entityIndex(entity);
    if (this.slotStates[index] === SLOT_ALIVE) {
      this.liveCount -= 1;
    }
    this.slotStates[index] = SLOT_DYING;
    this.destroyQueue[this.destroyCount] = index;
    this.destroyCount += 1;
    return true;
  }

  /**
   * The handle currently occupying a slot.
   *
   * Systems iterate slot indices; this is how one turns an index back into a
   * handle in order to destroy it or store it somewhere that outlives the tick.
   */
  entityAt(index: number): Entity {
    return packEntity(index, this.slotGenerations[index] ?? 1);
  }

  /** True if the handle refers to an entity that exists and is not dying. */
  isAlive(entity: Entity): boolean {
    const index = entityIndex(entity);
    if (index >= this.slotHighWater) {
      return false;
    }
    if ((this.slotGenerations[index] ?? 0) !== entityGeneration(entity)) {
      return false;
    }
    const state = this.slotStates[index] ?? SLOT_FREE;
    return state === SLOT_ALIVE || state === SLOT_SPAWNING;
  }

  /**
   * The storage slot for a live handle.
   *
   * Throws on a stale or dead handle. Systems iterate slots directly and never
   * call this; it is for code that holds a handle across ticks, which is where
   * use-after-free actually happens.
   */
  indexOf(entity: Entity): number {
    if (!this.isAlive(entity)) {
      throw new Error(
        `Entity handle ${String(entity)} is stale or dead ` +
          `(slot ${String(entityIndex(entity))}, generation ${String(entityGeneration(entity))})`,
      );
    }
    return entityIndex(entity);
  }

  /** Attaches a component and zeroes its storage for this entity. */
  add(entity: Entity, component: Component): void {
    const index = this.indexOf(entity);
    this.slotMasks[index] = (this.slotMasks[index] ?? 0) | component.bit;
    // Recycled slots carry the previous occupant's values. Zeroing here is what
    // makes a fresh entity's component state a function of the code that set it,
    // rather than of whatever happened to die in this slot earlier.
    const start = index * component.stride;
    component.data.fill(0, start, start + component.stride);
  }

  /** Detaches a component. Its storage is left alone until reattached. */
  remove(entity: Entity, component: Component): void {
    const index = this.indexOf(entity);
    this.slotMasks[index] = (this.slotMasks[index] ?? 0) & ~component.bit;
  }

  has(entity: Entity, component: Component): boolean {
    if (!this.isAlive(entity)) {
      return false;
    }
    return ((this.slotMasks[entityIndex(entity)] ?? 0) & component.bit) !== 0;
  }

  /**
   * Applies queued structural changes.
   *
   * Call once per tick at a defined point — after every system has run.
   */
  flush(): void {
    for (let i = 0; i < this.spawnCount; i++) {
      const index = this.spawnQueue[i] ?? 0;
      if (this.slotStates[index] === SLOT_SPAWNING) {
        this.slotStates[index] = SLOT_ALIVE;
        this.liveCount += 1;
      }
    }
    this.spawnCount = 0;

    for (let i = 0; i < this.destroyCount; i++) {
      const index = this.destroyQueue[i] ?? 0;
      if (this.slotStates[index] !== SLOT_DYING) {
        continue;
      }
      this.slotStates[index] = SLOT_FREE;
      this.slotMasks[index] = 0;
      this.slotGenerations[index] = nextGeneration(this.slotGenerations[index] ?? 1);
      this.freeSlots[this.freeCount] = index;
      this.freeCount += 1;
    }
    this.destroyCount = 0;
  }

  /**
   * Runs `visit` for every live entity carrying all components in `mask`.
   *
   * Allocation-free as long as `visit` is a hoisted function rather than a
   * closure created per call. Hot systems should loop over `highWater` and
   * `masks` directly instead.
   */
  forEach(mask: number, visit: (index: number) => void): void {
    const states = this.slotStates;
    const masks = this.slotMasks;
    for (let index = 0; index < this.slotHighWater; index++) {
      if (states[index] !== SLOT_ALIVE) {
        continue;
      }
      if (((masks[index] ?? 0) & mask) !== mask) {
        continue;
      }
      visit(index);
    }
  }

  /** Doubles every array. The only allocation in the whole class. */
  private grow(): void {
    const capacity = Math.min(this.slotCapacity * 2, MAX_ENTITY_SLOTS);
    if (capacity === this.slotCapacity) {
      throw new RangeError(`World is full at ${String(MAX_ENTITY_SLOTS)} entity slots`);
    }

    const states = new Uint8Array(capacity);
    states.set(this.slotStates);
    this.slotStates = states;

    const generations = new Uint16Array(capacity);
    // New slots start at generation 1, then the old values overwrite the front.
    generations.fill(1);
    generations.set(this.slotGenerations);
    this.slotGenerations = generations;

    const masks = new Uint32Array(capacity);
    masks.set(this.slotMasks);
    this.slotMasks = masks;

    const freeSlots = new Uint32Array(capacity);
    freeSlots.set(this.freeSlots);
    this.freeSlots = freeSlots;

    const spawnQueue = new Uint32Array(capacity);
    spawnQueue.set(this.spawnQueue);
    this.spawnQueue = spawnQueue;

    const destroyQueue = new Uint32Array(capacity);
    destroyQueue.set(this.destroyQueue);
    this.destroyQueue = destroyQueue;

    for (const component of this.componentList) {
      const arrayType = component.data.constructor as ComponentArrayConstructor<ComponentArray>;
      const grown = new arrayType(capacity * component.stride);
      grown.set(component.data);
      component.data = grown;
    }

    this.slotCapacity = capacity;
    this.growthCount += 1;
  }
}
