import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import type { GameSim } from '../sim/game/sim.js';
import { ENEMY_STRIDE } from '../sim/systems/enemy.js';
import { World } from '../sim/ecs/world.js';
import { pickTileVariant } from '../render/room.js';

/**
 * Read-only sprite identification for the pixel editor's click-to-pick
 * (#108's PR follow-up): given a world-space point (already converted from
 * a screen click via `GameView.worldLayer.toLocal`, in `app/main.ts`),
 * which enemy or floor tile is there, if any — the same live sim state
 * `render/entities.ts`/`render/room.ts` already read to draw them, just
 * queried once on click instead of every frame.
 */

/**
 * How generous a click gets, relative to an enemy's real collider radius.
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
