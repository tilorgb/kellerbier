import type { Container } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { HUD_PALETTE } from './palette.js';
import { TextPlate } from './ui/text-plate.js';
import type { UiKit } from './ui/kit.js';

/**
 * Blutwurz (#84): a small persistent readout for as long as the spirit
 * walk is on — "if you can't see it, you can't tune it" (`CLAUDE.md`)
 * applies to the mode itself, not only to the numbers behind it, and a
 * sober run's own timer is deliberately invisible (see
 * `sim/systems/blutwurz.ts`'s doc comment), so this is the one thing that
 * says "you are doing this" regardless of which run it is.
 */
export class BlutwurzHud {
  private readonly plate: TextPlate;
  private locale: Locale;

  readonly view: Container;

  constructor(kit: UiKit, locale: Locale) {
    this.locale = locale;
    this.plate = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
    this.view = this.plate.view;
  }

  /** `sync` re-derives the label from `sim` each frame, so this only has to remember the new locale. */
  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  sync(sim: GameSim): void {
    if (!sim.blutwurzActive) {
      this.plate.visible = false;
      return;
    }
    this.plate.set(t(this.locale, 'ui.hud.blutwurzActive'));
    this.plate.visible = true;
  }

  place(centreX: number, top: number): void {
    this.plate.place(centreX, top);
  }
}
