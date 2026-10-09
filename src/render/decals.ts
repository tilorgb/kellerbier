import { Group } from 'three';
import type { DecalKindId, DecalStore } from '../sim/particle/decals.js';
import { DECAL_ALPHA, type DecalArt } from './decal-art.js';
import { Texture } from './gfx/index.js';
import { FloorSprite, SPATTER_HEIGHT } from './world/flat.js';

const MIN_SIDE = 16;
const MAX_SIDE = 48;

/**
 * Splashes on the floor. Each decal is a flat quad lying where the store put
 * it, at the store's rotation and size, placed once — decals do not move, so
 * there is nothing to interpolate.
 */
export class DecalView {
  readonly group = new Group();

  private readonly store: DecalStore;
  private readonly art: DecalArt;
  private readonly fallback: Texture;
  private readonly sprites: FloorSprite[] = [];

  constructor(store: DecalStore, art: DecalArt) {
    this.store = store;
    this.art = art;
    this.fallback = art[0]?.[0] ?? Texture.EMPTY;
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
      // 16 units is the authored density (two pixels a unit) for the canvas;
      // only a body bigger than that stretches it.
      const side = Math.min(MAX_SIDE, Math.max(MIN_SIDE, (store.size[index] ?? 8) * 2.5));
      const kind = (store.kind[index] ?? 0) as DecalKindId;
      sprite.setTexture(this.art[kind]?.[store.variant[index] ?? 0] ?? this.fallback);
      sprite.alpha = DECAL_ALPHA[kind];
      sprite.place(
        store.x[index] ?? 0,
        store.y[index] ?? 0,
        side,
        side,
        store.rotation[index] ?? 0,
        SPATTER_HEIGHT,
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
    created.setTexture(this.fallback);
    // After the puddles, ice and streams it lies on: they are transparent and
    // share the decal's old height, so without this the two z-fight (and
    // sort by distance) and a splash on water flickers.
    created.mesh.renderOrder = 1;
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
