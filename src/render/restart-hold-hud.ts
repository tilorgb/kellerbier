import { Container, Graphics } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { HUD_PALETTE } from './palette.js';
import { TextPlate } from './ui/text-plate.js';
import type { UiKit } from './ui/kit.js';

const BAR_HEIGHT = 2;
const BAR_GAP = 3;

/**
 * Holding R to restart (#521): "Restarting…" with a bar that fills over the
 * hold, so a restart is never an accident and never a surprise. Hidden while
 * R is not held.
 */
export class RestartHoldHud {
  readonly view = new Container();

  private readonly plate: TextPlate;
  private readonly bar = new Graphics();
  private progress = 0;
  private centreX = 0;
  private top = 0;

  constructor(kit: UiKit, locale: Locale) {
    this.plate = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
    this.plate.set(t(locale, 'ui.hud.restartHold'));
    this.plate.visible = true;
    this.view.addChild(this.plate.view);
    this.view.addChild(this.bar);
    this.view.visible = false;
  }

  setLocale(locale: Locale): void {
    this.plate.set(t(locale, 'ui.hud.restartHold'));
    this.layOut();
  }

  /** The hold's progress, `0`–`1`; `0` hides it. */
  set(progress: number): void {
    if (progress === this.progress) {
      return;
    }
    this.progress = progress;
    this.view.visible = progress > 0;
    this.drawBar();
  }

  /** Centred, a little below the middle — over the room, clear of the HUD column. */
  resize(width: number, height: number): void {
    this.centreX = Math.round(width / 2);
    this.top = Math.round(height * 0.6);
    this.layOut();
  }

  private layOut(): void {
    this.plate.place(this.centreX, this.top);
    this.drawBar();
  }

  private drawBar(): void {
    const width = this.plate.width;
    const left = Math.round(this.centreX - width / 2);
    const y = this.top + this.plate.height + BAR_GAP;
    this.bar.clear();
    this.bar
      .rect(left, y, Math.round(width * this.progress), BAR_HEIGHT)
      .fill({ color: HUD_PALETTE.toastText });
  }
}
