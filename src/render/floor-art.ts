import { Assets, type Texture } from 'pixi.js';
import cellarFloorTileUrl from '../../assets/sprites/floor-1-cellar/tiles/cellar-floor.png';
import kellerasselUrl from '../../assets/sprites/floor-1-cellar/characters/kellerassel.png';
import bierratteUrl from '../../assets/sprites/floor-1-cellar/characters/bierratte.png';
import schimmelfleckUrl from '../../assets/sprites/floor-1-cellar/characters/schimmelfleck.png';
import schimmelsporeUrl from '../../assets/sprites/floor-1-cellar/characters/schimmelspore.png';
import zapfhahnUrl from '../../assets/sprites/floor-1-cellar/characters/zapfhahn.png';
import rollfassUrl from '../../assets/sprites/floor-1-cellar/characters/rollfass.png';
import fasssplitterUrl from '../../assets/sprites/floor-1-cellar/characters/fasssplitter.png';
import ruralFloorTile1Url from '../../assets/sprites/floor-2-rural/tiles/rural-floor-1.png';
import ruralFloorTile2Url from '../../assets/sprites/floor-2-rural/tiles/rural-floor-2.png';
import ruralFloorTile3Url from '../../assets/sprites/floor-2-rural/tiles/rural-floor-3.png';
import ruralFloorTile4Url from '../../assets/sprites/floor-2-rural/tiles/rural-floor-4.png';
import bauerUrl from '../../assets/sprites/floor-2-rural/characters/bauer.png';
import kuhUrl from '../../assets/sprites/floor-2-rural/characters/kuh.png';
import gockelUrl from '../../assets/sprites/floor-2-rural/characters/gockel.png';
import gartenzwergUrl from '../../assets/sprites/floor-2-rural/characters/gartenzwerg.png';
import blaskapellistUrl from '../../assets/sprites/floor-2-rural/characters/blaskapellist.png';
import traktorUrl from '../../assets/sprites/floor-2-rural/characters/traktor.png';

/**
 * The two per-floor art maps `GameViewTextures` needs (#35).
 *
 * `floorTiles` holds one or more tile variants per floor — Floor 2's "living
 * floor" (#37) draws from four, one of them picked per floor cell by a
 * deterministic hash of that cell's position (`render/room.ts`'s
 * `pickTileVariant`) rather than tiling one texture, so two cells never look
 * identical by coincidence the way a single repeating texture guarantees.
 * The pick happens once, when the room is built — nothing re-rolls it on a
 * later redraw, so a room's floor stays exactly as it was drawn.
 */
export interface FloorArt {
  readonly floorTiles: Readonly<Record<number, readonly Texture[]>>;
  readonly enemyArt: Readonly<Record<string, Texture>>;
  /**
   * The same tile `Texture`s as `floorTiles`, keyed by sprite name
   * (`cellar-floor`, `rural-floor-2`, ...) instead of floor number — for
   * `app/live-art-preview.ts` (#108), which needs to find "the texture for
   * this named sprite" without knowing `pickTileVariant`'s per-floor
   * ordering. Same `Texture` objects, not copies: mutating one through this
   * map is mutating the one `floorTiles`/`RoomView` already draws with.
   */
  readonly tileTextures: Readonly<Record<string, Texture>>;
  /**
   * `(bucketId, category)` for every name in `enemyArt`/`tileTextures` —
   * `app/main.ts`'s click-to-pick (#108) needs this to hand the pixel
   * editor a full `(bucketId, category, name)` target, not just the name a
   * click resolved to.
   */
  readonly spriteOrigins: Readonly<
    Record<string, { bucketId: string; category: 'character' | 'tile' }>
  >;
  /** `floorTiles[floor]`'s texture order, by name instead of `Texture` — `render/room.ts`'s `pickTileVariant` returns an index into this same order. */
  readonly tileVariantNames: Readonly<Record<number, readonly string[]>>;
}

const CELLAR_ENEMY_IDS = [
  'kellerassel',
  'bierratte',
  'schimmelfleck',
  'schimmelspore',
  'zapfhahn',
  'rollfass',
  'fasssplitter',
] as const;

