import { Container } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import type { Locale } from '../i18n/locale.js';
import { t, type DictKey } from '../i18n/translate.js';
import { HUD_PALETTE } from './palette.js';
import { TextPlate } from './ui/text-plate.js';
import type { UiKit } from './ui/kit.js';

/**
 * A floor's curse (#49): the entry announcement, a fading banner
 * (`sim.curseAnnouncement`, aged by `curseAnnounceTicks`).
 */
export class CurseHud {
  readonly view = new Container();

  private readonly announcement: TextPlate;
  private announcementLabel = '';
  private locale: Locale;

  constructor(kit: UiKit, locale: Locale) {
    this.locale = locale;
    this.announcement = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
    this.view.addChild(this.announcement.view);
  }

  /** `sync` re-derives every label from `sim` each frame, so this only has to remember the new locale. */
  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  sync(sim: GameSim): void {
    const locale = this.locale;
    const announced = sim.curseAnnouncement;
    if (announced !== null) {
      const label = `${announced.name} — ${t(locale, announced.description as DictKey)}`;
      if (label !== this.announcementLabel) {
        this.announcementLabel = label;
        this.announcement.set(label);
      }
      this.announcement.visible = true;
    } else {
      this.announcement.visible = false;
      this.announcementLabel = '';
    }
  }

  /** Centres the announcement banner near the top of the screen. */
  resize(width: number, height: number): void {
    this.announcement.place(Math.round(width / 2), Math.round(height * 0.1));
  }
}
