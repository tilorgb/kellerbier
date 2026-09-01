import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import type { GameSim } from '../sim/game/sim.js';
import { ENEMY_STRIDE } from '../sim/systems/enemy.js';
import { World } from '../sim/ecs/world.js';
import { BLOCK_STRIDE } from '../sim/room/geometry.js';
import { pickTileVariant } from '../render/room.js';
import { PROP_TILE_NAMES } from '../render/floor-art.js';

/**
 * Read-only sprite identification for the pixel editor's click-to-pick
 * (#108's PR follow-up): given a world-space point (already converted from
 * a screen click via `GameView.worldLayer.toLocal`, in `app/main.ts`),
 * which body — player, enemy, destructible prop, decorative prop, authored
 * wall obstacle, or floor tile — is there, if any. The same live sim/render
 * state that already draws each of those, just queried once on click instead
 * of every frame.
 *
 * Checked in this order by `app/main.ts`: enemy, player, destructible prop,
 * decorative prop, wall obstacle, floor tile — the same "most specific wins"
 * rule `pickEnemyAt`'s doc comment already established for enemy-over-tile,
 * extended to the other things a click can land on.
 */

/**
 * How generous a click gets, relative to a body's real collider radius.
 *
 * The collider is a gameplay hitbox (`sim/enemy/size.ts`'s `ENEMY_PROFILES`
 * — 4 to 10 world units), tuned for combat feel, not for a mouse. A "normal"
 * enemy's rendered sprite is a `2*radius`-square bounding box around that
 * circle (`EntityView`'s uniform `radius / (referenceHeight / 2)` scale), so
 * even a pixel-perfect click on a visible corner of the sprite already
 * misses the inscribed circle — and a real click is never pixel-perfect on
 * top of that. Padding the pick radius well past the collider is what makes
 * "click the sprite you can see" actually work, rather than only working for
 * clicks that happen to land within a few world units of dead centre.
 */
const PICK_RADIUS_MULTIPLIER = 2.5;

