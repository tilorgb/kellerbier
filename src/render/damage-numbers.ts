import type { DamageNumberStore } from '../sim/particle/damage-numbers.js';
import { lerp } from '../sim/math.js';
import type { BitmapText, Container } from './gfx/index.js';
import { WorldLabel } from './world/label.js';

/**
 * Floating damage numbers.
 *
 * Text is screen-space — it must stay upright and legible from any camera
 * angle — so each number is a HUD label placed at the projection of the
 * world point the store gives it, a little above the floor so it floats over
 * the body it came off rather than through its feet.
 */
const NUMBER_HEIGHT = 10;

export class DamageNumberView {
  private readonly store: DamageNumberStore;
  private readonly labels: WorldLabel[] = [];

  constructor(
    store: DamageNumberStore,
    private readonly layer: Container,
    private readonly makeLabel: () => BitmapText,
  ) {
    this.store = store;
  }

  sync(
    alpha: number,
    project: (x: number, height: number, z: number, out: { x: number; y: number }) => void,
  ): void {
    const store = this.store;
    let used = 0;
    store.forEachLive((index) => {
      const label = this.labelAt(used);
      used += 1;
      const life = store.life[index] ?? 0;
      const maxLife = store.maxLife[index] ?? 1;
      const remaining = maxLife === 0 ? 0 : life / maxLife;
      label.text.text = String(Math.round(store.amount[index] ?? 0));
      label.alpha = Math.min(1, remaining * 2);
      project(
        lerp(store.previousX[index] ?? 0, store.x[index] ?? 0, alpha),
        NUMBER_HEIGHT,
        lerp(store.previousY[index] ?? 0, store.y[index] ?? 0, alpha),
        POINT,
      );
      label.place(POINT.x, POINT.y);
      label.show();
    });
    for (let slot = used; slot < this.labels.length; slot++) {
      this.labels[slot]?.hide();
    }
  }

  private labelAt(slot: number): WorldLabel {
    const existing = this.labels[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new WorldLabel(this.makeLabel(), this.layer);
    this.labels.push(created);
    return created;
  }

  destroy(): void {
    for (const label of this.labels) {
      label.dispose();
    }
  }
}

const POINT = { x: 0, y: 0 };
