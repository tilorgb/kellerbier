import { Texture, loadTexture } from './gfx/index.js';
import {
  compileAnimationSet,
  type AnimationSidecar,
  type CompiledAnimationSet,
} from './animation/definition.js';

/**
 * Every authored sprite in the tree, loaded and shaped for the renderer.
 *
 * ## Atlas sheets, not 113 individual PNGs (#294)
 *
 * `npm run dev`/`vitest`/`vite build` all run `tools/art/build-atlas.mjs`
 * first (the "art pipeline: built N atlas(es)..." line at the top of every
 * dev-server and test run), packing every authored sprite into one sheet per
 * bucket — `assets/atlases/<bucketId>.png` plus a `.json` manifest of each
 * sprite's `(x, y, width, height)` within it, an authored strip's `animation`
 * sidecar carried along on its one (whole-strip) entry. This module used to
 * load those 113 individual files at runtime and let the atlas sit unused
 * (`docs/DECISIONS.md` #74's original call, superseded here); now it loads
 * only the sheets — a fixed, small request count regardless of how many
 * sprites the game grows to — and cuts every named `Texture` from them with
 * `Texture.sub`, which is the same "a rectangle view over a shared
 * `TextureSource`" vocabulary `cutStrip` already used to cut an individual
 * strip into frames. A bucket with no sprites yet (an unparked floor with an
 * empty `assets/sprites/floor-N/` tree) simply has no manifest to glob, same
 * as it had no sprite files before.
 *
 * ## Globs, not import lists
 *
 * Every atlas file is discovered by `import.meta.glob` (#152, and before
 * that every *sprite* file was): a floor whose bucket first gets sprites
 * needs no change here, because `tools/art/build.mjs` only ever writes an
 * atlas for a bucket it found sprites in — the glob picks it up the moment
 * `npm run dev` next builds one.
 *
 * Names are the keys, and the maps are deliberately flat and complete rather
 * than filtered per consumer: an enemy looks itself up by
 * `EnemyDefinition.id`, a pickup by `pickup-<id>`, a room's tileset by the
 * names in `FLOOR_TILESETS`. A sprite nobody looks up costs one atlas entry
 * and no code.
 */
export interface FloorArt {
  /** Every floor with authored room tiles, keyed by floor number. Floors 3-7 have no entry (#39-#43, parked). */
  readonly roomTiles: Readonly<Record<number, RoomTileArt>>;
  /**
   * Real character art, keyed by sprite name — which for a creature is its
   * `EnemyDefinition.id`. An enemy with no entry here falls back to the
   * shared blob, as it did before its art was drawn.
   */
  readonly enemyArt: Readonly<Record<string, Texture>>;
  /**
   * Animated character *and boss* art (#150, extended by #152), keyed the
   * same way `enemyArt` is — the frames of that creature's strip with its
   * `*.anim.json` clips compiled.
   *
   * A boss is an enemy with a bigger sprite as far as everything downstream
   * of here is concerned, which is why the two bosses' strips land in this
   * one map rather than a parallel `bossStrips`: `EntityView` already
   * animates anything it finds here by id, so the whole of "the boss
   * animates" was one glob pattern.
   *
   * An id appears in here *or* in `enemyArt` with a single static texture,
   * never both: `tools/art/scan.mjs` fails the build on a name authored
   * twice. `enemyArt` still carries the strip's first frame, though, because
   * everything else that looks art up by name — click-to-pick (#108), the
   * minimap — wants "a texture for this creature" and does not care that it
   * happens to be animated.
   */
  readonly enemyStrips: Readonly<Record<string, LoadedStrip>>;
  /** Pickup art (#152), keyed by `PickupDefinition.id` — authored as `common/characters/pickup-<id>.png`. */
  readonly pickupArt: Readonly<Record<string, Texture>>;
  /** Projectile art (#152), keyed by sprite name (`beer`, `beer-burning`, `tap-drip`, ...). */
  readonly projectileArt: Readonly<Record<string, Texture>>;
  /** Effect art (#153), keyed by sprite name (`foam`, `spark`, `glint`, `ring`, ...). */
  readonly vfxArt: Readonly<Record<string, Texture>>;
  /** Every tile in the tree, keyed by sprite name — room tilesets, props, doors, the pedestal, the minimap icons. */
  readonly tileTextures: Readonly<Record<string, Texture>>;
  /**
   * `(bucketId, category)` for every name above — `app/main.ts`'s
   * click-to-pick (#108) needs this to hand the pixel editor a full
   * `(bucketId, category, name)` target, not just the name a click resolved
   * to.
   */
  readonly spriteOrigins: Readonly<Record<string, SpriteOrigin>>;
  /** `roomTiles[floor].floorVariants`'s order, by name — `render/tiles.ts`'s `pickTileVariant` returns an index into this same order. */
  readonly tileVariantNames: Readonly<Record<number, readonly string[]>>;
  /** `roomTiles[floor].blockVariants`'s order, by name — the obstacle equivalent of `tileVariantNames`, for click-to-pick (`app/sprite-pick.ts`). */
  readonly blockVariantNames: Readonly<Record<number, readonly string[]>>;
}

