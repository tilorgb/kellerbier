import { BitmapText, Container } from 'pixi.js';
import type { DamageNumberStore } from '../sim/particle/damage-numbers.js';
import { lerp } from '../sim/math.js';

/**
 * Draws floating damage numbers.
 *
 * `BitmapText` rather than `Text`: a `Text` regenerates a texture whenever its
 * string changes, and these change every time one is reused. At a few dozen a
 * second that is a texture upload per number.
 */
export class DamageNumberView {
  readonly container = new Container();

  private readonly store: DamageNumberStore;
  private readonly fontFamily: string;
  private readonly labels: BitmapText[] = [];

  constructor(store: DamageNumberStore, fontFamily: string) {
    this.store = store;
    this.fontFamily = fontFamily;
  }

  sync(alpha: number): void {
    const store = this.store;
    let used = 0;

    store.forEachLive((index) => {
      const label = this.labelAt(used);
      used += 1;

      const life = store.life[index] ?? 0;
      const maxLife = store.maxLife[index] ?? 1;
      const remaining = maxLife === 0 ? 0 : life / maxLife;

      label.visible = true;
      label.text = String(Math.round(store.amount[index] ?? 0));
      label.alpha = Math.min(1, remaining * 2);
      label.position.set(
        lerp(store.previousX[index] ?? 0, store.x[index] ?? 0, alpha),
        lerp(store.previousY[index] ?? 0, store.y[index] ?? 0, alpha),
      );
    });

    for (let slot = used; slot < this.labels.length; slot++) {
      const label = this.labels[slot];
      if (label !== undefined) {
        label.visible = false;
      }
    }
  }

  private labelAt(slot: number): BitmapText {
    const existing = this.labels[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new BitmapText({
      text: '',
      style: { fontFamily: this.fontFamily, fontSize: 10 },
    });
    created.anchor.set(0.5);
    this.labels.push(created);
    this.container.addChild(created);
    return created;
  }
}
