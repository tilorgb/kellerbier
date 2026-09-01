import { Assets, Rectangle, Texture } from 'pixi.js';
import {
  compileAnimationSet,
  type AnimationSidecar,
  type CompiledAnimationSet,
} from './animation/definition.js';

/**
 * Every authored sprite in the tree, loaded and shaped for the renderer.
 *
 * ## Globs, not import lists
 *
 * Every category is discovered by `import.meta.glob` (#152). Before this,
 * static tiles and characters were a hand-maintained list of `import`
 * statements at the top of this file — nineteen of them by the time floor 2
 * landed, and exactly the "engine change required to add the next one" that
 * `CONTRIBUTING.md`'s content definition-of-done rules out. #150 had already
 * made animation strips a glob for that reason; #152 added forty-odd sprites
 * at once, which settled the argument for the rest. Adding a sprite is now
 * dropping a file in a folder, in the atlas build *and* at runtime.
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
  /** `roomTiles[floor].floorVariants`'s order, by name — `render/room.ts`'s `pickTileVariant` returns an index into this same order. */
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
   * 2–4 variants `render/room.ts` mixes across a room per cell, the same way
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
    blockVariants: [
      'cellar-boulder-1',
      'cellar-boulder-2',
      'cellar-boulder-3',
      'cellar-boulder-4',
    ],
    // No Maibaum in a cellar — a floor-1 `maypole` prop would be a content
    // error, and falls back to the barrel rather than to nothing.
    destructibles: ['cellar-barrel'],
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
    destructibles: ['rural-barrel', 'rural-maibaum-base'],
  },
};

/** One floor's tileset with its names resolved to `Texture`s — what `render/room.ts` draws from. */
export interface RoomTileArt {
  readonly floorVariants: readonly Texture[];
  readonly wall: Texture;
  readonly wallLip: Texture;
  readonly wallLipCorner: Texture;
  /** The obstacle variants, in `FloorTileset.blockVariants` order — `render/room.ts` picks one per cell. */
  readonly blockVariants: readonly Texture[];
  /** By `DESTRUCTIBLE_PROP_KINDS` index; a kind past the end draws entry 0. */
  readonly destructibles: readonly Texture[];
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
};

/** The tile stacked directly above a `maibaum` prop — a maypole is two tiles tall or it is a stick. */
export const MAIBAUM_TOP_TILE = 'rural-maibaum-top';

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
 * Every animation strip a *creature* is authored as, and every `*.anim.json`
 * beside one, resolved at build time by Vite.
 *
 * `floor-*` rather than every bucket, and `characters`/`bosses` rather than
 * every category: `common/characters/` holds Alois's own strips (#151), which
 * are keyed by facing rather than by enemy id and loaded by
 * `render/player-art.ts`. The rule that draws the line is not a naming
 * convention — it is that a floor bucket *is* a roster, and this map is
 * indexed by `EnemyDefinition.id`. A boss is in that roster like anything
 * else (`content/enemies/grosse-kellerassel.ts`), which is why `bosses/`
 * joins it here.
 */
