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
  /**
   * #53's colourblind-safe marker pair (`docs/GAME_DESIGN.md` §12) —
   * `placeholder-art.ts`'s `createDotMarkerTexture`/`createDiamondMarkerTexture`,
   * generated once at boot. Optional: a `ProjectileArt` built without a
   * renderer (a test's own hand-built one, say) simply never draws a marker,
   * the same graceful omission `GameViewTextures`'s other optional fields get.
   */
  readonly teamMarkers?: { readonly player: Texture; readonly enemy: Texture };
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

/** Whether the colourblind-safe marker (#53, `docs/GAME_DESIGN.md` §12) draws over every shot. */
export interface ProjectileAccessibility {
  readonly colorblindPalette: boolean;
}

const DEFAULT_PROJECTILE_ACCESSIBILITY: ProjectileAccessibility = { colorblindPalette: false };

/**
 * One pooled marker sprite per live shot, texture-swapped between
 * `art.teamMarkers.player`/`.enemy` by `store.team` — the same "swap the
 * texture, not the object" pattern the shot sprite itself already uses.
 * Both textures are pure white: brightness is the primary cue, the
 * dot-vs-diamond shape the secondary one, so "which shot can hurt me" never
 * depends on reading a hue. Drawn as textured `Sprite`s rather than
 * `Graphics` — `placeholder-art.ts`'s own doc comment is why: a few
 * thousand `Graphics` (this project's own stress scene runs 5,000
 * projectiles) break sprite batching and the draw-call budget with it.
 *
 * A separate sibling in `container` rather than a child of the shot sprite:
 * a child inherits the parent's scale, which is set from the *shot
 * texture's* native size (`sync`'s own `scale` above) — a marker's size
 * needs to track the shot's rendered radius instead, which is simpler to
 * compute directly than to back out of an inherited transform.
 */
const MARKER_SCALE = 0.6;

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
  /**
   * One pooled marker sprite per slot, alongside its shot — `null` entries
   * hold the slot until #53's toggle first turns colourblind mode on, the
   * same lazy-creation `spriteAt` already uses for the shot sprites
   * themselves. Never created at all when `art.teamMarkers` is absent.
   */
  private readonly markers: (Sprite | null)[] = [];
  private accessibility: ProjectileAccessibility = DEFAULT_PROJECTILE_ACCESSIBILITY;

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

  /** #53's settings-screen toggle. Held here rather than read from a global, same as `ParticleView.setAccessibility`. */
  setAccessibility(accessibility: ProjectileAccessibility): void {
    this.accessibility = accessibility;
  }

  sync(alpha: number, floor: number): void {
    const store = this.store;
    const teamMarkers = this.art.teamMarkers;
    const markersOn = this.accessibility.colorblindPalette && teamMarkers !== undefined;
    let used = 0;

    store.forEachLive((index) => {
      const slot = used;
      const sprite = this.spriteAt(slot);
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
      // The deliberate exception to the actor grid (`docs/DECISIONS.md` #45):
      // a shot is scaled to its own collider, not drawn at its authored size.
      // `shotRadius` is tunable at runtime (`sim/tuning.ts`) and items change
      // it, so here the sprite's size *is* live information — a bigger shot
      // has to look bigger, the same way a telegraph ring's growth is the
      // countdown. That is the line the grid rule draws: a body is a thing and
      // is drawn at the grid; anything whose on-screen size is telling the
      // player something is drawn at that size instead.
      //
      // Note the residual: the default `shotRadius` of 3 against 8px shot art
      // is 1.5 internal pixels per authored pixel, which is resampled. The fix
      // is art rather than code — 12x12 shot art is inside `projectile`'s spec
      // and lands the default exactly on the grid — and is left for whoever
      // next opens the projectile set.
      const radius = store.radius[index] ?? 1;
      const scale = (radius * 2) / texture.height;
      sprite.scale.set(scale);
      sprite.position.set(
        lerp(store.previousX[index] ?? 0, store.x[index] ?? 0, alpha),
        lerp(store.previousY[index] ?? 0, store.y[index] ?? 0, alpha),
      );

      if (markersOn) {
        const marker = this.markerAt(slot);
        if (marker !== null) {
          marker.texture =
            store.team[index] === ProjectileTeam.Player ? teamMarkers.player : teamMarkers.enemy;
          marker.visible = true;
          marker.scale.set((radius * 2 * MARKER_SCALE) / marker.texture.height);
          marker.position.copyFrom(sprite.position);
        }
      } else {
        const marker = this.markers[slot];
        if (marker !== undefined && marker !== null) {
          marker.visible = false;
        }
      }
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
      const marker = this.markers[slot];
      if (marker !== undefined && marker !== null) {
        marker.visible = false;
      }
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

  /** Lazily creates the marker for `slot`, the same shape `spriteAt` follows — `null` when the feature has no art to draw. */
  private markerAt(slot: number): Sprite | null {
    const existing = this.markers[slot];
    if (existing !== undefined) {
      return existing;
    }
    const teamMarkers = this.art.teamMarkers;
    if (teamMarkers === undefined) {
      this.markers[slot] = null;
      return null;
    }
    const created = new Sprite(teamMarkers.player);
    created.anchor.set(0.5);
    created.visible = false;
    this.markers[slot] = created;
    this.container.addChild(created);
    return created;
  }
}
