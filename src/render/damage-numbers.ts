import { BitmapText, Container } from 'pixi.js';
import type { DamageNumberStore } from '../sim/particle/damage-numbers.js';
import { lerp } from '../sim/math.js';
import { UI_TEXT_HEIGHT } from './ui/text.js';

/**
 * Draws floating damage numbers.
 *
 * `BitmapText` rather than `Text`: a `Text` regenerates a texture whenever its
 * string changes, and these change every time one is reused. At a few dozen a
 * second that is a texture upload per number.
 *
 * `fontFamily` is passed in rather than reached for, because the two entry
 * points that have a renderer hand it the pixel font (#154) while the bench
 * scene — which has no renderer to build the font's atlas on, and is
 * measuring transform work rather than looks — keeps a system face.
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
      // The font's own cell size, so the pixel font draws 1:1 in world
      // units and its glyphs land on whole pixels once `WORLD_ZOOM` doubles
      // them — any other size resamples a bitmap font.
      style: { fontFamily: this.fontFamily, fontSize: UI_TEXT_HEIGHT },
    });
    created.anchor.set(0.5);
    this.labels.push(created);
    this.container.addChild(created);
    return created;
  }
}
