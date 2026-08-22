import { Container, Sprite, type Texture } from 'pixi.js';
import type { DecalStore } from '../sim/particle/decals.js';

/**
 * Draws the splashes on the floor.
 *
 * Nothing here interpolates or animates — a decal is placed once and then left
 * alone, so the loop only has to notice new ones. Sprites are reused by draw
 * order like every other layer.
 */
export class DecalView {
  readonly container = new Container();

  private readonly store: DecalStore;
  private readonly texture: Texture;
  private readonly sprites: Sprite[] = [];

  constructor(store: DecalStore, texture: Texture) {
    this.store = store;
    this.texture = texture;
  }

  sync(): void {
    const store = this.store;
    let used = 0;

    store.forEachLive((index) => {
      const sprite = this.spriteAt(used);
      used += 1;
      sprite.visible = true;
      sprite.rotation = store.rotation[index] ?? 0;
      sprite.scale.set((store.size[index] ?? 8) / (this.texture.width / 2));
      sprite.position.set(store.x[index] ?? 0, store.y[index] ?? 0);
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
    const created = new Sprite(this.texture);
    created.anchor.set(0.5);
    created.alpha = 0.7;
    this.sprites.push(created);
    this.container.addChild(created);
    return created;
  }
}
