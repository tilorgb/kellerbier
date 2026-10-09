import { NO_SLOT, SlotPool } from '../pool/slot-pool.js';

/**
 * Splashes left on the floor where something died.
 *
 * They persist for the room rather than fading. That is the whole value of
 * them: a floor that gradually becomes a record of the fight tells the player
 * that what they did mattered, and it costs one sprite each. A decal that fades
 * out after two seconds is a particle with extra steps.
 */

/**
 * What a kill leaves on the floor, by what the creature was made of. Presentational
 * like `deathEffect`: it never changes what a run does, only what the floor looks
 * like afterwards. A living thing bleeds, an insect leaks, a fungus puffs, a
 * machine sheds scrap, a barrel splinters, a gnome shatters.
 */
export const DecalKind = {
  Blood: 0,
  Ichor: 1,
  Spores: 2,
  Metal: 3,
  Wood: 4,
  Shards: 5,
} as const;
export type DecalKindId = (typeof DecalKind)[keyof typeof DecalKind];
export const DECAL_KIND_COUNT = 6;

/** The names a definition authors `remains` with. */
export const REMAINS_KINDS: Readonly<Record<string, DecalKindId>> = {
  blood: DecalKind.Blood,
  ichor: DecalKind.Ichor,
  spores: DecalKind.Spores,
  metal: DecalKind.Metal,
  wood: DecalKind.Wood,
  shards: DecalKind.Shards,
};

/** Look-alike drawings per kind, so a floor of kills does not look stamped. */
export const DECAL_VARIANTS = 4;

/** Decals kept at once. The oldest gives way rather than the floor filling up. */
export const DECAL_CAPACITY = 64;

export class DecalStore {
  readonly capacity: number;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly size: Float32Array;
  /** Rotation in radians, so a floor of splashes does not look stamped. */
  readonly rotation: Float32Array;
  /** A `DecalKind`. */
  readonly kind: Uint8Array;
  /** Which of the kind's `DECAL_VARIANTS` drawings. */
  readonly variant: Uint8Array;

  private readonly pool: SlotPool;

  constructor(capacity: number = DECAL_CAPACITY) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.rotation = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.variant = new Uint8Array(capacity);
    this.pool = new SlotPool({ name: 'decals', capacity, overflow: 'recycleOldest' });
  }

  get liveCount(): number {
    return this.pool.used;
  }

  spawn(
    x: number,
    y: number,
    size: number,
    rotation: number,
    kind: DecalKindId = DecalKind.Blood,
    variant = 0,
  ): number {
    const index = this.pool.acquire();
    if (index === NO_SLOT) {
      return NO_SLOT;
    }
    this.x[index] = x;
    this.y[index] = y;
    this.size[index] = size;
    this.rotation[index] = rotation;
    this.kind[index] = kind;
    this.variant[index] = variant % DECAL_VARIANTS;
    return index;
  }

  forEachLive(visit: (index: number) => void): void {
    this.pool.forEachLive(visit);
  }

  /** Called when a room is left. Splashes do not follow the player around. */
  clear(): void {
    this.pool.reset();
  }
}