export interface SpriteOrigin {
  readonly bucketId: string;
  readonly category: 'character' | 'tile' | 'projectile' | 'boss' | 'vfx';
}

/**
 * Which named tiles make up one floor's room: the floor variants, the wall
 * band, the course where the wall meets the floor, the obstacle variants, and
 * what its one destructible prop looks like.
 *
 * A manifest rather than a naming convention. "Adding a sprite is dropping a
 * file in a folder" holds for *content* — one more floor variant, one more
 * prop — but which of a floor's tiles is its wall is a decision, not a
 * filename, and inferring it from `*-wall.png` would make a rename a silent
 * behaviour change. Five names per floor is the whole of the config, and a
 * floor with no entry keeps drawing the flat `RoomTheme` fill it always did.
 */
export interface FloorTileset {
  readonly floorVariants: readonly string[];
  readonly wall: string;
  readonly wallLip: string;
  /**
   * The wall-boundary course turning a corner (#196) — authored for the
   * north-west corner (lit toward the corner, contact shadow on the two edges
   * facing the room) and rotated for the other three, so the built wall reads
   * as continuous around the room rather than two runs meeting at an angle.
   */
  readonly wallLipCorner: string;
  /**
   * The obstacle tile — an authored wall block (`RoomObstacle`) — as a set of
   * 2–4 variants `render/world/scenery.ts` mixes across a room per cell, the same way
   * `floorVariants` mixes the ground (#37's "living floor"). A single
   * obstacle sprite tiled identically down a three-cell wall read as a
   * repeated stamp; a boulder that is a different one each cell reads as a
   * pile of rock. Order matters only in that `pickTileVariant`'s hash indexes
   * into it — the same cell always lands on the same variant.
   */
  readonly blockVariants: readonly string[];
  /**
   * What each destructible prop is drawn as on this floor, in
   * `DESTRUCTIBLE_PROP_KINDS` order (`sim/game/sim.ts`).
   *
   * Per floor because `barrel` is authored in `cellar+rural` templates alike
   * and cannot be one sprite on one floor's palette — Der Keller's browns are
   * not legal on Dorf & Acker. Per kind because the simulation deliberately
   * treats a barrel and Der Stier's Maibaum identically, so nothing else
   * distinguishes them for the view.
   *
   * A floor may name fewer than there are kinds; anything past the end falls
   * back to entry 0, which is why `barrel` is entry 0 on both sides.
   */
  readonly destructibles: readonly string[];
  /**
   * How tall the room's walls stand, in room units. A cellar's walls are
   * walls; Dorf & Acker's `rural-wall` is a field's edge — a hedge-high band
   * the player looks over, not a corridor. Part of the tileset because it is
   * an art decision about what the wall tile *is*, made where the tile is
   * named.
   */
  readonly wallHeight: number;
  /**
   * Which light rig the floor is lit by (`render/world/lighting.ts`): a
   * cellar hangs bulbs; a field is under the sky.
   */
  readonly lighting: 'cellar' | 'daylight';
}