const STRIP_URLS: Record<string, string> = {
  ...import.meta.glob<string>('../../assets/sprites/floor-*/characters/*.strip.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
  ...import.meta.glob<string>('../../assets/sprites/floor-*/bosses/*.strip.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
};

const STRIP_SIDECARS: Record<string, AnimationSidecar> = {
  ...import.meta.glob<AnimationSidecar>('../../assets/sprites/floor-*/characters/*.anim.json', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob<AnimationSidecar>('../../assets/sprites/floor-*/bosses/*.anim.json', {
    eager: true,
    import: 'default',
  }),
};

/** Every static sprite in the tree, by category. A strip matches `*.png` too, so `SPRITE_PATH_PATTERN` filters them back out. */
const STATIC_TILE_URLS: Record<string, string> = import.meta.glob<string>(
  '../../assets/sprites/*/tiles/*.png',
  { eager: true, query: '?url', import: 'default' },
);

const STATIC_CHARACTER_URLS: Record<string, string> = import.meta.glob<string>(
  '../../assets/sprites/*/characters/*.png',
  { eager: true, query: '?url', import: 'default' },
);

const STATIC_PROJECTILE_URLS: Record<string, string> = import.meta.glob<string>(
  '../../assets/sprites/*/projectiles/*.png',
  { eager: true, query: '?url', import: 'default' },
);

const STATIC_BOSS_URLS: Record<string, string> = import.meta.glob<string>(
  '../../assets/sprites/*/bosses/*.png',
  { eager: true, query: '?url', import: 'default' },
);

const STATIC_VFX_URLS: Record<string, string> = import.meta.glob<string>(
  '../../assets/sprites/*/vfx/*.png',
  { eager: true, query: '?url', import: 'default' },
);

const STRIP_PATH_PATTERN =
  /\/assets\/sprites\/([^/]+)\/(?:characters|bosses)\/([^/]+)\.strip\.png$/;

/** `(bucketId, name)` out of a sprite path, or `null` for an animation strip (which `STRIP_URLS` owns). */
function parseSpritePath(path: string, folder: string): { bucketId: string; name: string } | null {
  const pattern = new RegExp(`/assets/sprites/([^/]+)/${folder}/([^/]+)\\.png$`);
  const match = pattern.exec(path);
  const bucketId = match?.[1];
  const name = match?.[2];
  if (bucketId === undefined || name === undefined || name.endsWith('.strip')) {
    return null;
  }
  return { bucketId, name };
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

async function loadNearest(src: string): Promise<Texture> {
  return Assets.load<Texture>({ src, data: { scaleMode: 'nearest' } });
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
    const base = await loadNearest(url);
    strips[name] = cutStrip(name, base, sidecar);
  }
  return strips;
}

/** Loads one glob's worth of static sprites into `(name, texture)` plus their origins. */
async function loadStatics(
  urls: Readonly<Record<string, string>>,
  folder: string,
  category: SpriteOrigin['category'],
  into: Record<string, Texture>,
  origins: Record<string, SpriteOrigin>,
): Promise<void> {
  await Promise.all(
    Object.entries(urls).map(async ([path, url]) => {
      const parsed = parseSpritePath(path, folder);
      if (parsed === null) {
        return;
      }
      into[parsed.name] = await loadNearest(url);
      origins[parsed.name] = { bucketId: parsed.bucketId, category };
    }),
  );
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
  const spriteOrigins: Record<string, SpriteOrigin> = {};

  const [enemyStrips] = await Promise.all([
    loadStrips(),
    loadStatics(STATIC_TILE_URLS, 'tiles', 'tile', tileTextures, spriteOrigins),
    loadStatics(STATIC_CHARACTER_URLS, 'characters', 'character', characterTextures, spriteOrigins),
    loadStatics(
      STATIC_PROJECTILE_URLS,
      'projectiles',
      'projectile',
      projectileTextures,
      spriteOrigins,
    ),
    loadStatics(STATIC_BOSS_URLS, 'bosses', 'boss', bossTextures, spriteOrigins),
    loadStatics(STATIC_VFX_URLS, 'vfx', 'vfx', vfxTextures, spriteOrigins),
  ]);

  // A strip's own name is a sprite origin too — click-to-pick has to resolve
  // an animated creature to the file it was drawn in, same as a static one.
  for (const path of Object.keys(STRIP_URLS)) {
    const match = STRIP_PATH_PATTERN.exec(path);
    const bucketId = match?.[1];
    const name = match?.[2];
    if (bucketId === undefined || name === undefined) {
      continue;
    }
    spriteOrigins[name] = {
      bucketId,
      category: path.includes('/bosses/') ? 'boss' : 'character',
    };
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
  };
}
