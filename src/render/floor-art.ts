import { Assets, Rectangle, Texture } from 'pixi.js';
import cellarFloorTileUrl from '../../assets/sprites/floor-1-cellar/tiles/cellar-floor.png';
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
import {
  compileAnimationSet,
  type AnimationSidecar,
  type CompiledAnimationSet,
} from './animation/definition.js';

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
  /**
   * Animated character art (#150), keyed by `EnemyDefinition.id` the same way
   * `enemyArt` is — one entry per `name.strip.png` found under any bucket's
   * `characters/` folder, with its frames already cut out of the strip and its
   * `*.anim.json` clips compiled.
   *
   * An enemy appears in here *or* in `enemyArt` with a single static texture,
   * never both: `tools/art/scan.mjs` fails the build on a name authored twice.
   * `enemyArt` still carries the strip's first frame, though, because
   * everything else that looks art up by name — click-to-pick (#108), the
   * minimap, anything a later issue adds — wants "a texture for this creature"
   * and does not care that it happens to be animated.
   */
  readonly enemyStrips: Readonly<Record<string, LoadedStrip>>;
}

/** One animated sprite as loaded: frames cut from the strip, plus its compiled clips. */
export interface LoadedStrip {
  readonly frames: readonly Texture[];
  readonly clips: CompiledAnimationSet;
}

/**
 * What `EntityView` draws an animated body from: the strip's frames, the same
 * frames as white silhouettes for the hit flash (#37's per-enemy flash, one
 * per frame now rather than one per creature), and the clips.
 *
 * Assembled by `buildAnimatedSets` rather than by `loadFloorArt`, because a
 * silhouette needs a `Renderer` to generate and the loader deliberately has
 * no renderer — it is called from two entry points and from tests.
 */
export interface AnimatedSpriteSet extends LoadedStrip {
  readonly flashFrames: readonly Texture[];
}

/**
 * Every `characters/*.strip.png` in the tree, and every `*.anim.json` beside
 * one, resolved at build time by Vite.
 *
 * `floor-*` rather than every bucket: `common/` holds Alois's own strips
 * (#151), which are keyed by facing rather than by enemy id and loaded by
 * `render/player-art.ts`. The rule that draws the line is not a naming
 * convention — it is that a floor bucket *is* a roster, and this map is
 * indexed by `EnemyDefinition.id`.
 *
 * A glob rather than the explicit static imports the static sprites above
 * still use, and deliberately so: an animated creature has to be addable by
 * dropping two files in a folder (`CONTRIBUTING.md`'s content
 * definition-of-done — "authored as data, with no engine change required to
 * add the next one"), and a list of `import` statements in this file is
 * exactly the engine change that bar rules out. `import.meta.glob` is the
 * same build-time scan `src/pixel-editor/static-sprite-index.ts` uses for the
 * same reason, and it works in `vite dev` and in a production build alike.
 */
const STRIP_URLS: Record<string, string> = import.meta.glob(
  '../../assets/sprites/floor-*/characters/*.strip.png',
  { eager: true, query: '?url', import: 'default' },
);

const STRIP_SIDECARS: Record<string, AnimationSidecar> = import.meta.glob(
  '../../assets/sprites/floor-*/characters/*.anim.json',
  { eager: true, import: 'default' },
);

const STRIP_PATH_PATTERN = /\/assets\/sprites\/([^/]+)\/characters\/([^/]+)\.strip\.png$/;

/**
 * Cuts a strip into per-frame `Texture`s and compiles its sidecar.
 *
 * The frames share one `TextureSource` and differ only by their frame
 * rectangle, which is the whole reason an animation is authored as a strip
 * rather than as N files: swapping `Sprite.texture` between them is a
 * rectangle change, not a texture bind, so a room full of walking enemies
 * stays inside one draw call (`CONTRIBUTING.md`'s art definition-of-done:
 * "no batch-breakers").
 */
export function cutStrip(name: string, base: Texture, sidecar: AnimationSidecar): LoadedStrip {
  const frameCount = sidecar.frames;
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new Error(`${name}.anim.json: "frames" must be a positive integer`);
  }
  if (base.width % frameCount !== 0) {
    throw new Error(
      `${name}.strip.png is ${String(base.width)}px wide, which does not divide into the ` +
        `${String(frameCount)} frame(s) ${name}.anim.json declares`,
    );
  }
  const frameWidth = base.width / frameCount;
  const frames: Texture[] = [];
  for (let frame = 0; frame < frameCount; frame++) {
    frames.push(
      new Texture({
        source: base.source,
        frame: new Rectangle(
          base.frame.x + frame * frameWidth,
          base.frame.y,
          frameWidth,
          base.height,
        ),
      }),
    );
  }
  return { frames, clips: compileAnimationSet(name, sidecar, frameCount) };
}

/**
 * Adds the per-frame hit-flash silhouettes an `AnimatedSpriteSet` needs.
 *
 * `silhouette` is `render/placeholder-art.ts`'s `createSilhouetteTexture`
 * bound to a renderer — passed in so this stays callable from the two entry
 * points that have one and from tests that do not.
 */
export function buildAnimatedSets(
  strips: Readonly<Record<string, LoadedStrip>>,
  silhouette: (texture: Texture) => Texture,
): Record<string, AnimatedSpriteSet> {
  const sets: Record<string, AnimatedSpriteSet> = {};
  for (const [name, strip] of Object.entries(strips)) {
    sets[name] = { ...strip, flashFrames: strip.frames.map(silhouette) };
  }
  return sets;
}

async function loadStrips(): Promise<Record<string, LoadedStrip>> {
  const strips: Record<string, LoadedStrip> = {};
  for (const [path, url] of Object.entries(STRIP_URLS)) {
    const match = STRIP_PATH_PATTERN.exec(path);
    const name = match?.[2];
    if (name === undefined) {
      continue;
    }
    const sidecarPath = path.replace('.strip.png', '.anim.json');
    const sidecar = STRIP_SIDECARS[sidecarPath];
    if (sidecar === undefined) {
      // `tools/art/scan.mjs` already fails the build on a strip with no
      // sidecar, so this is unreachable through the art pipeline. Thrown
      // rather than skipped anyway: a strip the game silently declines to
      // animate is the exact failure mode #150 is meant to remove.
      throw new Error(`${name}.strip.png has no ${name}.anim.json sidecar next to it`);
    }
    const base = await Assets.load<Texture>({ src: url, data: { scaleMode: 'nearest' } });
    strips[name] = cutStrip(name, base, sidecar);
  }
  return strips;
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
  const [cellarFloorTexture, ruralFloorTextures, enemyEntries, enemyStrips] = await Promise.all([
    loadTile(cellarFloorTileUrl),
    Promise.all(RURAL_FLOOR_TILE_URLS.map(loadTile)),
    Promise.all(
      ENEMY_SPRITE_URLS.map(
        async ([id, src]) =>
          [id, await Assets.load<Texture>({ src, data: { scaleMode: 'nearest' } })] as const,
      ),
    ),
    loadStrips(),
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
    // An animated creature's first frame stands in as "its texture" for
    // everything that looks art up by name and does not care about clips.
    enemyArt: {
      ...Object.fromEntries(enemyEntries),
      ...Object.fromEntries(
        Object.entries(enemyStrips).map(([id, strip]) => [id, strip.frames[0] ?? Texture.EMPTY]),
      ),
    },
    enemyStrips,
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