export const FLOOR_TILESETS: Readonly<Record<number, FloorTileset>> = {
  // Der Keller (#35). `cellar-wall` and `cellar-plank` were both authored
  // back then and neither was ever loaded — floor 1 has been drawing flat
  // `Graphics` walls over real wall art for two milestones.
  1: {
    floorVariants: ['cellar-floor'],
    wall: 'cellar-wall',
    wallLip: 'cellar-wall-lip',
    wallLipCorner: 'cellar-wall-lip-corner',
    blockVariants: ['cellar-boulder-1', 'cellar-boulder-2', 'cellar-boulder-3', 'cellar-boulder-4'],
    // No Maibaum and no hay in a cellar — a floor-1 `maypole` or `bale` prop
    // would be a content error, and falls back to the barrel rather than to
    // nothing.
    destructibles: ['cellar-barrel'],
    wallHeight: 26,
    lighting: 'cellar',
  },
  // Dorf & Acker (#37): four floor variants, the "living floor".
  2: {
    floorVariants: ['rural-floor-1', 'rural-floor-2', 'rural-floor-3', 'rural-floor-4'],
    wall: 'rural-wall',
    wallLip: 'rural-wall-lip',
    wallLipCorner: 'rural-wall-lip-corner',
    blockVariants: [
      'rural-fieldstone-1',
      'rural-fieldstone-2',
      'rural-fieldstone-3',
      'rural-fieldstone-4',
    ],
    // `bale` (#277) is Der Ladewagen's dropped hay — the same `rural-hay-bale`
    // tile the floor's rooms already decorate with, now also standing in for
    // a real destructible body.
    destructibles: ['rural-barrel', 'rural-maibaum-base', 'rural-hay-bale'],
    wallHeight: 10,
    lighting: 'daylight',
  },
};

/** One floor's tileset with its names resolved to `Texture`s — what `render/world/scenery.ts` builds from. */
export interface RoomTileArt {
  readonly floorVariants: readonly Texture[];
  readonly wall: Texture;
  readonly wallLip: Texture;
  readonly wallLipCorner: Texture;
  /** The obstacle variants, in `FloorTileset.blockVariants` order — `render/world/scenery.ts` picks one per cell. */
  readonly blockVariants: readonly Texture[];
  /** By `DESTRUCTIBLE_PROP_KINDS` index; a kind past the end draws entry 0. */
  readonly destructibles: readonly Texture[];
  readonly wallHeight: number;
  readonly lighting: 'cellar' | 'daylight';
}

/**
 * Which tile sprite each authored `decorativeProps` type is drawn as (#152).
 *
 * `null` means "something else already draws this", and is a deliberate entry
 * rather than an omission: a trellis is drawn from the room's `sightBlocks`
 * and a puddle from its hazards, so a prop view drawing them again would
 * double them up. An omission, by contrast, is a real content gap and warns
 * once in a dev build (`render/prop-view.ts`, `docs/DECISIONS.md` #19).
 *
 * `barrel` and `maypole` are `null` for a second reason: both become real
 * destructible entities in the simulation, so `EntityView` draws them from
 * the floor tileset's own `destructibles`. Listed rather than omitted so the
 * missing-art warning stays a signal about art that has not been drawn.
 */
export const PROP_TILE_NAMES: Readonly<Record<string, string | null>> = {
  // The three crates are `common` art rather than a floor's own, because
  // every generic cellar template is tagged `cellar, rural` alike — a
  // cellar-palette crate would appear in a floor-2 room off that floor's
  // palette. A wooden crate is shared scenery on all seven floors anyway
  // (`docs/CONTENT_BIBLE.md` §0's "on crates, lorries, awnings").
  'crate-opa': 'crate-opa',
  'crate-neu': 'crate-neu',
  'crate-stack': 'crate-stack',
  bulb: 'cellar-bulb',
  'hay-bale': 'rural-hay-bale',
  maibaum: 'rural-maibaum-base',
  'fence-post': 'rural-fence-post',
  bunting: 'rural-bunting',
  trough: 'rural-trough',
  tractor: 'rural-tractor',
  well: 'rural-well',
  'market-stall': 'rural-market-stall',
  bandstand: 'rural-bandstand',
  'shopkeeper-stand': 'shopkeeper-stand',
  'boss-plate': 'boss-plate',
  // Drawn elsewhere, on purpose.
  barrel: null,
  maypole: null,
  pedestal: null,
  puddle: null,
  trellis: null,
  'hop-trellis': null,
  // A shop's Losbrunnen anchor (#238) — drawn by `MachineView`, the same
  // "no tile of its own" shape `pedestal` already has.
  losbrunnen: null,
};

/** The tile stacked directly above a `maibaum` prop — a maypole is two tiles tall or it is a stick. */
export const MAIBAUM_TOP_TILE = 'rural-maibaum-top';

