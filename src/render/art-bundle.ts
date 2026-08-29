import type { Texture } from 'pixi.js';
import type { DoorTextures } from './room.js';
import type { SpriteOrigin } from './floor-art.js';
import { PLAYER_TAG_SPRITE_ORDER, type ProjectileArt } from './projectiles.js';
import type { ParticleTextures } from './particles.js';
import { PARTICLE_KIND_IDS, ParticleKind } from '../sim/particle/store.js';

/**
 * Assembles the two pieces of `GameViewTextures` that need a rule rather than
 * a lookup, shared by the game's two entry points (`app/main.ts`,
 * `editor/playtest.ts`).
 *
 * Both were already near-identical blocks of texture construction — `main.ts`'s
 * own comment says so — and #152 gave each of them another dozen lines of it.
 * Whatever the two entry points end up disagreeing about, it should not be
 * which sprite a burning shot draws.
 */

/** The sprite names each floor's default enemy shot is authored under. */
const FLOOR_ENEMY_SHOT: Readonly<Record<number, string>> = {
  1: 'tap-drip',
  2: 'boeller',
};

/** Alois's own untagged shot. */
const PLAYER_SHOT = 'beer';

/**
 * `fallback` is the generated disc every projectile used to draw as.
 *
 * It survives for floors 3-7, whose projectile art is M10's job (#39-#43,
 * parked) — and only there: `app/main.ts`'s `HIGHEST_PLAYABLE_FLOOR` is 2, so
 * no player can currently reach a floor that would draw it. That is what keeps
 * #152's "`placeholder-art.ts` draws nothing a player sees" true rather than
 * nearly true, and it is why the fallback is a parameter here instead of
 * something this module quietly reaches for.
 */
export function buildProjectileArt(
  projectileTextures: Readonly<Record<string, Texture>>,
  fallback: Texture,
): ProjectileArt {
  const player = projectileTextures[PLAYER_SHOT] ?? fallback;
  const playerTags: { tag: ProjectileArt['playerTags'][number]['tag']; texture: Texture }[] = [];
  for (const entry of PLAYER_TAG_SPRITE_ORDER) {
    const texture = projectileTextures[entry.sprite];
    if (texture !== undefined) {
      playerTags.push({ tag: entry.tag, texture });
    }
  }
  const enemyByFloor: Record<number, Texture> = {};
  for (const [floor, sprite] of Object.entries(FLOOR_ENEMY_SHOT)) {
    const texture = projectileTextures[sprite];
    if (texture !== undefined) {
      enemyByFloor[Number(floor)] = texture;
    }
  }
  return { player, playerTags, enemyByName: projectileTextures, enemyByFloor, fallback };
}

/**
 * The two door sprites, or `undefined` if either is missing — a half-authored
 * door set falls back to the flat coloured band whole, rather than drawing a
 * sprite for one state and a rectangle for the other.
 */
export function doorTexturesFrom(
  tileTextures: Readonly<Record<string, Texture>>,
): DoorTextures | undefined {
  const open = tileTextures['door-open'];
  const closed = tileTextures['door-closed'];
  return open === undefined || closed === undefined ? undefined : { open, closed };
}

/**
 * Which sprite names came out of a `bosses/` folder.
 *
 * Read off the loader's own origins rather than hand-listed: a third boss
 * should get its shadow by being dropped in the right folder, the same way it
 * gets its animation.
 */
export function bossIdsFrom(
  spriteOrigins: Readonly<Record<string, SpriteOrigin>>,
): ReadonlySet<string> {
  return new Set(
    Object.entries(spriteOrigins)
      .filter(([, origin]) => origin.category === 'boss')
      .map(([name]) => name),
  );
}

/**
 * The sprite each `ParticleKind` is drawn as (#153), by the name it is
 * authored under in `common/vfx/`.
 *
 * A table rather than a naming convention for the same reason `FLOOR_TILESETS`
 * is one: which sprite is "the death splash" is a decision, and inferring it
 * from the kind's own name would make a rename a silent behaviour change.
 */
const PARTICLE_SPRITE_NAMES: Readonly<Record<number, string>> = {
  [ParticleKind.Foam]: 'foam',
  [ParticleKind.Splash]: 'splash',
  [ParticleKind.Spark]: 'spark',
  [ParticleKind.Dust]: 'dust',
  [ParticleKind.Spore]: 'spore',
  [ParticleKind.Shard]: 'shard',
  [ParticleKind.Ember]: 'ember',
  [ParticleKind.Glint]: 'glint',
  [ParticleKind.Flash]: 'flash',
};

/** The name the art-directed telegraph ring is authored under (#153). */
export const TELEGRAPH_RING_SPRITE = 'ring';

/**
 * Effect textures indexed by `ParticleKind`, with `fallback` standing in for
 * any kind whose sprite has not been drawn.
 *
 * The fallback is a real parameter rather than something this reaches for, so
 * the room editor's playtest view and the bench scene — neither of which loads
 * the sprite tree — still draw particles rather than nothing.
 */
export function buildParticleArt(
  vfxTextures: Readonly<Record<string, Texture>>,
  fallback: Texture,
): ParticleTextures {
  const byKind: (Texture | undefined)[] = [];
  for (const kind of PARTICLE_KIND_IDS) {
    const name = PARTICLE_SPRITE_NAMES[kind];
    byKind[kind] = name === undefined ? undefined : vfxTextures[name];
  }
  return { byKind, fallback };
}
