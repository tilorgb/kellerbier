import { Container, Sprite, type Texture } from 'pixi.js';
import { lerp } from '../sim/math.js';
import { ParticleKind, type ParticleStore } from '../sim/particle/store.js';

/**
 * Draws every particle in flight.
 *
 * A particle fades and shrinks over its life rather than vanishing at the end
 * of it: a burst that pops out of existence reads as a glitch, and the fade
 * costs one multiply.
 */

/**
 * One texture per `ParticleKind`, indexed by the kind's own value.
 *
 * An array rather than a map because this is read once per particle per frame
 * with a thousand of them on screen — and because "a kind with no texture" is
 * then simply a hole the fallback fills, rather than a lookup that has to be
 * spelled out.
 */
export interface ParticleTextures {
  readonly byKind: readonly (Texture | undefined)[];
  /** What a kind with no texture of its own draws. */
  readonly fallback: Texture;
}

/**
 * Which effects an accessibility toggle removes, and which it must not.
 *
 * The line is whether the effect is the *only* copy of something. Foam and
 * splash say "that connected" and "that died"; sparks are the second half of
 * the first of those and stay with it. Everything else here — the room-clear
 * ring, the door puffs, the pickup glints, the muzzle flash — is decoration on
 * top of something already visible, which is exactly what makes it removable.
 *
 * Suppressed here rather than at the spawn site on purpose: a reduced-motion
 * run steps identically to a full one, so a replay recorded with the toggle on
 * plays back correctly with it off (`docs/DECISIONS.md` #41).
 */
const DECORATIVE_KINDS = kindFlags([ParticleKind.Dust, ParticleKind.Glint, ParticleKind.Ember]);

/** The one kind `reduceFlashes` removes — it fires on every shot, which is the hazard. */
const FLASHING_KINDS = kindFlags([ParticleKind.Flash]);

/**
 * A boolean per kind, indexed by the kind's own value.
 *
 * An array rather than a `Set`, because `draws` is called once per live
 * particle per frame and the budget covers a thousand of them: an indexed read
 * costs nothing where a hash lookup costs a little, a thousand times over.
 */
function kindFlags(kinds: readonly number[]): readonly boolean[] {
  const flags: boolean[] = [];
  for (const kind of kinds) {
    flags[kind] = true;
  }
  return flags;
}

export interface ParticleAccessibility {
  readonly reducedMotion: boolean;
  readonly reduceFlashes: boolean;
}

const FULL_EFFECTS: ParticleAccessibility = { reducedMotion: false, reduceFlashes: false };

export class ParticleView {
  readonly container = new Container();

  private readonly store: ParticleStore;
  private readonly textures: ParticleTextures;
  private readonly sprites: Sprite[] = [];
  private accessibility: ParticleAccessibility = FULL_EFFECTS;

  constructor(store: ParticleStore, textures: ParticleTextures) {
    this.store = store;
    this.textures = textures;
  }

  /** Which effects to draw. Read per frame rather than at construction: a toggle takes effect mid-run. */
  setAccessibility(accessibility: ParticleAccessibility): void {
    this.accessibility = accessibility;
  }

  /** Whether a particle of `kind` is drawn under the current settings. */
  draws(kind: number): boolean {
    const settings = this.accessibility;
    if (settings.reducedMotion && DECORATIVE_KINDS[kind] === true) {
      return false;
    }
    return !(settings.reduceFlashes && FLASHING_KINDS[kind] === true);
  }

  sync(alpha: number): void {
    const store = this.store;
    let used = 0;

    store.forEachLive((index) => {
      const kind = store.kind[index] ?? 0;
      if (!this.draws(kind)) {
        return;
      }
      const sprite = this.spriteAt(used);
      used += 1;

      const life = store.life[index] ?? 0;
      const maxLife = store.maxLife[index] ?? 1;
      const remaining = maxLife === 0 ? 0 : life / maxLife;

      sprite.visible = true;
      sprite.texture = this.textures.byKind[kind] ?? this.textures.fallback;
      sprite.alpha = Math.min(1, remaining * 1.6);
      // Scaled against the sprite's own half-height rather than the fixed `/ 2`
      // this used before #153. The `2` was the generated foam blob's radius,
      // and it was only ever right because every particle in the game was that
      // one texture; the authored set runs from a 3px ember to an 8px muzzle
      // flash. Reading each sprite's own size keeps `ParticleStore.size`
      // meaning the same thing it always did — the radius the simulation asked
      // for — whatever is drawn at it.
      const size = store.size[index] ?? 1;
      sprite.scale.set((size * (0.4 + remaining * 0.6)) / Math.max(1, sprite.texture.height / 2));
      sprite.position.set(
        lerp(store.previousX[index] ?? 0, store.x[index] ?? 0, alpha),
        lerp(store.previousY[index] ?? 0, store.y[index] ?? 0, alpha),
      );
    });

    for (let slot = used; slot < this.sprites.length; slot++) {
      const sprite = this.sprites[slot];
      if (sprite !== undefined) {
        sprite.visible = false;
      }
    }
  }

  private spriteAt(slot: number): Sprite {
    const existing = this.sprites[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(this.textures.fallback);
    created.anchor.set(0.5);
    this.sprites.push(created);
    this.container.addChild(created);
    return created;
  }
}
