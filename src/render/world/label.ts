import type { BitmapText, Container } from '../gfx/index.js';

/**
 * A HUD label that follows a world point: shop prices, pickup names, damage
 * numbers. Text is a screen-space thing — it has to stay legible whatever
 * angle the floor is seen from — so it lives on the UI layer and is placed
 * each frame at the projection of the point it belongs to.
 */
export class WorldLabel {
  constructor(
    readonly text: BitmapText,
    layer: Container,
  ) {
    text.anchor.set(0.5, 1);
    text.visible = false;
    layer.addChild(text);
  }

  /** Places the label's bottom-centre at internal-frame pixels `(x, y)`. */
  place(x: number, y: number): void {
    this.text.position.set(Math.round(x), Math.round(y));
  }

  show(): void {
    this.text.visible = true;
  }

  hide(): void {
    this.text.visible = false;
  }

  set alpha(value: number) {
    this.text.alpha = value;
  }

  dispose(): void {
    this.text.destroy();
  }
}
