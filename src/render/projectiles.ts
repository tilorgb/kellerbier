import { Container, Sprite, type Texture } from 'pixi.js';
import { lerp } from '../sim/math.js';
import type { ProjectileStore } from '../sim/projectile/store.js';

/**
 * Draws everything in flight.
 *
 * Sprites are handed out in draw order rather than bound to pool slots: bullets
 * are visually identical, so which sprite draws which bullet does not matter,
 * and this way the sprite list stays exactly as long as the most projectiles
 * ever on screen at once — not as long as the pool's capacity.
 *
 * Sprites are created on demand and then kept forever. Creating one is the only
 * allocation here, and it stops happening once the busiest moment of a run has
 * been seen.
 */
export class ProjectileView {
  readonly container = new Container();

  private readonly store: ProjectileStore;
  private readonly texture: Texture;
  private readonly sprites: Sprite[] = [];

  constructor(store: ProjectileStore, texture: Texture) {
    this.store = store;
    this.texture = texture;
  }

  /** Sprites created so far — the peak on-screen projectile count, in practice. */
  get spriteCount(): number {
    return this.sprites.length;
  }

  sync(alpha: number): void {
    const store = this.store;
    let used = 0;

    store.forEachLive((index) => {
      const sprite = this.spriteAt(used);
      used += 1;
      sprite.visible = true;
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
    const created = new Sprite(this.texture);
    created.anchor.set(0.5);
    this.sprites.push(created);
    this.container.addChild(created);
    return created;
  }
}
