import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { PICKUP_DEFINITIONS } from '../../src/content/pickups/index.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';
import { GENERATED_SCENERY_TYPES } from '../../src/sim/room/generate-room.js';
import { isMultiCellRoomTemplate } from '../../src/content/rooms/definition.js';
import { FLOOR_TILESETS, PROP_TILE_NAMES, MAIBAUM_TOP_TILE } from '../../src/render/floor-art.js';
import { PLAYER_TAG_SPRITE_ORDER } from '../../src/render/projectiles.js';
import { DESTRUCTIBLE_PROP_KINDS } from '../../src/sim/game/sim.js';
import { ALL_BUCKET_IDS, CATEGORY_FOLDERS } from '../../tools/art/spec.mjs';
import { buildParticleArt, TELEGRAPH_RING_SPRITE } from '../../src/render/art-bundle.js';
import { PARTICLE_KIND_IDS } from '../../src/sim/particle/store.js';
import { Texture } from 'pixi.js';

/** Stands in for a loaded texture — this test is about *which names exist*, not about pixels. */
const PLACEHOLDER = Texture.EMPTY;

/**
 * "No generated placeholder draws anything a player sees" (#152) is not a
 * property of a file — it is a property of the *relationship* between the
 * content and the sprite tree, and the only way it stays true as content grows
 * is a test that walks both.
 *
 * These read the real `assets/sprites/` tree rather than a fixture, on purpose.
 * The failure this exists to catch is "a floor-2 enemy was added and nobody
 * drew it" — which is exactly what floor 2's own Böllerschmeißer (#156) had
 * done by the time this landed, and what nothing in the suite noticed. A
 * fixture cannot notice it; only the real tree can.
 */

const SPRITE_ROOT = path.resolve(import.meta.dirname, '../../assets/sprites');
const STRIP_SUFFIX = '.strip.png';

/** Every sprite name in the tree, by category, across every bucket. */
async function spriteNames(category: keyof typeof CATEGORY_FOLDERS): Promise<Set<string>> {
  const names = new Set<string>();
  for (const bucketId of ALL_BUCKET_IDS) {
    const dir = path.join(SPRITE_ROOT, bucketId, CATEGORY_FOLDERS[category]);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith(STRIP_SUFFIX)) {
        names.add(entry.slice(0, -STRIP_SUFFIX.length));
      } else if (entry.endsWith('.png')) {
        names.add(entry.slice(0, -'.png'.length));
      }
    }
  }
  return names;
}

const characterNames = await spriteNames('character');
const bossNames = await spriteNames('boss');
const tileNames = await spriteNames('tile');
const projectileNames = await spriteNames('projectile');
const vfxNames = await spriteNames('vfx');

/** A creature draws from `characters/` or `bosses/` — `EntityView` looks in one map that merges both. */
const creatureNames = new Set([...characterNames, ...bossNames]);

const templates = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);

describe('every registered enemy has art', () => {
  it.each(ENEMY_DEFINITIONS.map((definition) => definition.id))('%s', (id) => {
    expect(creatureNames).toContain(id);
  });
});

describe('every registered pickup has art', () => {
  it.each(PICKUP_DEFINITIONS.map((definition) => definition.id))('%s', (id) => {
    expect(characterNames).toContain(`pickup-${id}`);
  });
});

describe('every floor tileset names sprites that exist', () => {
  for (const [floor, tileset] of Object.entries(FLOOR_TILESETS)) {
    const named = [
      ...tileset.floorVariants,
      tileset.wall,
      tileset.wallLip,
      tileset.wallLipCorner,
      ...tileset.blockVariants,
      ...tileset.destructibles,
    ];
    it.each(named)(`floor ${floor}: %s`, (name) => {
      expect(tileNames).toContain(name);
    });

    it(`floor ${floor} names a destructible for every kind the sim can spawn, or falls back to the first`, () => {
      // A floor may legitimately name fewer than there are kinds — Der Keller
      // has no Maibaum — but it must never name *more*, which would be a
      // tileset naming a prop kind the simulation cannot produce.
      expect(tileset.destructibles.length).toBeGreaterThan(0);
      expect(tileset.destructibles.length).toBeLessThanOrEqual(DESTRUCTIBLE_PROP_KINDS.length);
    });
  }
});