/** One animated sprite as loaded: frames cut from the strip, plus its compiled clips. */
export interface LoadedStrip {
  readonly frames: readonly Texture[];
  readonly clips: CompiledAnimationSet;
}

/**
 * What `EntityView` draws an animated body from — the strip as loaded. The
 * hit flash used to need a white silhouette per frame generated against a
 * renderer; in the 3D scene a flash is the billboard's emissive term, so the
 * frames are all a body needs.
 */
export type AnimatedSpriteSet = LoadedStrip;

/**
 * One atlas sheet's manifest, as `tools/art/build-atlas.mjs` writes it
 * alongside the sheet — every packed sprite's rectangle within the sheet,
 * keyed `"<category>/<name>"`, an animated strip's sidecar folded onto its
 * one (whole-strip) entry as `animation`.
 */
interface AtlasManifest {
  readonly width: number;
  readonly height: number;
  readonly frames: Readonly<Record<string, AtlasFrame>>;
}

interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly animation?: AnimationSidecar;
}

const ATLAS_MANIFESTS: Record<string, AtlasManifest> = import.meta.glob<AtlasManifest>(
  '../../assets/atlases/*.json',
  { eager: true, import: 'default' },
);

const ATLAS_IMAGE_URLS: Record<string, string> = import.meta.glob<string>(
  '../../assets/atlases/*.png',
  { eager: true, query: '?url', import: 'default' },
);

const ATLAS_MANIFEST_PATH_PATTERN = /\/([^/]+)\.json$/;

/** One loaded atlas sheet: its bucket id, manifest, and the whole sheet as a `Texture`. */
export interface AtlasSheet {
  readonly bucketId: string;
  readonly manifest: AtlasManifest;
  readonly sheet: Texture;
}

let atlasSheetsPromise: Promise<readonly AtlasSheet[]> | undefined;

/**
 * Loads every atlas sheet exactly once, however many callers ask for it —
 * `loadFloorArt` below and `player-art.ts`'s `loadPlayerArt` both need
 * `common`'s sheet (Alois's own strips live in it, #151), and each calling
 * `loadTexture` on it separately would mean two HTTP requests for the same
 * PNG rather than the one boot's ≤ 3-sprite-requests budget wants.
 */
export function loadAtlasSheets(): Promise<readonly AtlasSheet[]> {
  atlasSheetsPromise ??= Promise.all(
    Object.entries(ATLAS_MANIFESTS).map(async ([manifestPath, manifest]) => {
      const bucketId = ATLAS_MANIFEST_PATH_PATTERN.exec(manifestPath)?.[1];
      if (bucketId === undefined) {
        throw new Error(`atlas manifest at an unexpected path: ${manifestPath}`);
      }
      const imageUrl = ATLAS_IMAGE_URLS[manifestPath.replace(/\.json$/, '.png')];
      if (imageUrl === undefined) {
        throw new Error(`${bucketId} has an atlas manifest but no atlas image beside it`);
      }
      const sheet = await loadTexture(imageUrl);
      return { bucketId, manifest, sheet };
    }),
  );
  return atlasSheetsPromise;
}

/** Where in `FloorArt` a frame of this category lands. */
function targetsFor(
  category: string,
  targets: {
    readonly tile: Record<string, Texture>;
    readonly character: Record<string, Texture>;
    readonly projectile: Record<string, Texture>;
    readonly boss: Record<string, Texture>;
    readonly vfx: Record<string, Texture>;
  },
): Record<string, Texture> {
  switch (category) {
    case 'tile':
      return targets.tile;
    case 'character':
      return targets.character;
    case 'projectile':
      return targets.projectile;
    case 'boss':
      return targets.boss;
    case 'vfx':
      return targets.vfx;
    default:
      throw new Error(`atlas frame key names unknown category "${category}"`);
  }
}

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
    frames.push(base.sub(frame * frameWidth, 0, frameWidth, base.height));
  }
  return { frames, clips: compileAnimationSet(name, sidecar, frameCount) };
}

const PICKUP_PREFIX = 'pickup-';

/**
 * Loads every authored sprite and returns it shaped for `GameViewTextures`.
 *
 * One shared loader rather than each entry point (`app/main.ts`,
 * `editor/playtest.ts`) repeating the same `Assets.load` calls: both want
 * the same bundle, and a room-editor preview of a floor-1 room benefits
 * from the real art exactly the way a real run does — "which blob was
 * that" is a room-design question as much as a playtesting one. Loading it
 * unconditionally, regardless of which floor is actually being previewed,
 * is harmless: nothing here is looked up by a floor that has no art.
 */
