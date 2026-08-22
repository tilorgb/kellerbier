import { Container, Sprite, type Texture } from 'pixi.js';
import { lerp } from '../sim/math.js';
import { ParticleKind, type ParticleStore } from '../sim/particle/store.js';

/**
 * Draws foam and splash.
 *
 * A particle fades and shrinks over its life rather than vanishing at the end
 * of it: a burst that pops out of existence reads as a glitch, and the fade
 * costs one multiply.
 */
export interface ParticleTextures {
  readonly foam: Texture;
  readonly splash: Texture;
}

export class ParticleView {
  readonly container = new Container();

  private readonly store: ParticleStore;
  private readonly textures: ParticleTextures;
  private readonly sprites: Sprite[] = [];

  constructor(store: ParticleStore, textures: ParticleTextures) {
    this.store = store;
    this.textures = textures;
  }

  sync(alpha: number): void {
    const store = this.store;
    let used = 0;

    store.forEachLive((index) => {
      const sprite = this.spriteAt(used);
      used += 1;

      const life = store.life[index] ?? 0;
      const maxLife = store.maxLife[index] ?? 1;
      const remaining = maxLife === 0 ? 0 : life / maxLife;

      sprite.visible = true;
      sprite.texture =
        store.kind[index] === ParticleKind.Splash ? this.textures.splash : this.textures.foam;
      sprite.alpha = Math.min(1, remaining * 1.6);
      sprite.scale.set(((store.size[index] ?? 1) * (0.4 + remaining * 0.6)) / 2);
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
    const created = new Sprite(this.textures.foam);
    created.anchor.set(0.5);
    this.sprites.push(created);
    this.container.addChild(created);
    return created;
  }
}