describe('every prop / hazard type a room can carry is drawable', () => {
  const authoredTypes = new Set<string>(GENERATED_SCENERY_TYPES);
  for (const template of templates) {
    const layouts = isMultiCellRoomTemplate(template) ? template.cells : [template];
    for (const layout of layouts) {
      for (const prop of layout.decorativeProps) {
        authoredTypes.add(prop.type);
      }
    }
  }

  it('finds at least the prop types this test was written against', () => {
    // A guard on the guard: if `decorativeProps` (authored) and
    // `GENERATED_SCENERY_TYPES` (procedural) ever stop being reachable, every
    // assertion below would vacuously pass and the coverage would disappear.
    expect(authoredTypes.size).toBeGreaterThanOrEqual(8);
  });

  it.each([...authoredTypes].sort())('%s', (type) => {
    // Either it maps to a tile that exists, or it is explicitly `null` —
    // "something else draws this". An unmapped type is the content gap
    // `render/prop-view.ts` warns about, and a warning is not a substitute for
    // catching it on a pull request (`CLAUDE.md`'s own line on this).
    expect(Object.keys(PROP_TILE_NAMES)).toContain(type);
    const tile = PROP_TILE_NAMES[type];
    if (tile !== null && tile !== undefined) {
      expect(tileNames).toContain(tile);
    }
  });

  it('draws the Maibaum two tiles tall', () => {
    expect(tileNames).toContain(MAIBAUM_TOP_TILE);
  });
});

describe('every projectile sprite a shot names exists', () => {
  const authored = new Set<string>();
  for (const definition of ENEMY_DEFINITIONS) {
    for (const state of definition.states) {
      for (const behaviour of state.behaviours) {
        const art = 'art' in behaviour ? behaviour.art : undefined;
        if (typeof art === 'string') {
          authored.add(art);
        }
      }
    }
  }

  it('finds the shots that were authored with their own art', () => {
    expect(authored.size).toBeGreaterThan(0);
  });

  it.each([...authored].sort())('enemy shot art %s', (name) => {
    expect(projectileNames).toContain(name);
  });

  it.each(PLAYER_TAG_SPRITE_ORDER.map((entry) => entry.sprite))('player tag art %s', (name) => {
    expect(projectileNames).toContain(name);
  });

  it('has the player base shot', () => {
    expect(projectileNames).toContain('beer');
  });
});

describe('no sprite folder for a shipped floor is empty', () => {
  // #152's own acceptance criterion, stated as the test that keeps it true.
  const shipped = ['common', 'floor-1-cellar', 'floor-2-rural'];
  // The four *world-art* categories. `vfx` (#153) is deliberately excluded:
  // effect art is shared across floors by design and lives entirely in
  // `common/`, so requiring a per-floor `vfx/` folder would be asking for
  // floor-specific copies of a dust puff that nothing wants.
  const worldArt = [
    CATEGORY_FOLDERS.tile,
    CATEGORY_FOLDERS.character,
    CATEGORY_FOLDERS.boss,
    CATEGORY_FOLDERS.projectile,
  ];
  it.each(shipped.flatMap((bucketId) => worldArt.map((folder) => [bucketId, folder] as const)))(
    '%s/%s',
    async (bucketId, folder) => {
      const entries = await readdir(path.join(SPRITE_ROOT, bucketId, folder));
      expect(entries.filter((entry) => entry.endsWith('.png'))).not.toHaveLength(0);
    },
  );

  it('has the shared effect set', () => {
    expect(vfxNames.size).toBeGreaterThan(0);
  });
});

describe('every particle kind has effect art in the real tree', () => {
  // The other half of `tests/unit/particle-art.test.ts`, which checks the
  // *mapping* against a fixture: this checks the mapping against what is
  // actually on disk, so adding a `ParticleKind` without drawing it fails on
  // a pull request rather than showing up as a silently generic burst.
  it.each(PARTICLE_KIND_IDS)('kind %s', (kind) => {
    const art = buildParticleArt(
      Object.fromEntries([...vfxNames].map((name) => [name, PLACEHOLDER])),
      PLACEHOLDER,
    );
    expect(art.byKind[kind]).toBeDefined();
  });

  it('authors the telegraph ring the entity view asks for', () => {
    expect(vfxNames).toContain(TELEGRAPH_RING_SPRITE);
  });
});

describe('the animation sidecars a boss ships author the states its fight uses', () => {
  it.each([
    ['floor-1-cellar', 'grosse-kellerassel'],
    ['floor-2-rural', 'der-stier'],
  ])('%s/%s', async (bucketId, name) => {
    const raw = await readFile(
      path.join(SPRITE_ROOT, bucketId, 'bosses', `${name}.anim.json`),
      'utf8',
    );
    const sidecar = JSON.parse(raw) as { clips?: Record<string, unknown> };
    // A boss is the one creature that uses the whole state list: it walks, it
    // winds up, it flinches, and it dies on screen rather than under a
    // game-over screen.
    expect(Object.keys(sidecar.clips ?? {}).sort()).toEqual([
      'death',
      'hurt',
      'idle',
      'move',
      'telegraph',
    ]);
  });
});