export async function loadFloorArt(): Promise<FloorArt> {
  const tileTextures: Record<string, Texture> = {};
  const characterTextures: Record<string, Texture> = {};
  const projectileTextures: Record<string, Texture> = {};
  const bossTextures: Record<string, Texture> = {};
  const vfxTextures: Record<string, Texture> = {};
  const enemyStrips: Record<string, LoadedStrip> = {};
  const spriteOrigins: Record<string, SpriteOrigin> = {};
  const targets = {
    tile: tileTextures,
    character: characterTextures,
    projectile: projectileTextures,
    boss: bossTextures,
    vfx: vfxTextures,
  };

  const sheets = await loadAtlasSheets();
  for (const { bucketId, manifest, sheet } of sheets) {
    for (const [key, frame] of Object.entries(manifest.frames)) {
      const slash = key.indexOf('/');
      const category = key.slice(0, slash);
      const name = key.slice(slash + 1);
      const texture = sheet.sub(frame.x, frame.y, frame.width, frame.height);
      spriteOrigins[name] = { bucketId, category: category as SpriteOrigin['category'] };
      if (frame.animation !== undefined) {
        enemyStrips[name] = cutStrip(name, texture, frame.animation);
        continue;
      }
      targetsFor(category, targets)[name] = texture;
    }
  }

  const pickupArt: Record<string, Texture> = {};
  for (const [name, texture] of Object.entries(characterTextures)) {
    if (name.startsWith(PICKUP_PREFIX)) {
      pickupArt[name.slice(PICKUP_PREFIX.length)] = texture;
    }
  }

  const roomTiles: Record<number, RoomTileArt> = {};
  const tileVariantNames: Record<number, readonly string[]> = {};
  const blockVariantNames: Record<number, readonly string[]> = {};
  for (const [floor, tileset] of Object.entries(FLOOR_TILESETS)) {
    const resolved = resolveTileset(Number(floor), tileset, tileTextures);
    if (resolved === null) {
      continue;
    }
    roomTiles[Number(floor)] = resolved;
    tileVariantNames[Number(floor)] = tileset.floorVariants;
    blockVariantNames[Number(floor)] = tileset.blockVariants;
  }

  return {
    roomTiles,
    // An animated creature's first frame stands in as "its texture" for
    // everything that looks art up by name and does not care about clips.
    enemyArt: {
      ...characterTextures,
      ...bossTextures,
      ...Object.fromEntries(
        Object.entries(enemyStrips).map(([id, strip]) => [id, strip.frames[0] ?? Texture.EMPTY]),
      ),
    },
    enemyStrips,
    pickupArt,
    projectileArt: projectileTextures,
    vfxArt: vfxTextures,
    tileTextures,
    spriteOrigins,
    tileVariantNames,
    blockVariantNames,
  };
}

/**
 * Resolves one floor's tileset names to textures, throwing on a name that has
 * no file behind it.
 *
 * Thrown rather than degraded, unlike the prop-type gap in
 * `render/prop-view.ts`: a missing floor variant is a manifest naming a
 * sprite that does not exist, which is `docs/DECISIONS.md` #7's "the data is
 * wrong" rather than #19's "nothing authored for this case yet". A floor with
 * *no* manifest entry at all is the gap, and is handled by simply not
 * appearing in `roomTiles`.
 */
function resolveTileset(
  floor: number,
  tileset: FloorTileset,
  tileTextures: Readonly<Record<string, Texture>>,
): RoomTileArt | null {
  const need = (name: string): Texture => {
    const texture = tileTextures[name];
    if (texture === undefined) {
      throw new Error(
        `floor ${String(floor)}'s tileset names "${name}", which is not authored under any bucket's tiles/ folder`,
      );
    }
    return texture;
  };
  return {
    floorVariants: tileset.floorVariants.map(need),
    wall: need(tileset.wall),
    wallLip: need(tileset.wallLip),
    wallLipCorner: need(tileset.wallLipCorner),
    blockVariants: tileset.blockVariants.map(need),
    destructibles: tileset.destructibles.map(need),
    wallHeight: tileset.wallHeight,
    lighting: tileset.lighting,
  };
}