/** The closest alive enemy whose (generously padded, see `PICK_RADIUS_MULTIPLIER`) collider contains `(worldX, worldY)`, by id — `null` if none does. */
export function pickEnemyAt(sim: GameSim, worldX: number, worldY: number): string | null {
  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const body = sim.body.data;
  const enemyData = sim.enemy.data;

  let bestId: string | null = null;
  let bestDistance = Infinity;
  for (let index = 0; index < world.highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    if (((masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
      continue;
    }
    const radius = (body[index * 2] ?? 1) * PICK_RADIUS_MULTIPLIER;
    const dx = sim.positionX(index) - worldX;
    const dy = sim.positionY(index) - worldY;
    const distance = Math.hypot(dx, dy);
    if (distance <= radius && distance < bestDistance) {
      bestDistance = distance;
      bestId = sim.enemies.at(enemyData[index * ENEMY_STRIDE] ?? 0).id;
    }
  }
  return bestId;
}

/**
 * `true` when `(worldX, worldY)` falls within Alois's own (generously
 * padded) collider — `render/player-view.ts`'s `PlayerView` is the one body
 * in the game not drawn through the ECS entity loop `pickEnemyAt`/
 * `pickPropAt` both walk, so it needs its own point-in-circle check rather
 * than a scan.
 */
export function pickPlayerAt(sim: GameSim, worldX: number, worldY: number): boolean {
  const index = sim.playerIndex;
  const radius = (sim.body.data[index * 2] ?? 1) * PICK_RADIUS_MULTIPLIER;
  const dx = sim.positionX(index) - worldX;
  const dy = sim.positionY(index) - worldY;
  return Math.hypot(dx, dy) <= radius;
}

/**
 * The closest alive destructible prop (a barrel, a Maibaum — anything
 * `GameSim.spawnTarget` created) whose padded collider contains
 * `(worldX, worldY)`, resolved to the tile sprite name it is actually drawn
 * from — `destructibleNames`, this floor's `FloorTileset.destructibles` in
 * `DESTRUCTIBLE_PROP_KINDS` order, the exact table `EntityView` reads at
 * render time (`render/entities.ts`'s `targetTextures`). `null` if nothing
 * is there.
 *
 * Filtered the same way `EntityView`'s per-entity render loop decides "this
 * is a prop target, not a pickup or an enemy body" — not by collision layer
 * alone, since a rolling Bierfassl keg (`GameSim.spawnBierfassl`) shares the
 * `Obstacle` layer with a real prop target without being one; matching the
 * render loop's own discriminant means this always agrees with what a click
 * can actually see.
 */
export function pickPropAt(
  sim: GameSim,
  worldX: number,
  worldY: number,
  destructibleNames: readonly string[],
): string | null {
  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const collision = sim.collision.data;
  const body = sim.body.data;
  const propKind = sim.propKind.data;

  let bestName: string | null = null;
  let bestDistance = Infinity;
  for (let index = 0; index < world.highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    if (((masks[index] ?? 0) & sim.collidableMask) !== sim.collidableMask) {
      continue;
    }
    const layer = collision[index * 2] ?? 0;
    if ((layer & (CollisionLayer.Player | CollisionLayer.Pickup)) !== 0) {
      continue;
    }
    if (((masks[index] ?? 0) & sim.enemyMask) === sim.enemyMask) {
      continue;
    }
    const radius = (body[index * 2] ?? 1) * PICK_RADIUS_MULTIPLIER;
    const dx = sim.positionX(index) - worldX;
    const dy = sim.positionY(index) - worldY;
    const distance = Math.hypot(dx, dy);
    if (distance <= radius && distance < bestDistance) {
      bestDistance = distance;
      const kind = propKind[index] ?? 0;
      bestName = destructibleNames[kind] ?? destructibleNames[0] ?? null;
    }
  }
  return bestName;
}

/**
 * The closest authored *decorative* prop (art-only — a fence post, a well, a
 * crate; never `barrel`/`maypole`/`pedestal`, which `PROP_TILE_NAMES` maps to
 * `null` because something else already draws those) within one tile of
 * `(worldX, worldY)`, resolved to its tile sprite name — `null` if nothing
 * is there or the room has no decorative props.
 */
export function pickDecorativePropAt(sim: GameSim, worldX: number, worldY: number): string | null {
  const pickRadius = (ROOM_TILE_UNITS / 2) * PICK_RADIUS_MULTIPLIER;
  let bestName: string | null = null;
  let bestDistance = Infinity;
  for (const prop of sim.roomDecorativeProps) {
    const tileName = PROP_TILE_NAMES[prop.type];
    if (tileName === null || tileName === undefined) {
      continue;
    }
    const distance = Math.hypot(prop.x - worldX, prop.y - worldY);
    if (distance <= pickRadius && distance < bestDistance) {
      bestDistance = distance;
      bestName = tileName;
    }
  }
  return bestName;
}

/**
 * The obstacle-variant sprite name at `(worldX, worldY)`, or `null` if the
 * point is not inside an authored *obstacle* rectangle (the room editor's
 * Wall tool — `RoomObstacle`, `sim/room/geometry.ts`'s `RoomGeometry.blocks`
 * with `blockOverflyable` set).
 *
 * `render/room.ts` draws an obstacle rect as one boulder per cell, picked off
 * the same `pickTileVariant` hash the floor mix uses, so this resolves the
 * click to the exact variant sitting under the cursor rather than always
 * variant 0 — the obstacle equivalent of `pickTileNameAt`.
 *
 * Excludes a shape's own void cells (`L`/`T`'s missing corners), which share
 * the `blocks` array but with `blockOverflyable` unset — those stand in for
 * the wall, and clicking one should find nothing here.
 */
export function pickObstacleBlockNameAt(
  sim: GameSim,
  worldX: number,
  worldY: number,
  blockVariantNames: readonly string[],
): string | null {
  if (blockVariantNames.length === 0) {
    return null;
  }
  const room = sim.room;
  for (let index = 0; index < room.blockCount; index++) {
    if (room.blockOverflyable[index] !== 1) {
      continue;
    }
    const base = index * BLOCK_STRIDE;
    const minX = room.blocks[base] ?? 0;
    const minY = room.blocks[base + 1] ?? 0;
    const maxX = room.blocks[base + 2] ?? 0;
    const maxY = room.blocks[base + 3] ?? 0;
    if (worldX >= minX && worldX < maxX && worldY >= minY && worldY < maxY) {
      const col = Math.floor(worldX / ROOM_TILE_UNITS);
      const row = Math.floor(worldY / ROOM_TILE_UNITS);
      const variant = pickTileVariant(col, row, blockVariantNames.length);
      return blockVariantNames[variant] ?? blockVariantNames[0] ?? null;
    }
  }
  return null;
}

/**
 * The tile sprite name at `(worldX, worldY)`'s grid cell, for `floor` —
 * `null` outside the current room's own bounds, or if that floor has no
 * tile art loaded yet. Calls the exact same `pickTileVariant` hash
 * `render/room.ts` used when it actually drew that cell, so this returns
 * the name of the texture really sitting there, not a guess.
 */
export function pickTileNameAt(
  sim: GameSim,
  floor: number,
  worldX: number,
  worldY: number,
  tileVariantNames: Readonly<Record<number, readonly string[]>>,
): string | null {
  const room = sim.room;
  if (worldX < room.minX || worldX >= room.maxX || worldY < room.minY || worldY >= room.maxY) {
    return null;
  }
  const names = tileVariantNames[floor];
  if (names === undefined || names.length === 0) {
    return null;
  }
  const col = Math.floor(worldX / ROOM_TILE_UNITS);
  const row = Math.floor(worldY / ROOM_TILE_UNITS);
  const variant = pickTileVariant(col, row, names.length);
  return names[variant] ?? null;
}