const RURAL_ENEMY_IDS = [
  'bauer',
  'kuh',
  'gockel',
  'gartenzwerg',
  'blaskapellist',
  'traktor',
] as const;

const ENEMY_SPRITE_URLS = [
  ['kellerassel', kellerasselUrl],
  ['bierratte', bierratteUrl],
  ['schimmelfleck', schimmelfleckUrl],
  ['schimmelspore', schimmelsporeUrl],
  ['zapfhahn', zapfhahnUrl],
  ['rollfass', rollfassUrl],
  ['fasssplitter', fasssplitterUrl],
  ['bauer', bauerUrl],
  ['kuh', kuhUrl],
  ['gockel', gockelUrl],
  ['gartenzwerg', gartenzwergUrl],
  ['blaskapellist', blaskapellistUrl],
  ['traktor', traktorUrl],
] as const;

/**
 * Loads every floor's authored art — today, Floor 1's tile and Der Keller's
 * enemy roster (#35), plus Floor 2's tile and the Dorf & Acker roster (#37)
 * — and returns it shaped for `GameViewTextures.floorTiles`/`enemyArt`.
 *
 * One shared loader rather than each entry point (`app/main.ts`,
 * `editor/playtest.ts`) repeating the same `Assets.load` calls: both want
 * the same bundle, and a room-editor preview of a floor-1 room benefits
 * from the real art exactly the way a real run does — "which blob was
 * that" is a room-design question as much as a playtesting one. Loading it
 * unconditionally, regardless of which floor is actually being previewed,
 * is harmless: `createRoomView`/`EntityView` only ever look up a floor
 * number or enemy id that this bundle actually has an entry for, so a
 * floor-3 preview simply never touches any of it.
 */
const RURAL_FLOOR_TILE_URLS = [
  ruralFloorTile1Url,
  ruralFloorTile2Url,
  ruralFloorTile3Url,
  ruralFloorTile4Url,
] as const;

async function loadTile(src: string): Promise<Texture> {
  return Assets.load<Texture>({ src, data: { scaleMode: 'nearest' } });
}

/** Matches `RURAL_FLOOR_TILE_URLS`'s order — the sprite names those same four files are authored under in `assets/sprites/floor-2-rural/tiles/`. */
const RURAL_FLOOR_TILE_NAMES = [
  'rural-floor-1',
  'rural-floor-2',
  'rural-floor-3',
  'rural-floor-4',
] as const;

export async function loadFloorArt(): Promise<FloorArt> {
  const [cellarFloorTexture, ruralFloorTextures, enemyEntries] = await Promise.all([
    loadTile(cellarFloorTileUrl),
    Promise.all(RURAL_FLOOR_TILE_URLS.map(loadTile)),
    Promise.all(
      ENEMY_SPRITE_URLS.map(
        async ([id, src]) =>
          [id, await Assets.load<Texture>({ src, data: { scaleMode: 'nearest' } })] as const,
      ),
    ),
  ]);
  const spriteOrigins: Record<string, { bucketId: string; category: 'character' | 'tile' }> = {
    'cellar-floor': { bucketId: 'floor-1-cellar', category: 'tile' },
  };
  for (const name of RURAL_FLOOR_TILE_NAMES) {
    spriteOrigins[name] = { bucketId: 'floor-2-rural', category: 'tile' };
  }
  for (const id of CELLAR_ENEMY_IDS) {
    spriteOrigins[id] = { bucketId: 'floor-1-cellar', category: 'character' };
  }
  for (const id of RURAL_ENEMY_IDS) {
    spriteOrigins[id] = { bucketId: 'floor-2-rural', category: 'character' };
  }

  return {
    floorTiles: { 1: [cellarFloorTexture], 2: ruralFloorTextures },
    enemyArt: Object.fromEntries(enemyEntries),
    tileTextures: {
      'cellar-floor': cellarFloorTexture,
      ...Object.fromEntries(
        RURAL_FLOOR_TILE_NAMES.map((name, index) => [name, ruralFloorTextures[index]]),
      ),
    },
    spriteOrigins,
    tileVariantNames: { 1: ['cellar-floor'], 2: RURAL_FLOOR_TILE_NAMES },
  };
}
