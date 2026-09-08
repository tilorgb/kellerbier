import { Group } from 'three';
import type { DecalStore } from '../sim/particle/decals.js';
import type { Texture } from './gfx/index.js';
import { FloorSprite } from './world/flat.js';

/**
 * Splashes on the floor. Each decal is a flat quad lying where the store put
 * it, at the store's rotation and size, placed once — decals do not move, so
 * there is nothing to interpolate.
 */
export class DecalView {
  readonly group = new Group();

  private readonly store: DecalStore;
  private readonly texture: Texture;
  private readonly sprites: FloorSprite[] = [];

  constructor(store: DecalStore, texture: Texture) {
    this.store = store;
    this.texture = texture;
    // One sprite up front, hidden, so the decal material is in the scene for
    // `GameView.render`'s first-frame `renderer.compile` rather than linking
    // on the first splat of the run (`docs/DECISIONS.md` #80).
    this.spriteAt(0).visible = false;
  }

  sync(): void {
    const store = this.store;
    let used = 0;
    store.forEachLive((index) => {
      const sprite = this.spriteAt(used);
      used += 1;
      sprite.visible = true;
      const size = (store.size[index] ?? 8) * 2;
      sprite.place(
        store.x[index] ?? 0,
        store.y[index] ?? 0,
        size,
        size,
        store.rotation[index] ?? 0,
      );
    });
    for (let slot = used; slot < this.sprites.length; slot++) {
      const sprite = this.sprites[slot];
      if (sprite !== undefined) {
        sprite.visible = false;
      }
    }
  }

  private spriteAt(slot: number): FloorSprite {
    const existing = this.sprites[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorSprite();
    created.setTexture(this.texture);
    created.alpha = 0.7;
    this.sprites.push(created);
    this.group.add(created.mesh);
    return created;
  }

  destroy(): void {
    for (const sprite of this.sprites) {
      sprite.dispose();
    }
    this.group.removeFromParent();
  }
}
