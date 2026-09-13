import { Container, Graphics, Sprite } from './gfx/index.js';
import { TITLE_PALETTE } from './palette.js';
import { ornamentTexture } from './ui/ornament.js';

/**
 * A bordered plate whose paper is the title screen's own Rautenmuster
 * wallpaper rather than a flat fill — every screen that used to wrap its
 * `Menu` in `UiKit`'s beveled `panelSprite` wraps it in this instead, so a
 * menu reads as the same kind of object as the title screen's own postcard,
 * not a HUD dialog dropped on top of one. The title screen itself needs no
 * instance of this: its menu column already sits on the screen's own
 * full-frame wallpaper, so wrapping it a second time would recreate exactly
 * the boxed-off look the redesign was for.
 *
 * Content is the caller's — this only owns the border and the paper behind
 * it, the same split `Postcard` makes between its frame and whatever the
 * caller puts inside. Every consumer here still positions its own labels and
 * `Menu` in absolute screen coordinates rather than through this class,
 * exactly as they positioned them over the old `panelSprite`; this is a
 * background, not a layout container.
 */
export class PostcardPanel {
  readonly view = new Container();

  private readonly wallpaper = new Sprite();
  private readonly border = new Graphics();
  private width = 0;
  private height = 0;
  private wallpaperWidth = -1;
  private wallpaperHeight = -1;

  constructor() {
    this.view.addChild(this.wallpaper);
    this.view.addChild(this.border);
  }

  /** Call whenever the panel's own box changes. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.layOut();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private layOut(): void {
    const { width, height } = this;
    if (width <= 0 || height <= 0) {
      return;
    }

    if (width !== this.wallpaperWidth || height !== this.wallpaperHeight) {
      const previous = this.wallpaper.texture;
      this.wallpaper.texture = ornamentTexture(width, height);
      this.wallpaper.width = width;
      this.wallpaper.height = height;
      if (previous.width > 1) {
        previous.destroy(true);
      }
      this.wallpaperWidth = width;
      this.wallpaperHeight = height;
    }

    const inset = 6;
    this.border.clear();
    this.border
      .rect(inset, inset, width - inset * 2, 2)
      .rect(inset, height - inset - 2, width - inset * 2, 2)
      .rect(inset, inset, 2, height - inset * 2)
      .rect(width - inset - 2, inset, 2, height - inset * 2)
      .fill({ color: TITLE_PALETTE.rule });
  }
}
