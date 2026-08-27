import { Assets, type Texture } from 'pixi.js';
import cellarFloorTileUrl from '../../assets/sprites/floor-1-cellar/tiles/cellar-floor.png';
import kellerasselUrl from '../../assets/sprites/floor-1-cellar/characters/kellerassel.png';
import bierratteUrl from '../../assets/sprites/floor-1-cellar/characters/bierratte.png';
import schimmelfleckUrl from '../../assets/sprites/floor-1-cellar/characters/schimmelfleck.png';
import schimmelsporeUrl from '../../assets/sprites/floor-1-cellar/characters/schimmelspore.png';
import zapfhahnUrl from '../../assets/sprites/floor-1-cellar/characters/zapfhahn.png';
import rollfassUrl from '../../assets/sprites/floor-1-cellar/characters/rollfass.png';
import fasssplitterUrl from '../../assets/sprites/floor-1-cellar/characters/fasssplitter.png';
import ruralFloorTileUrl from '../../assets/sprites/floor-2-rural/tiles/rural-floor.png';
import bauerUrl from '../../assets/sprites/floor-2-rural/characters/bauer.png';
import kuhUrl from '../../assets/sprites/floor-2-rural/characters/kuh.png';
import gockelUrl from '../../assets/sprites/floor-2-rural/characters/gockel.png';
import gartenzwergUrl from '../../assets/sprites/floor-2-rural/characters/gartenzwerg.png';
import blaskapellistUrl from '../../assets/sprites/floor-2-rural/characters/blaskapellist.png';
import traktorUrl from '../../assets/sprites/floor-2-rural/characters/traktor.png';

/** The two per-floor art maps `GameViewTextures` needs (#35). */
export interface FloorArt {
  readonly floorTiles: Readonly<Record<number, Texture>>;
  readonly enemyArt: Readonly<Record<string, Texture>>;
}

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
export async function loadFloorArt(): Promise<FloorArt> {
  const [cellarFloorTexture, ruralFloorTexture, enemyEntries] = await Promise.all([
    Assets.load<Texture>({ src: cellarFloorTileUrl, data: { scaleMode: 'nearest' } }),
    Assets.load<Texture>({ src: ruralFloorTileUrl, data: { scaleMode: 'nearest' } }),
    Promise.all(
      ENEMY_SPRITE_URLS.map(
        async ([id, src]) =>
          [id, await Assets.load<Texture>({ src, data: { scaleMode: 'nearest' } })] as const,
      ),
    ),
  ]);
  return {
    floorTiles: { 1: cellarFloorTexture, 2: ruralFloorTexture },
    enemyArt: Object.fromEntries(enemyEntries),
  };
}
