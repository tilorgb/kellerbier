import { Container } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { HUD_PALETTE } from './palette.js';
import { TextPlate } from './ui/text-plate.js';
import type { UiKit } from './ui/kit.js';

/**
 * Sperrstunde's clock (#507): the time left before closing, for a run with a
 * time limit (`GameSim.timeLeftTicks`). Hidden in every other run. Rebuilt
 * only when the shown second changes.
 */
export class RunTimerHud {
  readonly view = new Container();

  private readonly plate: TextPlate;
  private shownSeconds = -1;
  private centreX = 0;
  private top = 0;
  private locale: Locale;

  constructor(kit: UiKit, locale: Locale) {
    this.locale = locale;
    this.plate = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
    this.view.addChild(this.plate.view);
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    this.shownSeconds = -1;
  }

  sync(sim: GameSim): void {
    const left = sim.timeLeftTicks;
    if (left === null) {
      this.plate.visible = false;
      this.shownSeconds = -1;
      return;
    }
    const seconds = Math.ceil(left / TICKS_PER_SECOND);
    if (seconds !== this.shownSeconds) {
      this.shownSeconds = seconds;
      const minutes = Math.floor(seconds / 60);
      const rest = String(seconds % 60).padStart(2, '0');
      this.plate.set(t(this.locale, 'ui.hud.closingTime', { time: `${String(minutes)}:${rest}` }));
      this.plate.place(this.centreX, this.top);
    }
    this.plate.visible = true;
  }

  /** Bottom centre — under the play area, clear of the HUD column and every centred banner above. */
  resize(width: number, height: number): void {
    this.centreX = Math.round(width / 2);
    this.top = Math.round(height * 0.92);
    this.plate.place(this.centreX, this.top);
  }
}
