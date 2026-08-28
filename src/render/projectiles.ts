import { Container, Sprite, type Texture } from 'pixi.js';
import { lerp } from '../sim/math.js';
import { ProjectileTeam, type ProjectileStore } from '../sim/projectile/store.js';
import { ProjectileTag, type ProjectileTagId } from '../sim/projectile/tags.js';

/**
 * The sprite set every shot in flight is drawn from (#152).
 *
 * Before this, one generated disc drew every projectile in the game: the
 * player's, every enemy's, and every tagged variant of both. `spriteFor`
 * below is the whole of what replaced it.
 */
export interface ProjectileArt {
  /** Alois's shot with no tag that changes how it must be dodged. */
  readonly player: Texture;
  /**
   * Per-tag player shots, in the order they win.
   *
   * A shot can carry several tags at once — that composition is the entire
   * mechanism synergies come from (#27) — so "which sprite" needs a fixed
   * priority, not a lookup. The order is what the *player* has to react to,
   * which is not the same as `tags.ts`'s two composition orders: those decide
   * what a shot does, this decides what it must not be mistaken for. A
   * burning shot that also homes is still, to the person dodging it, on fire.
   */
  readonly playerTags: readonly { readonly tag: ProjectileTagId; readonly texture: Texture }[];
  /** Enemy shots by the interned art name their firing behaviour named (`EnemyRegistry.projectileArtNames`). */
  readonly enemyByName: Readonly<Record<string, Texture>>;
  /** The enemy shot for a floor whose shooter named no art of its own, by floor number. */
  readonly enemyByFloor: Readonly<Record<number, Texture>>;
  /** What draws when nothing above resolves — a floor with no authored projectile art (#39-#43, parked). */
  readonly fallback: Texture;
}

/**
 * How a shot's sprite is chosen, in one place so the rule is readable.
 *
 * Player shots read off their tag mask; enemy shots read off the art index
 * their firing behaviour authored (`FiringBehaviourBase.art`), falling back to
 * their floor's own shot. The floor is passed in rather than read from the
 * store because a projectile does not remember which room it was fired in and
 * has no reason to: every shot on screen was fired on the floor currently
 * loaded.
 */
export function spriteFor(
  art: ProjectileArt,
  team: number,
  tags: number,
  artName: string | null,
  floor: number,
): Texture {
  if (team === ProjectileTeam.Player) {
    for (const entry of art.playerTags) {
      if ((tags & entry.tag) !== 0) {
        return entry.texture;
      }
    }
    return art.player;
  }
  if (artName !== null) {
    const named = art.enemyByName[artName];
    if (named !== undefined) {
      return named;
    }
  }
  return art.enemyByFloor[floor] ?? art.fallback;
}

/**
 * The tag priority `ProjectileArt.playerTags` is built in.
 *
 * Status effects first — they are what a hit *costs* beyond its damage, so
 * they are what the player most needs to see coming — then `piercing`, which
 * changes whether cover works, then `spectral`, which changes whether walls
 * do. Everything else (`homing`, `bouncing`, `splitting`, `sticky`, `arcing`,
 * `returning`, `orbiting`) changes where a shot goes, and a shot's *path* is
 * legible from watching it fly; its status payload is not.
 */
export const PLAYER_TAG_SPRITE_ORDER: readonly { tag: ProjectileTagId; sprite: string }[] = [
  { tag: ProjectileTag.Burning, sprite: 'beer-burning' },
  { tag: ProjectileTag.Freezing, sprite: 'beer-freezing' },
  { tag: ProjectileTag.Poison, sprite: 'beer-poison' },
  { tag: ProjectileTag.Piercing, sprite: 'beer-piercing' },
  { tag: ProjectileTag.Spectral, sprite: 'beer-spectral' },
];

/**
 * Draws everything in flight.
 *
 * Sprites are handed out in draw order rather than bound to pool slots: which
 * sprite draws which bullet does not matter, and this way the sprite list stays
 * exactly as long as the most projectiles ever on screen at once — not as long
 * as the pool's capacity.
 *
 * Sprites are created on demand and then kept forever. Creating one is the only
 * allocation here, and it stops happening once the busiest moment of a run has
 * been seen.
 */
export class ProjectileView {
  readonly container = new Container();

  private readonly store: ProjectileStore;
  private readonly art: ProjectileArt;
  /** `art` index to sprite name, from the roster's interned table. Read per shot, so it is a plain array lookup. */
  private readonly artNames: readonly (string | null)[];
  private readonly sprites: Sprite[] = [];

  constructor(
    store: ProjectileStore,
    art: ProjectileArt,
    artNames: readonly (string | null)[] = [],
  ) {
    this.store = store;
    this.art = art;
    this.artNames = artNames;
  }

  /** Sprites created so far — the peak on-screen projectile count, in practice. */
  get spriteCount(): number {
    return this.sprites.length;
  }

  sync(alpha: number, floor: number): void {
    const store = this.store;
    let used = 0;

    store.forEachLive((index) => {
      const sprite = this.spriteAt(used);
      used += 1;
      sprite.visible = true;
      const texture = spriteFor(
        this.art,
        store.team[index] ?? 0,
        store.tags[index] ?? 0,
        this.artNames[store.art[index] ?? 0] ?? null,
        floor,
      );
      sprite.texture = texture;
      // Scaled to the shot's own collider rather than drawn at the sprite's
      // authored size: `shotRadius` is tunable at runtime (`sim/tuning.ts`)
      // and items change it, so a sprite drawn at a fixed size would stop
      // describing the thing that actually hits you. Height rather than a
      // constant, for the same reason `EntityView` reads `bodyTexture.height`
      // — the set is not all one size.
      const scale = ((store.radius[index] ?? 1) * 2) / texture.height;
      sprite.scale.set(scale);
      sprite.position.set(
        lerp(store.previousX[index] ?? 0, store.x[index] ?? 0, alpha),
        lerp(store.previousY[index] ?? 0, store.y[index] ?? 0, alpha),
      );
    });

    for (let slot = used; slot < this.sprites.length; slot++) {
      const sprite = this.sprites[slot];
      if (sprite === undefined) {
        continue;
      }
      if (!sprite.visible) {
        // Everything past the first hidden sprite was hidden last frame too.
        break;
      }
      sprite.visible = false;
    }
  }

  /** Sprites are requested in order, so a push always lands at the wanted slot. */
  private spriteAt(slot: number): Sprite {
    const existing = this.sprites[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(this.art.player);
    created.anchor.set(0.5);
    this.sprites.push(created);
    this.container.addChild(created);
    return created;
  }
}
